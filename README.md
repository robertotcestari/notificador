# 🔔 Notificador de Releases do GitHub

Sistema automatizado que monitora releases de repositórios do GitHub e envia notificações por email quando uma nova versão é publicada.

## ✨ Funcionalidades

- 📧 Envia emails automáticos quando novos releases são publicados
- 🔄 Suporta múltiplos repositórios simultaneamente
- 📝 Arquivo de configuração JSON para fácil gerenciamento
- 🚀 Deploy simples com PM2 para execução contínua
- 💾 Mantém estado para evitar notificações duplicadas
- 🎯 Usa ETags do GitHub para economizar rate limits
- 🔌 Suporta Resend ou qualquer provedor SMTP

## 🚀 Quick Start

### 1. Instalar dependências

```bash
bun install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
nano .env
```

Preencha com suas credenciais:

```bash
MAIL_TO=seu-email@exemplo.com
MAIL_FROM=notificacoes@seudominio.com
RESEND_API_KEY=re_xxxxxxxxxx  # ou configure SMTP
GITHUB_TOKEN=ghp_xxxxxxxxxx   # opcional mas recomendado
```

### 3. Configurar repositórios

Edite `repos.config.json`:

```json
{
  "repos": [
    "vercel/next.js",
    "oven-sh/bun",
    "facebook/react",
    "seu-usuario/seu-repo"
  ]
}
```

### 4. Testar

```bash
# Teste sem enviar emails
bun run start:dry

# Executar uma vez
bun run start
```

## 📦 Scripts Disponíveis

```bash
bun run start         # Executa uma vez com os repos do config
bun run start:dry     # Executa em modo dry-run (não envia emails)
bun run check         # Mostra o help

# Scripts PM2
bun run pm2:start     # Inicia no PM2
bun run pm2:stop      # Para o processo
bun run pm2:restart   # Reinicia o processo
bun run pm2:logs      # Visualiza os logs
bun run pm2:status    # Mostra o status
```

## 🔧 Uso Avançado

### Via linha de comando

```bash
# Monitorar repos específicos
bun run src/cli.ts -r vercel/next.js -r oven-sh/bun

# Usar arquivo de configuração customizado
bun run src/cli.ts -c meus-repos.json

# Forçar re-envio (ignora estado)
bun run src/cli.ts -c repos.config.json --force

# Dry run (teste sem enviar)
bun run src/cli.ts -c repos.config.json --dry-run
```

## 🚀 Deploy no VPS com PM2

Este guia mostra como fazer deploy do notificador de releases no seu VPS usando PM2.

### 📋 Pré-requisitos

- VPS com Ubuntu/Debian (ou similar)
- Bun instalado no servidor
- PM2 instalado globalmente
- Acesso SSH ao servidor

### 🔧 Instalação no Servidor

#### 1. Instalar dependências no servidor (se necessário)

```bash
# Instalar Bun (se ainda não tiver)
curl -fsSL https://bun.sh/install | bash

# Instalar PM2 globalmente
npm install -g pm2
# ou
bun install -g pm2
```

#### 2. Clonar/Enviar o projeto para o VPS

```bash
# No seu computador local, envie os arquivos para o servidor
scp -r /caminho/do/projeto user@seu-vps:/home/user/notificador

# Ou clone diretamente no servidor
ssh user@seu-vps
cd ~
git clone seu-repositorio.git notificador
cd notificador
```

#### 3. Configurar o projeto no servidor

```bash
# No servidor
cd ~/notificador

# Instalar dependências
bun install

# Copiar e configurar as variáveis de ambiente
cp .env.example .env
nano .env  # ou vim/vi
# Preencha com suas credenciais reais
```

#### 4. Configurar os repositórios a monitorar

Edite o arquivo `repos.config.json`:

```bash
nano repos.config.json
```

Adicione os repositórios que deseja monitorar:

```json
{
  "repos": [
    "vercel/next.js",
    "oven-sh/bun",
    "facebook/react",
    "seu-usuario/seu-repo"
  ]
}
```

#### 5. Criar diretório de logs

```bash
mkdir -p logs
```

### 🎯 Iniciar com PM2

#### Iniciar o aplicativo

```bash
pm2 start ecosystem.config.cjs
```

#### Verificar status

```bash
pm2 status
pm2 logs notificador-releases
```

#### Configurar PM2 para iniciar no boot

```bash
pm2 startup
pm2 save
```

### 📊 Comandos úteis do PM2

```bash
# Ver logs em tempo real
pm2 logs notificador-releases

# Ver logs dos últimos erros
pm2 logs notificador-releases --err

# Ver informações detalhadas
pm2 info notificador-releases

# Reiniciar
pm2 restart notificador-releases

# Parar
pm2 stop notificador-releases

# Remover do PM2
pm2 delete notificador-releases

# Ver monitoramento
pm2 monit
```

### ⚙️ Configurações do PM2

O arquivo `ecosystem.config.cjs` está configurado para:

- ✅ Rodar **a cada 1 minuto** (cron: `*/1 * * * *`)
- ✅ Usar **Bun** como runtime
- ✅ **Não reiniciar** automaticamente em caso de crash (autorestart: false)
- ✅ Salvar logs em `./logs/`
- ✅ Limitar memória a 200MB

#### Alterar frequência de execução

Para mudar de 60 segundos para outro intervalo, edite `ecosystem.config.cjs`:

```javascript
cron_restart: '*/1 * * * *',  // A cada 1 minuto
// ou
cron_restart: '*/5 * * * *',  // A cada 5 minutos
// ou
cron_restart: '0 * * * *',    // A cada hora
```

Formato cron: `minuto hora dia mês dia-da-semana`

### 🧪 Testar antes de colocar no PM2

Execute manualmente primeiro para garantir que tudo funciona:

```bash
# Teste com dry-run (não envia emails)
bun run start:dry

# Ou rode diretamente
bun run src/cli.ts --repo vercel/next.js --dry-run
```

### 🔄 Atualizar o aplicativo

```bash
# No servidor
cd ~/notificador
git pull  # se estiver usando git
bun install  # se houver novas dependências
pm2 restart notificador-releases
```

### 📝 Estrutura de arquivos

```
notificador/
├── ecosystem.config.cjs    # Configuração do PM2
├── repos.config.json       # Lista de repos a monitorar
├── .env                    # Variáveis de ambiente (NÃO COMMITAR)
├── state.json              # Estado dos repos (criado automaticamente)
├── logs/                   # Logs do PM2
│   ├── error.log
│   └── out.log
└── src/
    └── cli.ts              # Código principal
```

### 🐛 Troubleshooting

#### Processo não inicia

```bash
# Verifique os logs de erro
pm2 logs notificador-releases --err

# Teste o comando manualmente
cd ~/notificador
bun run src/cli.ts --repo vercel/next.js --dry-run
```

#### Não recebe emails

1. Verifique as variáveis de ambiente no `.env`
2. Teste o envio manual com `--force --dry-run`
3. Verifique os logs de erro

#### Rate limit do GitHub

- Configure `GITHUB_TOKEN` no `.env` para aumentar o rate limit de 60 para 5000 req/hora

### 🎉 Pronto!

Seu notificador agora está rodando em produção e vai checar novos releases a cada minuto! 🚀

## 📧 Provedores de Email Suportados

### Resend (recomendado)

```bash
RESEND_API_KEY=re_xxxxxxxxxx
```

### SMTP (Gmail, Outlook, etc)

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu-email@gmail.com
SMTP_PASS=sua-senha-de-app
```

## 🔑 GitHub Token (Opcional)

Sem token: 60 requisições/hora  
Com token: 5000 requisições/hora

[Criar token](https://github.com/settings/tokens) com escopo `public_repo` (read-only).

## 📁 Estrutura do Projeto

```
notificador/
├── src/
│   └── cli.ts                 # Código principal
├── ecosystem.config.cjs       # Configuração PM2
├── repos.config.json          # Lista de repos
├── .env                       # Variáveis de ambiente
├── .env.example               # Template do .env
├── state.json                 # Estado dos repos (auto-gerado)
├── package.json               # Dependências e scripts
└── README.md                  # Este arquivo
```

## 🐛 Troubleshooting

### Não recebo emails

1. Verifique o `.env` (credenciais corretas?)
2. Teste com `--dry-run --force`
3. Verifique os logs: `pm2 logs notificador-releases`

### Rate limit do GitHub

- Configure `GITHUB_TOKEN` no `.env`
- Reduza a frequência no `ecosystem.config.cjs`

### Emails duplicados

O arquivo `state.json` mantém controle. Se deletá-lo, todos os releases serão re-enviados.

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📝 Licença

MIT

## 🎯 Casos de Uso

- Monitorar dependências do seu projeto
- Acompanhar frameworks favoritos
- Receber avisos de bibliotecas críticas
- Manter equipe informada sobre atualizações

---

**Desenvolvido com ❤️ usando Bun**
