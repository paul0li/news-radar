# 📡 Pauta editorial

Primer módulo de **news-radar**. Pegas los ~40 links del día
(título + link, en cualquier formato) y Claude los ordena **intercalando notas graciosas y serias**
para que la audiencia no abandone la transmisión. Devuelve la lista con links que se abren en una pestaña nueva.

- Un solo HTML sin librerías + un servidor Node **sin dependencias**.
- Usa **Claude Code** (`claude -p`) con tu suscripción: no necesita API key. Es para uso personal.
- Claude solo devuelve **ids**, tono y motivo: los links salen de tu lista original, así que nunca inventa ni altera URLs.
  Si omite o duplica alguno, el servidor lo corrige (los faltantes van al final).

## Correr local

Requiere Node ≥ 20 y Claude Code instalado y con sesión iniciada (`claude` funcionando en la terminal).

```bash
npm run dev            # http://localhost:3000
```

## Deploy (instancia Hermes o cualquier VPS)

En el servidor, con Node ≥ 20 y Claude Code instalado:

```bash
claude setup-token     # genera un token de tu suscripción (válido ~1 año)
git clone https://github.com/paul0li/news-radar.git && cd news-radar/pauta
CLAUDE_CODE_OAUTH_TOKEN=... APP_PASSWORD=algo node server.js
```

Si en esa máquina ya hiciste `claude` → login, no necesitas el token.

O con Docker (trae Claude Code incluido):

```bash
docker build -t pauta .
docker run -d --restart unless-stopped -p 3000:3000 \
  -e CLAUDE_CODE_OAUTH_TOKEN=... -e APP_PASSWORD=algo pauta
```

### Hermes (instalación actual)

**https://news-radar.paul0li.tech**: nginx + certbot → `127.0.0.1:3010`, servicio systemd
[`deploy/pauta.service`](deploy/pauta.service), sitio [`deploy/nginx-news-radar.paul0li.tech.conf`](deploy/nginx-news-radar.paul0li.tech.conf).
Variables (token y clave incluidos) en `~/.config/pauta/pauta.env`, fuera de la repo.

```bash
rsync -a --delete --exclude node_modules --exclude .env pauta/ hermes-ts:news-radar/pauta/
ssh hermes-ts 'sudo systemctl restart pauta'
```

En otro servidor: ponle delante el reverse proxy que ya tenga la instancia (Caddy/nginx) para HTTPS. `GET /healthz` responde `ok` sin auth.

## Variables de entorno

| Variable | Default | Para qué |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | — | Token de `claude setup-token`. No hace falta si la máquina ya tiene sesión de Claude Code. |
| `APP_PASSWORD` | vacío | Si se define, el navegador pide clave (Basic Auth, cualquier usuario). Recomendado si queda expuesta: usa tu cuota de Claude. |
| `MODEL` | `opus` | Modelo para `claude --model` (`opus`, `sonnet`, `haiku` o un id completo). |
| `EFFORT` | `low` | `low`/`medium`/`high`. Ordenar 40 títulos no necesita más que `low`. |
| `CLAUDE_BIN` | `claude` | Ruta al ejecutable si no está en el `PATH`. |
| `PORT` | `3000` | |
| `HOST` | `0.0.0.0` | Interfaz donde escucha. En Hermes: la IP de Tailscale, para que solo se vea dentro de la tailnet. |

## Ajustar el criterio editorial

Las reglas (abrir con gancho, máx. 2 serios seguidos, no burlarse cerca de una tragedia, etc.) están en
`SYSTEM` dentro de [`server.js`](server.js). En la UI también hay un campo de "indicación extra" para el día.

## Tests

```bash
npm test
```
