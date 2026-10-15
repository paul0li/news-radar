// Convierte texto pegado (cualquier formato razonable) en [{ id, title, url, domain }].
// Soporta: "Título https://..." en una línea, título en la línea anterior al link,
// título en la línea siguiente (si la lista empieza con un link) y markdown [Título](url).

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function cleanTitle(s) {
  return s
    .replace(/^\s*(?:[-*•▪►→]|\d+[.)-]|#)\s*/, "") // viñetas y numeración
    .replace(/\s*[-–—|:>]+\s*$/, "") // separadores colgando al final
    .replace(/^\s*[-–—|:>]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function parseLinks(text) {
  const lines = text
    .replace(MD_LINK_RE, "$1 $2")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Si la lista parte con un link "pelado", asumimos formato link -> título.
  const titleAfter = lines.length > 0 && /https?:\/\//i.test(lines[0]) && cleanTitle(lines[0].replace(URL_RE, "")) === "";

  const items = [];
  let pending = ""; // título visto antes de su link
  let waiting = null; // link que espera su título en la línea siguiente

  for (const line of lines) {
    const urls = line.match(URL_RE) || [];
    const rest = cleanTitle(line.replace(URL_RE, " "));

    if (urls.length === 0) {
      if (titleAfter && waiting && !waiting.title) {
        waiting.title = rest;
        waiting = null;
      } else {
        pending = rest; // el último texto antes del link gana
      }
      continue;
    }

    urls.forEach((rawUrl, i) => {
      const url = rawUrl.replace(/[.,;]+$/, "");
      const title = urls.length === 1 ? rest || (titleAfter ? "" : pending) : i === 0 ? rest || pending : "";
      const item = { id: items.length + 1, title, url, domain: domainOf(url) };
      items.push(item);
      waiting = item;
    });
    pending = "";
  }

  for (const it of items) if (!it.title) it.title = `${it.domain}${new URL(it.url).pathname}`.slice(0, 120);
  return items;
}
