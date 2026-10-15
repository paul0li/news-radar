// Historial de pautas: un archivo JSON por pauta en DATA_DIR (fuera del repo en producción).
import { mkdir, readFile, writeFile, rename, readdir, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ID_RE = /^\d{8}-\d{6}-[0-9a-f]{4}$/;

// Se lee en cada llamada para que los tests puedan apuntar a un directorio temporal.
function dataDir() {
  return process.env.DATA_DIR || fileURLToPath(new URL("./data", import.meta.url));
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function fileOf(id) {
  if (typeof id !== "string" || !ID_RE.test(id)) throw httpError(400, "Id de pauta inválido.");
  return join(dataDir(), `${id}.json`);
}

// 20261014-170908-ab12: timestamp UTC (ordenable) + 4 hex al azar.
function newId(date = new Date()) {
  const s = date.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `${s}-${randomBytes(2).toString("hex")}`;
}

async function save(pauta) {
  await mkdir(dataDir(), { recursive: true });
  const file = fileOf(pauta.id);
  await writeFile(`${file}.tmp`, JSON.stringify(pauta, null, 2));
  await rename(`${file}.tmp`, file); // escritura atómica
  return pauta;
}

// Serializa las escrituras por id para que dos PUT seguidos no se pisen.
const locks = new Map();
function withLock(id, fn) {
  const prev = locks.get(id) || Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.catch(() => {});
  locks.set(id, tail);
  tail.then(() => locks.get(id) === tail && locks.delete(id));
  return next;
}

export async function createPauta({ criterio = "", items }) {
  const now = new Date();
  const pauta = {
    id: newId(now),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    criterio,
    items: items.map(({ id, title, titulo, url, domain, tono }) => ({ id, title, titulo: titulo || title, url, domain, tono, done: false })),
  };
  return save(pauta);
}

export async function getPauta(id) {
  const file = fileOf(id);
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") throw httpError(404, "Pauta no encontrada.");
    throw err;
  }
}

export async function listPautas({ limit = 30 } = {}) {
  let files;
  try {
    files = await readdir(dataDir());
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const ids = files
    .filter((f) => f.endsWith(".json") && ID_RE.test(f.slice(0, -5)))
    .map((f) => f.slice(0, -5))
    .sort()
    .reverse()
    .slice(0, limit);
  const out = [];
  for (const id of ids) {
    try {
      const p = await getPauta(id);
      out.push({
        id: p.id,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        count: p.items.length,
        doneCount: p.items.filter((it) => it.done).length,
        preview: p.items.slice(0, 3).map((it) => it.titulo || it.title),
      });
    } catch (err) {
      if (err.status !== 404) console.warn(`No pude leer la pauta ${id}:`, err.message);
    }
  }
  return out;
}

function checkIds(value, known, name) {
  if (!Array.isArray(value) || !value.every((x) => Number.isInteger(x) && known.has(x))) {
    throw httpError(400, `"${name}" debe ser una lista de ids existentes.`);
  }
  if (new Set(value).size !== value.length) throw httpError(400, `"${name}" tiene ids repetidos.`);
}

export async function updatePauta(id, { order, done } = {}) {
  fileOf(id); // valida el id antes de tomar el lock
  return withLock(id, async () => {
    const pauta = await getPauta(id);
    const byId = new Map(pauta.items.map((it) => [it.id, it]));
    const known = new Set(byId.keys());
    if (order !== undefined) {
      checkIds(order, known, "order");
      if (order.length !== known.size) throw httpError(400, '"order" debe incluir todos los ids exactamente una vez.');
    }
    if (done !== undefined) checkIds(done, known, "done");

    if (order !== undefined) pauta.items = order.map((i) => byId.get(i));
    if (done !== undefined) {
      const set = new Set(done);
      for (const it of pauta.items) it.done = set.has(it.id);
    }
    pauta.updatedAt = new Date().toISOString();
    return save(pauta);
  });
}

// Noticia de último minuto: entra primera, con un id nuevo (el mayor + 1).
export async function addItem(id, { title, titulo, url = "", domain = "", tono = "neutro" }) {
  fileOf(id);
  return withLock(id, async () => {
    const pauta = await getPauta(id);
    const item = {
      id: pauta.items.reduce((max, it) => Math.max(max, it.id), 0) + 1,
      title, titulo: titulo || title, url, domain, tono, done: false, ultimo: true,
    };
    pauta.items.unshift(item);
    pauta.updatedAt = new Date().toISOString();
    return { pauta: await save(pauta), item };
  });
}

// Saca una noticia de la pauta; las demás conservan su orden y si ya se vieron.
export async function removeItem(id, itemId) {
  fileOf(id);
  return withLock(id, async () => {
    const pauta = await getPauta(id);
    const i = pauta.items.findIndex((it) => it.id === itemId);
    if (i === -1) throw httpError(404, "Esa noticia no está en la pauta.");
    pauta.items.splice(i, 1);
    pauta.updatedAt = new Date().toISOString();
    return save(pauta);
  });
}

export async function deletePauta(id) {
  try {
    await unlink(fileOf(id));
  } catch (err) {
    if (err.code === "ENOENT") throw httpError(404, "Pauta no encontrada.");
    throw err;
  }
}
