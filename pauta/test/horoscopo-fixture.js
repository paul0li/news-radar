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
