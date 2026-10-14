// Pauta editorial: ordena la pauta del día intercalando notas graciosas y serias.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { parseLinks } from "./parse.js";

const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.MODEL || "opus";
const EFFORT = process.env.EFFORT || "low";
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const TIMEOUT_MS = 180_000;
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const MAX_BODY = 200_000;

const SYSTEM = `Eres el editor de pauta de una transmisión en vivo donde se comentan links (noticias, redes sociales, videos).
Tu trabajo: ordenar los links para retener a la audiencia y que no abandone la transmisión.

Reglas:
- Clasifica cada link por tono: "gracioso" (humor, absurdo, viral liviano), "serio" (noticia dura, política, economía, tragedia) o "neutro" (curioso, interesante, ni chiste ni noticia dura).
- Intercala: nunca más de 2 serios seguidos; después de algo pesado, viene algo que alivie.
- Abre con un gancho fuerte (idealmente gracioso o muy llamativo) y cierra arriba, con algo memorable.
- Reparte lo mejor a lo largo de toda la pauta, no lo concentres al inicio.
- Agrupa temas relacionados solo si se potencian; evita repetir el mismo tema seguido.
- No cuentes chistes sobre tragedias: si hay una muerte o desgracia, no pongas inmediatamente antes algo burlón del mismo tema.
- Solo puedes usar los ids entregados. Incluye cada id exactamente una vez.
- "motivo": una frase muy corta (máx. 12 palabras) de por qué va en esa posición.`;

const SCHEMA = {
  type: "object",
  properties: {
    orden: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          tono: { type: "string", enum: ["gracioso", "serio", "neutro"] },
          motivo: { type: "string" },
        },
        required: ["id", "tono", "motivo"],
        additionalProperties: false,
      },
    },
  },
  required: ["orden"],
  additionalProperties: false,
};

// Llama a Claude Code en modo headless (`claude -p`), usando la sesión/suscripción de la máquina.
function runClaude(prompt) {
  const args = [
    "-p",
    "--output-format", "json",
    "--json-schema", JSON.stringify(SCHEMA),
    "--system-prompt", SYSTEM,
    "--model", MODEL,
    "--effort", EFFORT,
    "--tools", "",
    "--setting-sources", "",
    "--strict-mcp-config",
    "--no-session-persistence",
  ];
  return new Promise((resolve, reject) => {
    // cwd temporal para que no cargue CLAUDE.md ni configuración de ningún proyecto.
    const child = spawn(CLAUDE_BIN, args, { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) =>
      reject(new Error(e.code === "ENOENT" ? `No encontré el comando "${CLAUDE_BIN}". ¿Está instalado Claude Code?` : e.message)),
    );
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (signal) return reject(new Error("Claude tardó demasiado en responder."));
      let data;
      try {
        data = JSON.parse(out);
      } catch {
        return reject(new Error((err || out || `claude terminó con código ${code}`).trim().slice(0, 500)));
      }
      if (data.is_error || !data.structured_output) {
        return reject(new Error(String(data.result || data.subtype || "Error de Claude Code").slice(0, 500)));
      }
      resolve(data.structured_output);
    });
    child.stdin.end(prompt);
  });
}

async function ordenar(items, criterio) {
  const lista = items.map((it) => `${it.id}. ${it.title} (${it.domain})`).join("\n");
  const extra = criterio ? `\n\nIndicación extra del editor para hoy: ${criterio}` : "";
  const { orden } = await runClaude(`Links de hoy (id. título (dominio)):\n${lista}${extra}`);
  return orden;
}

// Garantiza una permutación válida: descarta ids inventados/duplicados y agrega al final los que falten.
function reconciliar(items, orden) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const seen = new Set();
  const out = [];
  for (const o of orden) {
    const it = byId.get(o.id);
    if (!it || seen.has(o.id)) continue;
    seen.add(o.id);
    out.push({ ...it, tono: o.tono, motivo: o.motivo });
  }
  for (const it of items) {
    if (!seen.has(it.id)) out.push({ ...it, tono: "neutro", motivo: "(el modelo lo omitió)" });
  }
  return out;
}

function authorized(req) {
  if (!APP_PASSWORD) return true;
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return false;
  const pass = Buffer.from(encoded, "base64").toString().split(":").slice(1).join(":");
  const a = Buffer.from(pass);
  const b = Buffer.from(APP_PASSWORD);
  return a.length === b.length && timingSafeEqual(a, b);
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("Lista demasiado larga."), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}

const indexHtml = await readFile(new URL("./public/index.html", import.meta.url), "utf8");

const server = http.createServer(async (req, res) => {
  if (req.url === "/healthz") return send(res, 200, "ok", "text/plain");
  if (!authorized(req)) {
    res.writeHead(401, { "www-authenticate": 'Basic realm="pauta"' });
    return res.end();
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    return send(res, 200, indexHtml, "text/html; charset=utf-8");
  }

  if (req.method === "POST" && req.url === "/api/ordenar") {
    try {
      const { texto = "", criterio = "" } = await readBody(req);
      const items = parseLinks(String(texto));
      if (items.length === 0) return send(res, 400, { error: "No encontré links en el texto." });
      if (items.length > 150) return send(res, 400, { error: "Máximo 150 links por pauta." });
      const orden = await ordenar(items, String(criterio).slice(0, 500));
      return send(res, 200, { items: reconciliar(items, orden), model: MODEL });
    } catch (err) {
      console.error(err);
      const status = err.status === 413 ? 413 : 502;
      return send(res, status, { error: err.message || "Error inesperado." });
    }
  }

  send(res, 404, { error: "No encontrado" });
});

server.listen(PORT, () => console.log(`Pauta editorial en http://localhost:${PORT} (modelo ${MODEL})`));
