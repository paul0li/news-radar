# 📡 Pauta editorial

Primer módulo de **news-radar**. Pegas los ~40 links del día
(título + link, en cualquier formato) y Claude los ordena **intercalando notas graciosas y serias**
para que la audiencia no abandone la transmisión. Devuelve la lista con links que se abren en una pestaña nueva.

- Un solo HTML sin dependencias + un servidor Node con una sola dependencia (`@anthropic-ai/sdk`).
- La API key vive solo en el servidor; el navegador nunca la ve.
- El modelo solo devuelve **ids**, tono y motivo: los links salen de tu lista original, así que nunca inventa ni altera URLs.
  Si omite o duplica alguno, el servidor lo corrige (los faltantes van al final).

## Correr local

```bash
cp .env.example .env   # y pon tu ANTHROPIC_API_KEY
npm install
npm run dev            # http://localhost:3000
```

## Deploy (instancia Hermes o cualquier VPS)

Con Node ≥ 20:

```bash
git clone https://github.com/paul0li/news-radar.git && cd news-radar/pauta
npm ci --omit=dev
ANTHROPIC_API_KEY=sk-ant-... APP_PASSWORD=algo node server.js
```

O con Docker:

```bash
docker build -t pauta .
docker run -d --restart unless-stopped -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-... -e APP_PASSWORD=algo pauta
```

Ponle delante el reverse proxy que ya tenga la instancia (Caddy/nginx) para HTTPS. `GET /healthz` responde `ok` sin auth.

## Variables de entorno

| Variable | Default | Para qué |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Obligatoria. |
| `APP_PASSWORD` | vacío | Si se define, el navegador pide clave (Basic Auth, cualquier usuario). Recomendado si queda pública: cada uso gasta tokens. |
| `MODEL` | `claude-opus-5-5` | Modelo de Claude. |
| `EFFORT` | `low` | `low`/`medium`/`high`. Ordenar 40 títulos no necesita más que `low`. |
| `PORT` | `3000` | |

## Ajustar el criterio editorial

Las reglas (abrir con gancho, máx. 2 serios seguidos, no burlarse cerca de una tragedia, etc.) están en
`SYSTEM` dentro de [`server.js`](server.js). En la UI también hay un campo de "indicación extra" para el día.

## Tests

```bash
npm test
```
