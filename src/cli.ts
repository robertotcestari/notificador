#!/usr/bin/env bun
import { parseArgs } from 'util';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { z } from 'zod';

type RepoKey = `${string}/${string}`;

type Release = {
  id: number;
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string;
  body?: string | null;
  author?: { login?: string };
};

type RepoState = {
  etag?: string;
  lastReleaseId?: number;
  lastTag?: string;
  lastPublishedAt?: string;
  lastCheckedAt?: string;
};

type StateFile = { repos: Record<RepoKey, RepoState> };

const GITHUB_API_VERSION = '2022-11-28';
const DEFAULT_STATE = './state.json';

const envSchema = z.object({
  GITHUB_TOKEN: z.string().trim().min(1).optional(),
  MAIL_TO: z.string().min(1),
  MAIL_FROM: z.string().min(1),
  RESEND_API_KEY: z.string().min(1).optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z.coerce.boolean().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
});

const args = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    repo: { type: 'string', multiple: true, short: 'r' },
    'config-file': { type: 'string', short: 'c' },
    'state-file': { type: 'string' },
    'dry-run': { type: 'boolean' },
    force: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
  strict: true,
  allowPositionals: false,
});

const HELP_MESSAGE = `
ghrelease - send email when a GitHub repository publishes a new release

Usage:
  bun run src/cli.ts --repo owner/name [--repo owner2/name2 ...] [--state-file path] [--dry-run] [--force]
  bun run src/cli.ts --config-file repos.config.json [--state-file path] [--dry-run] [--force]

Examples:
  bun run src/cli.ts -r vercel/next.js -r oven-sh/bun
  bun run src/cli.ts -r owner/project --state-file /var/lib/ghrelease/state.json
  bun run src/cli.ts -c repos.config.json

Required env vars:
  MAIL_TO, MAIL_FROM
Email provider (choose one): RESEND_API_KEY or SMTP_HOST/PORT/SECURE/USER/PASS
Optional: GITHUB_TOKEN (higher rate limit and 304 responses do not count)
`;

if (args.values.help) {
  console.log(`\n${HELP_MESSAGE}`);
  process.exit(0);
}

if (!args.values.repo?.length && !args.values['config-file']) {
  console.log(`\n${HELP_MESSAGE}`);
  process.exit(1);
}

async function ensureDir(path: string) {
  await fs.mkdir(path, { recursive: true });
}

async function readState(filePath: string): Promise<StateFile> {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data) as StateFile;
  } catch {
    return { repos: {} };
  }
}

async function writeState(filePath: string, state: StateFile) {
  await ensureDir(dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(state, null, 2) + '\n');
}

function parseRepo(input: string): RepoKey {
  const [owner, repo] = input.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid repo: ${input}. Expected owner/name.`);
  }
  return `${owner}/${repo}`;
}

function listifyTo(to: string): string[] {
  return to
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function truncate(value: string | null | undefined, max = 800): string {
  if (!value) return '';
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function formatGithubAuthorization(token: string): string {
  const trimmed = token.trim();
  const patPrefixes = ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_'];
  if (patPrefixes.some((prefix) => trimmed.startsWith(prefix))) {
    return `token ${trimmed}`;
  }
  return `Bearer ${trimmed}`;
}

type FetchResult =
  | { status: 'not_modified' }
  | { status: 'no_releases' }
  | { status: 'ok'; release: Release; etag?: string };

async function fetchLatestRelease(
  repo: RepoKey,
  token?: string,
  etag?: string
): Promise<FetchResult> {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    'User-Agent': 'ghrelease-cli',
  };
  if (token) headers.Authorization = formatGithubAuthorization(token);
  if (etag && !args.values.force) headers['If-None-Match'] = etag;

  const resp = await fetch(url, { headers });

  if (resp.status === 304) {
    return { status: 'not_modified' };
  }
  if (resp.status === 404) {
    return { status: 'no_releases' };
  }
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`GitHub API ${resp.status} for ${url}: ${body}`);
  }

  const data = (await resp.json()) as Release;
  const newEtag = resp.headers.get('etag') ?? undefined;
  return { status: 'ok', release: data, etag: newEtag };
}

type MailInput = {
  to: string[];
  from: string;
  subject: string;
  html: string;
  text?: string;
};

async function sendEmail(input: MailInput) {
  const { RESEND_API_KEY, SMTP_HOST } = Bun.env;

  if (RESEND_API_KEY) {
    const { Resend } = await import('resend');
    const resend = new Resend(RESEND_API_KEY);
    const res = await resend.emails.send({
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (res.error) {
      throw new Error(`Resend error: ${res.error.message}`);
    }
    return;
  }

  if (SMTP_HOST) {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: Bun.env.SMTP_HOST,
      port: Bun.env.SMTP_PORT ? Number(Bun.env.SMTP_PORT) : 587,
      secure: String(Bun.env.SMTP_SECURE ?? '').toLowerCase() === 'true',
      auth:
        Bun.env.SMTP_USER && Bun.env.SMTP_PASS
          ? { user: Bun.env.SMTP_USER, pass: Bun.env.SMTP_PASS }
          : undefined,
    });
    await transporter.sendMail({
      from: input.from,
      to: input.to.join(', '),
      subject: input.subject,
      html: input.html,
      text: input.text ?? stripHtml(input.html),
    });
    return;
  }

  throw new Error(
    'No email provider configured. Set RESEND_API_KEY or SMTP_* env vars.'
  );
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, '');
}

function renderEmail(repo: RepoKey, release: Release) {
  const title = release.name || release.tag_name;
  const author = release.author?.login ? ` by ${release.author.login}` : '';
  const text = [
    `New release in ${repo}: ${title}${author}`,
    `Tag: ${release.tag_name}`,
    `Published: ${release.published_at}`,
    `URL: ${release.html_url}`,
    '',
    truncate(release.body ?? '', 1500),
  ].join('\n');

  const html = `
  <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;line-height:1.45">
    <h2 style="margin:0 0 8px">New release in <code>${repo}</code></h2>
    <p style="margin:0 0 8px"><strong>${escapeHtml(title)}</strong>${author}</p>
    <p style="margin:0 0 6px">Tag: <code>${release.tag_name}</code></p>
    <p style="margin:0 0 6px">Published: ${new Date(
      release.published_at
    ).toLocaleString()}</p>
    <p style="margin:0 0 12px"><a href="${release.html_url}">${
    release.html_url
  }</a></p>
    ${
      release.body
        ? `<pre style="white-space:pre-wrap;background:#f6f8fa;padding:12px;border-radius:6px;border:1px solid #eaecef">${escapeHtml(
            truncate(release.body, 4000)
          )}</pre>`
        : ''
    }
    <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
    <p style="color:#666">Sent by ghrelease</p>
  </div>`.trim();

  return { subject: `New release: ${repo} ${title}`, html, text };
}

function escapeHtml(value: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (char) => map[char]!);
}

async function loadReposFromConfig(filePath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const config = JSON.parse(content) as { repos: string[] };
    if (!Array.isArray(config.repos)) {
      throw new Error('Config file must have a "repos" array');
    }
    return config.repos;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load config file ${filePath}: ${message}`);
  }
}

(async () => {
  const env = envSchema.safeParse(Bun.env);
  if (!env.success) {
    console.error('Invalid environment variables:');
    console.error(env.error.flatten().fieldErrors);
    process.exit(1);
  }

  // Load repos from CLI args or config file
  let repoList: string[] = args.values.repo ?? [];
  if (args.values['config-file']) {
    const configRepos = await loadReposFromConfig(args.values['config-file']);
    repoList = [...repoList, ...configRepos];
  }

  const repos = repoList.map(parseRepo);
  const stateFile = args.values['state-file'] ?? DEFAULT_STATE;
  const dry = Boolean(args.values['dry-run']);

  const state = await readState(stateFile);
  let changed = 0;

  for (const repo of repos) {
    const repoState = state.repos[repo] ?? {};
    try {
      const result = await fetchLatestRelease(
        repo,
        env.data.GITHUB_TOKEN,
        repoState.etag
      );
      if (result.status === 'not_modified') {
        console.log(`= ${repo}: no changes (304)`);
        state.repos[repo] = {
          ...repoState,
          lastCheckedAt: new Date().toISOString(),
        };
        continue;
      }
      if (result.status === 'no_releases') {
        console.log(`~ ${repo}: no published releases`);
        state.repos[repo] = {
          ...repoState,
          lastCheckedAt: new Date().toISOString(),
        };
        continue;
      }

      const { release, etag } = result;
      const isNew =
        repoState.lastReleaseId !== release.id ||
        repoState.lastTag !== release.tag_name ||
        Boolean(args.values.force);

      if (!isNew) {
        console.log(
          `= ${repo}: already tracked ${release.tag_name} (#${release.id})`
        );
        state.repos[repo] = {
          ...repoState,
          etag: etag ?? repoState.etag,
          lastCheckedAt: new Date().toISOString(),
        };
        continue;
      }

      const mail = renderEmail(repo, release);
      const to = listifyTo(env.data.MAIL_TO);
      const from = env.data.MAIL_FROM;

      if (dry) {
        console.log(`DRY-RUN ${repo}: would send email`, {
          to,
          subject: mail.subject,
        });
      } else {
        await sendEmail({
          to,
          from,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
        console.log(`✅ ${repo}: email sent (${release.tag_name})`);
      }

      state.repos[repo] = {
        etag,
        lastReleaseId: release.id,
        lastTag: release.tag_name,
        lastPublishedAt: release.published_at,
        lastCheckedAt: new Date().toISOString(),
      };
      changed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❗ ${repo}: error ${message}`);
      state.repos[repo] = {
        ...repoState,
        lastCheckedAt: new Date().toISOString(),
      };
    }
  }

  await writeState(stateFile, state);
  console.log(`Done. ${changed} repository(ies) with new release.`);
})();
