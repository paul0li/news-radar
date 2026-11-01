// Horóscopo de Yolanda Sultana. Lo publica en primedigital.cl, un artículo por día con los 12 signos
// ("ARIES (21 de marzo al 20 de abril) AMOR: … COLOR: … NUMERO: 6."), pero el sitio solo deja el
// más reciente (y suele salir un día antes). Por eso el server lo revisa cada hora y guarda cada uno
// con su fecha (store.js); el horóscopo "de hoy" sale de lo guardado.

export const SIGNOS = [
  ["aries", "Aries"], ["tauro", "Tauro"], ["geminis", "Géminis"], ["cancer", "Cáncer"],
  ["leo", "Leo"], ["virgo", "Virgo"], ["libra", "Libra"], ["escorpion", "Escorpión"],
  ["sagitario", "Sagitario"], ["capricornio", "Capricornio"], ["acuario", "Acuario"], ["piscis", "Piscis"],
];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const PORTADAS = ["https://www.yolandasultana.cl/", "https://primedigital.cl/horoscopo/"];

const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

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

// "Horóscopo Lunes 2 de Noviembre 2026" → "2026-11-02"
export function fechaDelTitulo(titulo) {
  const m = sinTildes(titulo.toLowerCase()).match(/(\d{1,2})\s+de\s+([a-z]+)\s+(?:de\s+|del\s+)?(\d{4})/);
  const mes = m ? MESES.indexOf(m[2]) + 1 : 0;
  if (!mes) return null;
  return `${m[3]}-${String(mes).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

// Saca la fecha y los 12 signos del artículo. Lanza un error si falta algo.
export function parsearHoroscopo(html) {
  const plano = texto(html);
  const titulo = texto(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const fecha = fechaDelTitulo(titulo);
  if (!fecha) throw new Error(`No entiendo la fecha del horóscopo ("${titulo}").`);
  const cabecera = /\b(ARIES|TAURO|G[EÉ]MINIS|C[AÁ]NCER|LEO|VIRGO|LIBRA|ESCORPI[OÓ]N?|SAGITARIO|CAPRICORNIO|ACUARIO|PISCIS)\s*\(([^)]{5,60})\)/g;
  const marcas = [...plano.matchAll(cabecera)];
  const signos = [];
  for (const [i, m] of marcas.entries()) {
    const id = sinTildes(m[1].toLowerCase()).replace(/^escorpio$/, "escorpion");
    if (signos.some((s) => s.signo === id)) continue;
    let cuerpo = plano.slice(m.index + m[0].length, marcas[i + 1]?.index ?? plano.length);
    // Termina en "NUMERO: 6." (el último signo va seguido del pie del artículo).
    const fin = cuerpo.match(/N[UÚ]MERO:\s*\d+\.?/i);
    if (fin) cuerpo = cuerpo.slice(0, fin.index + fin[0].length);
    const nombre = SIGNOS.find(([s]) => s === id)[1];
    signos.push({ signo: id, nombre, fechas: m[2].replace(/\s+/g, " ").trim(), texto: cuerpo.replace(/\s+/g, " ").trim() });
  }
  const faltan = SIGNOS.filter(([s]) => !signos.some((x) => x.signo === s && x.texto)).map(([, n]) => n);
  if (faltan.length) throw new Error(`El horóscopo no trae todos los signos (faltan: ${faltan.join(", ")}).`);
  signos.sort((a, b) => SIGNOS.findIndex(([s]) => s === a.signo) - SIGNOS.findIndex(([s]) => s === b.signo));
  return { fecha, titulo, signos };
}

async function pedir(url) {
  const r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "es-CL,es;q=0.9" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
  return { url: r.url || url, html: await r.text() };
}

// El artículo más reciente: { fuente, url, fecha, titulo, signos }. HOROSCOPO_URL lo fija (pruebas).
export async function ultimoHoroscopo() {
  let url = process.env.HOROSCOPO_URL;
  for (const portada of url ? [] : PORTADAS) {
    try {
      url = (await pedir(portada)).html.match(/https:\/\/primedigital\.cl\/\d{4}\/\d{2}\/\d{2}\/horoscopo-[a-z0-9-]+\//)?.[0];
    } catch {}
    if (url) break;
  }
  if (!url) throw new Error("No encontré el último horóscopo de Yolanda Sultana.");
  const r = await pedir(url);
  return { fuente: "Yolanda Sultana", url: r.url, ...parsearHoroscopo(r.html) };
}
