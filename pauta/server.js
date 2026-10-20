// Pauta editorial: ordena la pauta del día intercalando notas graciosas y serias.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { parseLinks, domainOf } from "./parse.js";
import { createPauta, getPauta, listPautas, updatePauta, deletePauta, addItem, removeItem } from "./store.js";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const MODEL = process.env.MODEL || "opus";
const EFFORT = process.env.EFFORT || "low";
// Rutas relativas (ej. ./test/fake-claude.js) se resuelven desde donde se lanzó el server,
// porque claude corre con cwd temporal.
const CLAUDE_BIN = /[\\/]/.test(process.env.CLAUDE_BIN || "") ? resolve(process.env.CLAUDE_BIN) : process.env.CLAUDE_BIN || "claude";
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
- "titulo": reescribe SIEMPRE el título para leerlo en pantalla durante la transmisión. Los originales los escribió el editor a la rápida (con faltas, abreviaciones o sin contexto); no los copies tal cual.
  - Que den ganas de verlo: con gancho y ritmo, en español de Chile natural, claro y breve (máx. ~90 caracteres). Corrige ortografía y mayúsculas.
  - Fiel al original: no inventes datos, cifras, nombres ni detalles que no estén en el título original. Mantén los nombres propios.
  - Ajusta el tono a la noticia: con humor e ingenio si es gracioso; sobrio, claro y respetuoso si es serio (nunca bromas sobre muertes, tragedias o víctimas).
  - Sin clickbait engañoso, sin MAYÚSCULAS sostenidas y sin emojis.
  - Si el original es solo un dominio o una URL, escribe un título neutro y breve basado en eso, sin inventar el contenido.
  - Ejemplos:
    "perro roba pollo noticiero vivo" → "El perro que se robó el show (y un pollo) en pleno noticiero"
    "gato abre refri" → "Este gato aprendió a abrir el refri y ya nada está a salvo"
    "bc sube tasa 6%" → "El Banco Central sube la tasa de interés a 6%"
    "temblor antofa 2 muertos" → "Temblor en Antofagasta deja dos fallecidos"`;

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
          titulo: { type: "string" },
        },
        required: ["id", "tono", "titulo"],
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

// Último minuto: la IA redacta el titular con las mismas reglas que el resto de la pauta.
// El id 0 es provisorio; el store le asigna el definitivo al guardarla.
async function redactarUltimoMinuto(titular, url) {
  const item = { id: 0, title: titular, url, domain: url ? domainOf(url) : "" };
  const { orden } = await runClaude(
    `Noticia de último minuto para sumar a una pauta ya armada. Va primera: solo redacta su título y clasifica su tono.\n` +
      `${item.id}. ${item.title} (${item.domain || "sin link"})`,
  );
  return reconciliar([item], orden)[0];
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
    const titulo = typeof o.titulo === "string" ? o.titulo.trim().slice(0, 200) : "";
    out.push({ ...it, tono: o.tono, titulo: titulo || it.title });
  }
  for (const it of items) {
    if (!seen.has(it.id)) out.push({ ...it, tono: "neutro", titulo: it.title });
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
  // no-store: OBS y el navegador siempre piden la pauta y la página más nuevas.
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
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
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}") ?? {};
  } catch {
    throw Object.assign(new Error("JSON inválido."), { status: 400 });
  }
}

const indexHtml = await readFile(new URL("./public/index.html", import.meta.url), "utf8");
const tickerHtml = await readFile(new URL("./public/ticker.html", import.meta.url), "utf8");

// Titulares de la pauta más reciente, para el banner de OBS.
async function titularesActuales() {
  const [ultima] = await listPautas({ limit: 1 });
  if (!ultima) return { id: null, createdAt: null, titulares: [], actual: null };
  const p = await getPauta(ultima.id);
  const titular = (it) => ({ texto: it.titulo || it.title, tono: it.tono });
  const actual = p.items.find((it) => it.id === p.actual);
  return {
    id: p.id,
    createdAt: p.createdAt,
    titulares: p.items.map(titular),
    actual: actual ? titular(actual) : null,
  };
}

const server = http.createServer(async (req, res) => {
  const path = req.url.split("?")[0];
  if (path === "/healthz") return send(res, 200, "ok", "text/plain");
  if (!authorized(req)) {
    res.writeHead(401, { "www-authenticate": 'Basic realm="pauta"' });
    return res.end();
  }

  if (req.method === "GET" && (path === "/" || path === "/index.html")) {
    return send(res, 200, indexHtml, "text/html; charset=utf-8");
  }

  // Banner para OBS (fuente de navegador) y sus datos.
  if (req.method === "GET" && path === "/ticker") return send(res, 200, tickerHtml, "text/html; charset=utf-8");
  if (req.method === "GET" && path === "/api/ticker") {
    try {
      return send(res, 200, await titularesActuales());
    } catch (err) {
      console.error(err);
      return send(res, 500, { error: "Error inesperado." });
    }
  }

  if (req.method === "POST" && path === "/api/ordenar") {
    try {
      const { texto = "", criterio = "" } = await readBody(req);
      const items = parseLinks(String(texto));
      if (items.length === 0) return send(res, 400, { error: "No encontré links en el texto." });
      if (items.length > 150) return send(res, 400, { error: "Máximo 150 links por pauta." });
      const crit = String(criterio).slice(0, 500);
      const orden = await ordenar(items, crit);
      const pauta = await createPauta({ criterio: crit, items: reconciliar(items, orden) });
      return send(res, 200, { pauta, model: MODEL });
    } catch (err) {
      console.error(err);
      const status = err.status === 413 || err.status === 400 ? err.status : 502;
      return send(res, status, { error: err.message || "Error inesperado." });
    }
  }

  // Noticia de último minuto: /api/pautas/:id/ultimo
  const um = path.match(/^\/api\/pautas\/([^/]+)\/ultimo$/);
  if (um && req.method === "POST") {
    try {
      const body = await readBody(req);
      const titular = String(body.titular ?? "").replace(/\s+/g, " ").trim();
      const url = String(body.url ?? "").trim();
      if (!titular) return send(res, 400, { error: "Escribe el titular." });
      if (titular.length > 300) return send(res, 400, { error: "El titular es demasiado largo." });
      if (url && !/^https?:\/\/\S+$/i.test(url)) return send(res, 400, { error: "El link debe empezar con http:// o https://" });
      await getPauta(um[1]); // 400/404 antes de gastar una llamada a la IA
      const nuevo = await redactarUltimoMinuto(titular, url);
      return send(res, 200, await addItem(um[1], nuevo));
    } catch (err) {
      if (err.status) return send(res, err.status, { error: err.message });
      console.error(err);
      return send(res, 502, { error: err.message || "Error inesperado." });
    }
  }

  // Borrar una noticia: DELETE /api/pautas/:id/items/:itemId
  const di = path.match(/^\/api\/pautas\/([^/]+)\/items\/(\d+)$/);
  if (di && req.method === "DELETE") {
    try {
      return send(res, 200, { pauta: await removeItem(di[1], Number(di[2])) });
    } catch (err) {
      if (!err.status) console.error(err);
      return send(res, err.status || 500, { error: err.status ? err.message : "Error inesperado." });
    }
  }

  // Historial: /api/pautas y /api/pautas/:id
  const m = path.match(/^\/api\/pautas(?:\/([^/]+))?$/);
  if (m) {
    const id = m[1]; // el store valida el formato (sin path traversal)
    try {
      if (!id && req.method === "GET") return send(res, 200, { pautas: await listPautas() });
      if (id && req.method === "GET") return send(res, 200, { pauta: await getPauta(id) });
      if (id && req.method === "PUT") {
        const { order, done, actual } = await readBody(req);
        return send(res, 200, { pauta: await updatePauta(id, { order, done, actual }) });
      }
      if (id && req.method === "DELETE") {
        await deletePauta(id);
        return send(res, 200, { ok: true });
      }
      return send(res, 405, { error: "Método no permitido." });
    } catch (err) {
      if (!err.status) console.error(err);
      return send(res, err.status || 500, { error: err.status ? err.message : "Error inesperado." });
    }
  }

  send(res, 404, { error: "No encontrado" });
});

server.listen(PORT, HOST, () => console.log(`Pauta editorial en http://${HOST}:${server.address().port} (modelo ${MODEL})`));
