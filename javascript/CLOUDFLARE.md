## Cloudflare Worker checklist

Use `worker.js` as the Worker entrypoint. Do not use `remindtel.js`; that old file was the Node.js version and depended on `better-sqlite3`/`process.env`.

Required bindings/secrets:

- D1 binding: `DB`
- Secret: `TELEGRAM_BOT_TOKEN`
- Optional secret: `OPENAI_API_KEY`
- Optional secret: `WEBHOOK_SECRET`
- Variable: `ADMINS`
- Variable: `OPENAI_MODEL`
- Variable: `TIMEZONE_OFFSET_MINUTES`
- Optional variable: `BOT_INFO`

Cron Trigger: `* * * * *`

The Worker exposes `GET /` for a health check and accepts Telegram webhook POSTs at `/`.
