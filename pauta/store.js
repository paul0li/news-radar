// Historial de pautas: un archivo JSON por pauta en DATA_DIR (fuera del repo en producción).
import { mkdir, readFile, writeFile, rename, readdir, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
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

// `actual` es la noticia que se está comentando (la última que se abrió), o null.
export async function updatePauta(id, { order, done, actual } = {}) {
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
    if (actual !== undefined && actual !== null && !(Number.isInteger(actual) && known.has(actual))) {
      throw httpError(400, '"actual" debe ser un id existente o null.');
    }

    if (order !== undefined) pauta.items = order.map((i) => byId.get(i));
    if (done !== undefined) {
      const set = new Set(done);
      for (const it of pauta.items) it.done = set.has(it.id);
    }
    if (actual !== undefined) pauta.actual = actual;
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

// Cambia el titular que se muestra (`titulo`); vacío vuelve al título original.
export async function editItem(id, itemId, { titulo } = {}) {
  fileOf(id);
  if (typeof titulo !== "string") throw httpError(400, '"titulo" debe ser texto.');
  const limpio = titulo.replace(/\s+/g, " ").trim();
  if (limpio.length > 300) throw httpError(400, "El titular es demasiado largo.");
  return withLock(id, async () => {
    const pauta = await getPauta(id);
    const item = pauta.items.find((it) => it.id === itemId);
    if (!item) throw httpError(404, "Esa noticia no está en la pauta.");
    item.titulo = limpio || item.title;
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
    if (pauta.actual === itemId) pauta.actual = null;
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

// ---------- Galletitas de la suerte y horóscopo del día ----------
// DATA_DIR/extras/<fecha>.json (tema = el pedido de quien conduce; origen = "generadas" | "pegadas"):
//   { fecha, tema, origen, createdAt, galletitas: [{ id, texto, usos: [{ donacion, usuario, at }] }] }
// DATA_DIR/horoscopo/<fecha>.json: { fuente, url, fecha, titulo, signos: [{ signo, nombre, fechas, texto }] }
// La fecha es la de Chile (YYYY-MM-DD).

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function hoyChile(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(date);
}

function archivoDia(carpeta, fecha) {
  if (typeof fecha !== "string" || !FECHA_RE.test(fecha)) throw httpError(400, "Fecha inválida.");
  return join(dataDir(), carpeta, `${fecha}.json`);
}

async function leer(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function escribir(file, data) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(data, null, 2));
  await rename(`${file}.tmp`, file);
  return data;
}

export const getExtras = (fecha) => leer(archivoDia("extras", fecha));

// Galletitas nuevas para el día: reemplazan las anteriores (y quién las sacó).
export function crearExtras(fecha, { tema = "", origen = "generadas", galletitas }) {
  const file = archivoDia("extras", fecha);
  return withLock(`extras-${fecha}`, () =>
    escribir(file, {
      fecha,
      tema,
      origen,
      createdAt: new Date().toISOString(),
      galletitas: galletitas.map((texto, i) => ({ id: i + 1, texto, usos: [] })),
    }),
  );
}

// Le da una galletita a una donación: la misma si ya tenía una; si no, una al azar entre las menos
// usadas (las 15 salen una vez antes de repetir alguna).
export function sacarGalletita(fecha, { donacion, usuario = "" }) {
  const file = archivoDia("extras", fecha);
  if (typeof donacion !== "string" || !donacion.trim()) throw httpError(400, '"donacion" debe ser el id de la donación.');
  return withLock(`extras-${fecha}`, async () => {
    const extras = await leer(file);
    if (!extras?.galletitas?.length) throw httpError(409, "Todavía no hay galletitas de hoy: genéralas en la pauta.");
    const ya = extras.galletitas.find((g) => g.usos.some((u) => u.donacion === donacion));
    if (ya) return { galleta: ya, nueva: false, sinUsar: extras.galletitas.filter((g) => !g.usos.length).length };
    const menos = Math.min(...extras.galletitas.map((g) => g.usos.length));
    const opciones = extras.galletitas.filter((g) => g.usos.length === menos);
    const galleta = opciones[Math.floor(Math.random() * opciones.length)];
    galleta.usos.push({ donacion, usuario: String(usuario).slice(0, 100), at: new Date().toISOString() });
    await escribir(file, extras);
    return { galleta, nueva: true, sinUsar: extras.galletitas.filter((g) => !g.usos.length).length };
  });
}

// Cambia el texto de una galletita (también para las donaciones que ya la recibieron).
export function editarGalletita(fecha, id, { texto } = {}) {
  const file = archivoDia("extras", fecha);
  if (typeof texto !== "string") throw httpError(400, '"texto" debe ser texto.');
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) throw httpError(400, "La galletita no puede quedar vacía.");
  if (limpio.length > 300) throw httpError(400, "La galletita es demasiado larga.");
  return withLock(`extras-${fecha}`, async () => {
    const extras = await leer(file);
    const galleta = extras?.galletitas?.find((g) => g.id === id);
    if (!galleta) throw httpError(404, "Esa galletita no está en las de hoy.");
    galleta.texto = limpio;
    await escribir(file, extras);
    return { galleta };
  });
}

export const guardarHoroscopo = (h) => escribir(archivoDia("horoscopo", h.fecha), h);

// El horóscopo de ese día; si no hay (p. ej. no salió el fin de semana), el más cercano guardado
// dentro de 3 días, prefiriendo uno anterior. null si no hay ninguno.
export async function horoscopoPara(fecha) {
  archivoDia("horoscopo", fecha);
  let files;
  try {
    files = await readdir(join(dataDir(), "horoscopo"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
  const dia = (f) => Date.parse(`${f}T00:00:00Z`) / 86_400_000;
  const fechas = files.filter((f) => f.endsWith(".json") && FECHA_RE.test(f.slice(0, -5))).map((f) => f.slice(0, -5));
  const elegida = fechas
    .map((f) => ({ f, d: dia(f) - dia(fecha) }))
    .filter(({ d }) => Math.abs(d) <= 3)
    .sort((a, b) => Math.abs(a.d) - Math.abs(b.d) || a.d - b.d)[0];
  return elegida ? leer(archivoDia("horoscopo", elegida.f)) : null;
}
