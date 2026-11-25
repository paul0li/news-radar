// Artículo de horóscopo con la misma forma que los de primedigital.cl (textos inventados).
const SIGNOS = [
  ["ARIES", "21 de marzo al 20 de abril"], ["TAURO", "21 de abril al 20 de mayo"], ["GEMINIS", "21 de mayo al 21 de junio"],
  ["CANCER", "22 de junio al 22 de julio"], ["LEO", "23 de julio al 22 de agosto"], ["VIRGO", "23 de agosto al 22 de septiembre"],
  ["LIBRA", "23 de septiembre al 22 de octubre"], ["ESCORPION", "23 de octubre al 21 de noviembre"],
  ["SAGITARIO", "22 de noviembre al 21 de diciembre"], ["CAPRICORNIO", "22 de diciembre al 20 de enero"],
  ["ACUARIO", "21 de enero al 19 de febrero"], ["PISCIS", "20 de febrero al 20 de marzo"],
];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// fecha "2026-11-02" → HTML del artículo de ese día. `sin` deja fuera un signo.
export function articulo(fecha, { sin } = {}) {
  const [y, m, d] = fecha.split("-").map(Number);
  const cuerpo = SIGNOS.filter(([s]) => s !== sin).map(([s, f], i) =>
    `<p class="wp-block-paragraph"><strong>${s} </strong>   (${f})</p>\n\n` +
    `<p class="wp-block-paragraph">AMOR: Texto de prueba de ${s.toLowerCase()} &#8211; día ${d}. SALUD: Bien. DINERO: Ordenado. COLOR: Azul. NUMERO: ${i + 1}.</p>\n\n`,
  ).join("");
  return `<html><head><title>Horóscopo &ndash; Prime Digital</title><script>var ARIES = "(no es un signo)";</script></head><body>
<h1 class="elementor-heading-title">Horóscopo Lunes ${d} de ${MESES[m - 1]} ${y}</h1>
<div>${cuerpo}<p class="wp-block-paragraph"><strong>Contacto</strong> Yolanda Sultana, Astróloga</p></div></body></html>`;
}

// Artículo y portada con la misma forma que los de lacuarta.com (textos inventados).
const NOMBRES = ["Aries", "Tauro", "Géminis", "Cáncer", "Leo", "Virgo", "Libra", "Escorpio", "Sagitario", "Capricornio", "Acuario", "Piscis"];
const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const AVISO = `<div class="ads-block show"><div class="ads-block__container"><div style="height:250"></div></div></div>`;

const slug = (fecha) => {
  const [y, m, d] = fecha.split("-").map(Number);
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `horoscopo-hoy-${dia}-${d}-de-${MESES[m - 1].toLowerCase()}-revisa-como-estara-el-amor-dinero-y-salud-para-tu-signo-zodiacal`;
};

// fecha → HTML del artículo de ese día. `sin` deja fuera un signo.
export function laCuarta(fecha, { sin } = {}) {
  const [, m, d] = fecha.split("-").map(Number);
  const cuerpo = NOMBRES.filter((n) => n !== sin).map((n, i) =>
    `<h3 class="article-body__heading-h3">${n}</h3><p class="article-body__paragraph">General de ${n} &#8211; día ${d}.</p>${i % 2 ? AVISO : ""}` +
    `<p class="article-body__paragraph">Dinero de ${n}.</p><p class="article-body__paragraph">Amor de ${n}.</p>`,
  ).join("");
  return `<html><head><script type="application/ld+json">{"@type":"NewsArticle","datePublished":"${fecha}T07:00:00Z"}</script></head><body>
<h1 class="article-head__title">Horóscopo hoy, ${slug(fecha).split("-")[2]} ${d} de ${MESES[m - 1].toLowerCase()}: revisa cómo estará el amor, dinero y salud para tu signo zodiacal</h1>
<div class="article-body"><p class="article-body__paragraph">Introducción del día.</p>${cuerpo}</div>
<section class="article-body__tags"><a href="/temas/horoscopo/">Horóscopo</a></section>
<div><h2>Imperdibles</h2><h3>Leo</h3><p>Una nota que no es del horóscopo.</p></div></body></html>`;
}

// Portada con links a esas fechas, en ese orden (la primera es la más nueva).
export function portadaLaCuarta(fechas) {
  return `<html><body><h1>Horóscopo</h1>${fechas.map((f) => `<a href="/servicios/noticia/${slug(f)}/">${f}</a>`.repeat(3)).join("\n")}</body></html>`;
}

export const rutaLaCuarta = (fecha) => `/servicios/noticia/${slug(fecha)}/`;
