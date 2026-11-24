// Guarda de los títulos: la IA solo puede corregir ortografía (letras y tildes). Las mayúsculas,
// la puntuación y los espacios quedan siempre como los escribió el editor.
// Se compara palabra por palabra con el original; cualquier palabra que la IA haya cambiado de
// verdad (otra palabra, agregada, quitada o reordenada) vuelve a quedar como la escribió el editor.

const sinTildes = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const soloSignos = (s) => s.replace(/[\p{L}\p{N}]/gu, "");

function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Copia las mayúsculas/minúsculas del original a la palabra corregida (letra por letra si miden
// lo mismo; si no, al menos la primera letra y "todo en mayúsculas").
function conMayusculasDe(orig, w) {
  const o = [...orig];
  const c = [...w.normalize("NFC")];
  const may = (ch) => ch !== ch.toLowerCase();
  if (o.length === c.length) return c.map((ch, i) => (may(o[i]) ? ch.toUpperCase() : ch.toLowerCase())).join("");
  if (o.length > 1 && orig === orig.toUpperCase() && orig !== orig.toLowerCase()) return w.toUpperCase();
  const r = w.toLowerCase();
  return may(o[0]) ? r.charAt(0).toUpperCase() + r.slice(1) : r;
}

// Título generado del dominio/ruta cuando el editor no escribió uno: ahí la IA sí puede redactar.
const esSoloLink = (t) => !/\s/.test(t) && /[./]/.test(t);

// ¿La palabra de la IA es la misma del original, con a lo más una corrección de ortografía?
function mismaPalabra(orig, ia) {
  const a = sinTildes(orig);
  const b = sinTildes(ia);
  if (a === b) return true;
  // Errores de tipeo ("ecuentro" → "encuentro"): palabras largas, los mismos signos, 1–2 letras.
  const largo = Math.min(a.length, b.length);
  return largo >= 4 && soloSignos(orig) === soloSignos(ia) && distancia(a, b) <= (largo >= 7 ? 2 : 1);
}

export function tituloSeguro(original, propuesto) {
  const orig = String(original ?? "").replace(/\s+/g, " ").trim();
  const ia = String(propuesto ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!ia) return orig;
  if (!orig || esSoloLink(orig)) return ia;

  const po = orig.split(" ");
  const pi = ia.split(" ");
  if (po.length !== pi.length) return orig;
  return po.map((o, i) => (mismaPalabra(o, pi[i]) ? conMayusculasDe(o, pi[i]) : o)).join(" ");
}
