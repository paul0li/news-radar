// Horóscopo del día. La fuente principal es La Cuarta (lacuarta.com/temas/horoscopo/): un artículo por
// día, publicado de madrugada, con un <h3> por signo y sus párrafos debajo. Si La Cuarta falla o todavía
// no publica el de hoy, el respaldo es Yolanda Sultana en primedigital.cl: un artículo por día con los 12
// signos ("ARIES (21 de marzo al 20 de abril) AMOR: … NUMERO: 6."), que suele salir un día antes y del
// que el sitio solo deja el más reciente. Por eso el server lo revisa cada hora y guarda cada uno con su
// fecha (store.js); el horóscopo "de hoy" sale de lo guardado.

export const SIGNOS = [
  ["aries", "Aries", "21 de marzo al 20 de abril"], ["tauro", "Tauro", "21 de abril al 20 de mayo"],
  ["geminis", "Géminis", "21 de mayo al 21 de junio"], ["cancer", "Cáncer", "22 de junio al 22 de julio"],
  ["leo", "Leo", "23 de julio al 22 de agosto"], ["virgo", "Virgo", "23 de agosto al 22 de septiembre"],
  ["libra", "Libra", "23 de septiembre al 22 de octubre"], ["escorpion", "Escorpión", "23 de octubre al 21 de noviembre"],
  ["sagitario", "Sagitario", "22 de noviembre al 21 de diciembre"], ["capricornio", "Capricornio", "22 de diciembre al 20 de enero"],
  ["acuario", "Acuario", "21 de enero al 19 de febrero"], ["piscis", "Piscis", "20 de febrero al 20 de marzo"],
];

export const LA_CUARTA = "La Cuarta";
export const YOLANDA = "Yolanda Sultana";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const PORTADA_LA_CUARTA = "https://www.lacuarta.com/temas/horoscopo/";
const PORTADAS_YOLANDA = ["https://www.yolandasultana.cl/", "https://primedigital.cl/horoscopo/"];

const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const idSigno = (nombre) => sinTildes(nombre.toLowerCase()).trim().replace(/^escorpio$/, "escorpion");
const hoyChile = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(date);
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function texto(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&[a-z]+;/gi, " ");
}

const una = (s) => s.replace(/\s+/g, " ").trim();
const tituloDe = (html) => una(texto(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? ""));

// Revisa que estén los 12 signos con texto y los deja en orden.
function completos(signos) {
  const faltan = SIGNOS.filter(([s]) => !signos.some((x) => x.signo === s && x.texto)).map(([, n]) => n);
  if (faltan.length) throw new Error(`El horóscopo no trae todos los signos (faltan: ${faltan.join(", ")}).`);
  return signos.sort((a, b) => SIGNOS.findIndex(([s]) => s === a.signo) - SIGNOS.findIndex(([s]) => s === b.signo));
}

// "Horóscopo Lunes 2 de Noviembre 2026" → "2026-11-02"
export function fechaDelTitulo(titulo) {
  const m = sinTildes(titulo.toLowerCase()).match(/(\d{1,2})\s+de\s+([a-z]+)\s+(?:de\s+|del\s+)?(\d{4})/);
  const mes = m ? MESES.indexOf(m[2]) + 1 : 0;
  if (!mes) return null;
  return iso(m[3], mes, m[1]);
}

// "Horóscopo hoy, martes 24 de noviembre: …" no trae el año: es el más cercano a `cerca` ("2026-11-24").
export function fechaSinAnio(titulo, cerca) {
  const m = sinTildes(titulo.toLowerCase()).match(/(\d{1,2})\s+de\s+([a-z]+)/);
  const mes = m ? MESES.indexOf(m[2]) + 1 : 0;
  if (!mes || !cerca) return null;
  const anio = Number(cerca.slice(0, 4));
  const ref = Date.parse(`${cerca}T00:00:00Z`);
  return [anio - 1, anio, anio + 1]
    .map((y) => iso(y, mes, m[1]))
    .sort((a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - ref) - Math.abs(Date.parse(`${b}T00:00:00Z`) - ref))[0];
}

// Yolanda Sultana: saca la fecha y los 12 signos del artículo. Lanza un error si falta algo.
export function parsearYolanda(html) {
  const plano = texto(html);
  const titulo = tituloDe(html);
  const fecha = fechaDelTitulo(titulo);
  if (!fecha) throw new Error(`No entiendo la fecha del horóscopo ("${titulo}").`);
  const cabecera = /\b(ARIES|TAURO|G[EÉ]MINIS|C[AÁ]NCER|LEO|VIRGO|LIBRA|ESCORPI[OÓ]N?|SAGITARIO|CAPRICORNIO|ACUARIO|PISCIS)\s*\(([^)]{5,60})\)/g;
  const marcas = [...plano.matchAll(cabecera)];
  const signos = [];
  for (const [i, m] of marcas.entries()) {
    const id = idSigno(m[1]);
    if (signos.some((s) => s.signo === id)) continue;
    let cuerpo = plano.slice(m.index + m[0].length, marcas[i + 1]?.index ?? plano.length);
    // Termina en "NUMERO: 6." (el último signo va seguido del pie del artículo).
    const fin = cuerpo.match(/N[UÚ]MERO:\s*\d+\.?/i);
    if (fin) cuerpo = cuerpo.slice(0, fin.index + fin[0].length);
    const nombre = SIGNOS.find(([s]) => s === id)[1];
    signos.push({ signo: id, nombre, fechas: una(m[2]), texto: una(cuerpo) });
  }
  return { fecha, titulo, signos: completos(signos) };
}

// La Cuarta: el título trae el día sin año; el año sale de la fecha de publicación (o de `hoy`).
// Cada signo es un <h3> seguido de sus párrafos (entre medio hay avisos); el texto los une con saltos de línea.
export function parsearLaCuarta(html, hoy = hoyChile()) {
  const titulo = tituloDe(html);
  const publicado = html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1] ?? html.match(/property="article:published_time"\s+content="([^"]+)"/)?.[1];
  const cerca = publicado && !Number.isNaN(Date.parse(publicado)) ? hoyChile(new Date(publicado)) : hoy;
  const fecha = fechaSinAnio(titulo, cerca);
  if (!fecha) throw new Error(`No entiendo la fecha del horóscopo ("${titulo}").`);
  const marcas = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)]
    .map((m) => ({ m, id: idSigno(texto(m[1])) }))
    .filter(({ id }) => SIGNOS.some(([s]) => s === id));
  const signos = [];
  for (const [i, { m, id }] of marcas.entries()) {
    if (signos.some((s) => s.signo === id)) continue;
    let tramo = html.slice(m.index + m[0].length, marcas[i + 1]?.m.index ?? html.length);
    // Después del último signo vienen las etiquetas y las notas relacionadas.
    const fin = tramo.search(/<section|<\/article>|<h[12][\s>]/i);
    if (fin >= 0) tramo = tramo.slice(0, fin);
    const parrafos = [...tramo.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((p) => una(texto(p[1]))).filter(Boolean);
    const [, nombre, fechas] = SIGNOS.find(([s]) => s === id);
    signos.push({ signo: id, nombre, fechas, texto: parrafos.join("\n") });
  }
  return { fecha, titulo, signos: completos(signos) };
}

async function pedir(url) {
  const r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "es-CL,es;q=0.9" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
  return { url: r.url || url, html: await r.text() };
}

// De la portada de La Cuarta, el link al de hoy (día y mes en la URL) o, si no está, el primero (el más nuevo).
export function linkLaCuarta(html, base, hoy = hoyChile()) {
  const links = [...new Set([...html.matchAll(/href="([^"]*\/noticia\/horoscopo-hoy-[a-z]+-\d{1,2}-de-[a-z]+-[^"]*)"/g)].map((m) => m[1]))];
  const [, mes, dia] = hoy.split("-").map(Number);
  const deHoy = links.find((l) => new RegExp(`horoscopo-hoy-[a-z]+-${dia}-de-${MESES[mes - 1]}-`).test(l));
  const link = deHoy ?? links[0];
  return link ? new URL(link, base).href : null;
}

// El de La Cuarta: { fuente, url, fecha, titulo, signos }. HOROSCOPO_LACUARTA_URL cambia la portada (pruebas).
export async function horoscopoLaCuarta() {
  const portada = await pedir(process.env.HOROSCOPO_LACUARTA_URL || PORTADA_LA_CUARTA);
  const url = linkLaCuarta(portada.html, portada.url);
  if (!url) throw new Error("No encontré el horóscopo en la portada de La Cuarta.");
  const r = await pedir(url);
  return { fuente: LA_CUARTA, url: r.url, ...parsearLaCuarta(r.html) };
}

// El artículo más reciente de Yolanda Sultana. HOROSCOPO_URL lo fija (pruebas).
export async function horoscopoYolanda() {
  let url = process.env.HOROSCOPO_URL;
  for (const portada of url ? [] : PORTADAS_YOLANDA) {
    try {
      url = (await pedir(portada)).html.match(/https:\/\/primedigital\.cl\/\d{4}\/\d{2}\/\d{2}\/horoscopo-[a-z0-9-]+\//)?.[0];
    } catch {}
    if (url) break;
  }
  if (!url) throw new Error("No encontré el último horóscopo de Yolanda Sultana.");
  const r = await pedir(url);
  return { fuente: YOLANDA, url: r.url, ...parsearYolanda(r.html) };
}

// Trae La Cuarta y, si falla o todavía no tiene el de `hoy`, Yolanda Sultana. Lo de Yolanda no pisa un día
// que ya tiene el de La Cuarta. Devuelve null, o el error como texto si no se pudo guardar nada útil.
export async function actualizarHoroscopos({ guardar, delDia, hoy = hoyChile(), laCuarta = horoscopoLaCuarta, yolanda = horoscopoYolanda }) {
  const errores = [];
  let principal = null;
  try {
    principal = await laCuarta();
    await guardar(principal);
    if (principal.fecha >= hoy) return null;
  } catch (err) {
    errores.push(`${LA_CUARTA}: ${err.message}`);
    console.warn("Horóscopo:", errores.at(-1));
  }
  try {
    const respaldo = await yolanda();
    if ((await delDia(respaldo.fecha))?.fuente !== LA_CUARTA) await guardar(respaldo);
    return null;
  } catch (err) {
    errores.push(`${YOLANDA}: ${err.message}`);
    console.warn("Horóscopo:", errores.at(-1));
  }
  return principal ? null : errores.join(" ");
}
