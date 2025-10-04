#!/usr/bin/env bun
import { $ } from 'bun';
import { existsSync } from 'fs';
import { join } from 'path';

const SSH_TARGET = 'robertotcestari@64.176.5.254';
const REMOTE_PATH = '/opt/notificador';

const FILES_TO_DEPLOY = [
  'src/',
  'package.json',
  'bun.lockb',
  'bunfig.toml',
  'tsconfig.json',
  'ecosystem.config.cjs',
  'repos.config.json',
  '.env.example',
  'README.md',
];

console.log('🚀 Deploy e Setup Completo - VPS 64.176.5.254\n');

try {
  // 1. Criar diretório remoto (sem sudo)
  console.log('📁 Criando diretório no servidor...');
  await $`ssh ${SSH_TARGET} "mkdir -p ${REMOTE_PATH}"`;

  // 2. Enviar arquivos
  console.log('📤 Enviando arquivos...');
  for (const file of FILES_TO_DEPLOY) {
    if (existsSync(file)) {
      console.log(`  → ${file}`);
      await $`scp -r ${file} ${SSH_TARGET}:${REMOTE_PATH}/`;
    } else {
      console.warn(`  ⚠️  ${file} não encontrado, pulando...`);
    }
  }

  // 3. Setup remoto completo
  console.log('\n⚙️  Configurando no servidor...');
  const setupScript = `
cd ${REMOTE_PATH}

# Instalar dependências
echo "📦 Instalando dependências..."
bun install

# Criar diretório de logs
mkdir -p logs

# Copiar .env.example se .env não existir (NÃO sobrescreve!)
if [ ! -f .env ]; then
    echo "📝 Criando arquivo .env inicial..."
    cp .env.example .env
    ENV_CREATED=true
else
    echo "✅ .env já existe, mantendo configurações..."
    ENV_CREATED=false
fi

# Instalar e configurar PM2 log rotation (se não existir)
if ! pm2 list | grep -q "pm2-logrotate"; then
    echo "📋 Instalando PM2 log rotation..."
    pm2 install pm2-logrotate
    pm2 set pm2-logrotate:max_size 10M
    pm2 set pm2-logrotate:retain 30
    pm2 set pm2-logrotate:compress true
    pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
fi

# Verificar se PM2 está rodando o processo
if pm2 list | grep -q "notificador-releases"; then
    echo "🔄 PM2 já está rodando, reiniciando..."
    pm2 restart notificador-releases
else
    echo "🚀 Iniciando PM2 pela primeira vez..."
    pm2 start ecosystem.config.cjs
    pm2 save
fi

echo ""
echo "✅ Deploy concluído!"

# Retornar se .env foi criado
if [ "\$ENV_CREATED" = "true" ]; then
    echo "ENV_NEEDS_CONFIG"
fi
`;

  const setupResult = await $`ssh ${SSH_TARGET} ${setupScript}`.text();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 Deploy completo!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Mostrar próximos passos apenas se .env foi criado
  if (setupResult.includes('ENV_NEEDS_CONFIG')) {
    console.log('⚠️  PRIMEIRO DEPLOY - Configure o .env:\n');
    console.log('   ssh robertotcestari@64.176.5.254');
    console.log('   cd /opt/notificador');
    console.log(
      '   nano .env  # Preencha: MAIL_TO, MAIL_FROM, RESEND_API_KEY, GITHUB_TOKEN'
    );
    console.log('   pm2 restart notificador-releases\n');
  } else {
    console.log('✅ Aplicação atualizada e reiniciada!');
    console.log('📊 Monitore: pm2 logs notificador-releases\n');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
} catch (error) {
  console.error('\n❌ Erro durante o deploy:', error);
  process.exit(1);
}
