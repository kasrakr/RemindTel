# RemindTel — Cloudflare Workers

This folder is the Cloudflare Workers version of RemindTel.

## What changed

- `better-sqlite3` was removed. Reminders/users are stored in Cloudflare D1.
- `process.env` was removed. Worker variables are read from the `env` binding.
- Long polling and `bot.start()` were removed. Telegram updates arrive through a webhook.
- In-memory `setTimeout` scheduling was removed. A Cron Trigger checks D1 every minute and sends due reminders.
- The Persian parser remains in the Worker and the LLM fallback uses `fetch()`.

## Files

- `worker.js` — complete single-file Worker
- `schema.sql` — D1 schema
- `wrangler.toml` — Worker, D1, variables and Cron configuration
- `package.json` — grammY + Wrangler

## Cloudflare setup

1. Create a D1 database named `remindtel-db`.
2. Put its database ID into `wrangler.toml` in `database_id`.
3. Apply `schema.sql` to the D1 database, for example with Wrangler:

```bash
npx wrangler d1 execute remindtel-db --remote --file=./schema.sql
```

4. Set Worker secrets:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put OPENAI_API_KEY
```

`OPENAI_API_KEY` is optional. The Worker works without it, but the LLM fallback will be disabled.

5. Edit `ADMINS` and `TIMEZONE_OFFSET_MINUTES` in `wrangler.toml`.

`TIMEZONE_OFFSET_MINUTES = "210"` is Iran Standard Time (UTC+3:30). Change it when your bot should use another timezone.

6. Deploy:

```bash
npm install
npx wrangler deploy
```

7. Set the Telegram webhook to the deployed Worker URL:

```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<YOUR_WORKER>.workers.dev/
```

For additional protection, set `WEBHOOK_SECRET` as a Worker secret and configure the same secret when creating the Telegram webhook.

## Local cron testing

Cloudflare Workers supports testing scheduled handlers locally. With Wrangler dev, use the scheduled test endpoint to trigger the Cron handler.

The production Cron Trigger is configured as:

```toml
[triggers]
crons = ["* * * * *"]
```
