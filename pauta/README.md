# 📡 Pauta editorial

A tiny web app for live-stream hosts who comment on links. Paste the day's list (~40 links from news
sites, social media, videos; title + URL in almost any format) and Claude returns a running order that
**alternates funny and serious stories** so viewers don't drop off. Every link opens in a new tab.

- One HTML file with no libraries, plus a Node server with **zero dependencies**.
- Calls **Claude Code** in headless mode (`claude -p`), so it runs on your Claude subscription with no
  API key. It is meant for personal use.
- Claude only returns **ids**, a tone and a one-line reason. URLs always come from your original list,
  so they can never be invented or altered. Missing or duplicated ids are fixed server-side
  (anything missing goes at the end).

> The UI and the editorial prompt are in Spanish, since the app was built for a Chilean stream.

## Run locally

Requires Node ≥ 20 and [Claude Code](https://code.claude.com) installed and logged in.

```bash
npm run dev            # http://localhost:3000
```

## Deploy

On any Linux server with Node ≥ 20 and Claude Code installed:

```bash
claude setup-token     # creates a long-lived token for your subscription
git clone https://github.com/paul0li/news-radar.git && cd news-radar/pauta
CLAUDE_CODE_OAUTH_TOKEN=... APP_PASSWORD=change-me node server.js
```

If you already ran `claude` and logged in on that machine, you can skip the token.

Or with Docker (Claude Code is installed in the image):

```bash
docker build -t pauta .
docker run -d --restart unless-stopped -p 3000:3000 \
  -e CLAUDE_CODE_OAUTH_TOKEN=... -e APP_PASSWORD=change-me pauta
```

`GET /healthz` returns `ok` without auth.

### Private deploy with Tailscale and auto-deploy

This is how the reference instance runs. It is only reachable from devices on the owner's tailnet,
so it needs no password:

1. Run the app as a systemd service bound to localhost: [`deploy/pauta.service`](deploy/pauta.service),
   with its variables (`HOST=127.0.0.1`, `PORT=3010`, the token) in an env file outside the repo.
2. Expose it to the tailnet over HTTPS (certificate handled by Tailscale, persists across reboots):
   ```bash
   sudo tailscale serve --bg --https=443 http://127.0.0.1:3010
   ```
3. Deploy whatever lands on `main`: a cron job runs [`deploy/autodeploy.sh`](deploy/autodeploy.sh)
   every minute. When `origin/main` moves, it resets the checkout, updates the systemd unit if it
   changed, restarts the service and checks `/healthz`. A failed deploy is retried on the next run.
   ```cron
   * * * * * /path/to/news-radar/pauta/deploy/autodeploy.sh >> ~/news-radar-deploy.log 2>&1
   ```
   Pause it with `touch ~/.news-radar-autodeploy-paused`. Adjust the paths at the top of the
   script and in the unit file to match your server.

To expose it publicly instead, put a reverse proxy with HTTPS (nginx, Caddy) in front and set
`APP_PASSWORD`, since every request spends your Claude usage.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | — | Token from `claude setup-token`. Not needed if the machine already has a Claude Code login. |
| `APP_PASSWORD` | empty | When set, the browser asks for a password (Basic Auth, any username). Recommended for public deployments. |
| `MODEL` | `opus` | Passed to `claude --model` (`opus`, `sonnet`, `haiku` or a full model id). |
| `EFFORT` | `low` | `low` / `medium` / `high`. Ordering ~40 titles doesn't need more than `low`. |
| `CLAUDE_BIN` | `claude` | Path to the Claude Code binary if it isn't on `PATH`. |
| `HOST` | `0.0.0.0` | Interface to listen on. Use `127.0.0.1` behind a proxy or `tailscale serve`. |
| `PORT` | `3000` | |

## Tuning the editorial rules

The rules (open with a hook, never more than two serious stories in a row, no jokes right next to a
tragedy, and so on) live in the `SYSTEM` prompt in [`server.js`](server.js). The UI also has an
optional "extra instruction" field for the day.

## Tests

```bash
npm test
```
