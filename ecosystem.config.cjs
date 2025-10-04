module.exports = {
  apps: [
    {
      name: 'notificador-releases',
      script: 'bun',
      args: 'run src/cli.ts --config-file repos.config.json',
      interpreter: 'none',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      cron_restart: '*/3 * * * *', // A cada 3 minutos
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // PM2 vai ler o .env automaticamente se existir
    },
  ],
};
