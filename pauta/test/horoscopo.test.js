import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearYolanda, parsearLaCuarta, linkLaCuarta, actualizarHoroscopos, fechaDelTitulo, fechaSinAnio, SIGNOS } from "../horoscopo.js";
import { articulo, laCuarta, portadaLaCuarta } from "./horoscopo-fixture.js";

test("Yolanda: saca la fecha y los 12 signos en orden", () => {
  const h = parsearYolanda(articulo("2026-11-02"));
  assert.equal(h.fecha, "2026-11-02");
  assert.equal(h.titulo, "Horóscopo Lunes 2 de Noviembre 2026");
  assert.deepEqual(h.signos.map((s) => s.signo), SIGNOS.map(([s]) => s));
  assert.deepEqual(h.signos[0], {
    signo: "aries", nombre: "Aries", fechas: "21 de marzo al 20 de abril",
    texto: "AMOR: Texto de prueba de aries – día 2. SALUD: Bien. DINERO: Ordenado. COLOR: Azul. NUMERO: 1.",
  });
  // El último signo no se lleva el pie del artículo.
  assert.equal(h.signos[11].texto.endsWith("NUMERO: 12."), true);
  assert.equal(h.signos[7].nombre, "Escorpión");
});

test("Yolanda: si falta un signo o la fecha, es un error", () => {
  assert.throws(() => parsearYolanda(articulo("2026-11-02", { sin: "LIBRA" })), /faltan: Libra/);
  assert.throws(() => parsearYolanda("<h1>Horóscopo de hoy</h1>"), /fecha/);
});

test("fecha del título", () => {
  assert.equal(fechaDelTitulo("Horóscopo Miércoles 28 de Octubre 2026"), "2026-10-28");
  assert.equal(fechaDelTitulo("Horóscopo sábado 1 de marzo de 2027"), "2027-03-01");
  assert.equal(fechaDelTitulo("Horóscopo semanal"), null);
});

test("La Cuarta: saca la fecha y los 12 signos, con sus párrafos y sin los avisos", () => {
  const h = parsearLaCuarta(laCuarta("2026-11-24"), "2026-11-24");
  assert.equal(h.fecha, "2026-11-24");
  assert.match(h.titulo, /^Horóscopo hoy, martes 24 de noviembre:/);
  assert.deepEqual(h.signos.map((s) => s.signo), SIGNOS.map(([s]) => s));
  assert.deepEqual(h.signos[1], {
    signo: "tauro", nombre: "Tauro", fechas: "21 de abril al 20 de mayo",
    texto: "General de Tauro – día 24.\nDinero de Tauro.\nAmor de Tauro.",
  });
  assert.equal(h.signos[7].nombre, "Escorpión"); // "Escorpio" en La Cuarta
  // El último signo no se lleva las notas que vienen después; el "Leo" de más abajo no reemplaza al real.
  assert.equal(h.signos[11].texto, "General de Piscis – día 24.\nDinero de Piscis.\nAmor de Piscis.");
  assert.equal(h.signos[4].texto.startsWith("General de Leo"), true);
});

test("La Cuarta: el año sale de la fecha de publicación", () => {
  // Publicado el 31 de diciembre para el 1 de enero: es del año siguiente.
  const html = laCuarta("2027-01-01").replace("2027-01-01T07:00:00Z", "2026-12-31T23:00:00Z");
  assert.equal(parsearLaCuarta(html, "2026-12-31").fecha, "2027-01-01");
  // Sin fecha de publicación, la más cercana a hoy.
  assert.equal(parsearLaCuarta(laCuarta("2026-11-24").replace(/"datePublished"/, '"otra"'), "2026-11-25").fecha, "2026-11-24");
  assert.equal(fechaSinAnio("Horóscopo hoy, jueves 31 de diciembre", "2027-01-02"), "2026-12-31");
  assert.equal(fechaSinAnio("Horóscopo semanal", "2027-01-02"), null);
});

test("La Cuarta: si falta un signo o la fecha, es un error", () => {
  assert.throws(() => parsearLaCuarta(laCuarta("2026-11-24", { sin: "Libra" })), /faltan: Libra/);
  assert.throws(() => parsearLaCuarta("<h1>Horóscopo</h1>"), /fecha/);
});

test("La Cuarta: de la portada, el link de hoy o el más nuevo", () => {
  const portada = portadaLaCuarta(["2026-11-23", "2026-11-24", "2026-11-22"]);
  assert.equal(linkLaCuarta(portada, "https://www.lacuarta.com/temas/horoscopo/", "2026-11-24"),
    "https://www.lacuarta.com/servicios/noticia/horoscopo-hoy-martes-24-de-noviembre-revisa-como-estara-el-amor-dinero-y-salud-para-tu-signo-zodiacal/");
  assert.match(linkLaCuarta(portada, "https://x.cl/", "2026-11-25"), /lunes-23-de-noviembre/);
  assert.equal(linkLaCuarta("<html></html>", "https://x.cl/"), null);
});

// Un store en memoria para probar a quién se le hace caso.
function memoria() {
  const dias = new Map();
  return { dias, guardar: async (h) => void dias.set(h.fecha, h), delDia: async (f) => dias.get(f) ?? null };
}
const h = (fuente, fecha) => async () => ({ fuente, fecha, signos: [] });
const falla = (msg) => async () => { throw new Error(msg); };

test("actualizar: La Cuarta primero; Yolanda solo si La Cuarta falla o no tiene el de hoy", async () => {
  let pedidas = 0;
  const contar = (f) => async () => (pedidas++, f());

  // La Cuarta tiene el de hoy: ni se le pregunta a Yolanda.
  let m = memoria();
  assert.equal(await actualizarHoroscopos({ ...m, hoy: "2026-11-24", laCuarta: h("La Cuarta", "2026-11-24"), yolanda: contar(h("Yolanda Sultana", "2026-11-25")) }), null);
  assert.equal(pedidas, 0);
  assert.equal(m.dias.get("2026-11-24").fuente, "La Cuarta");

  // La Cuarta falla: se guarda Yolanda, sin error.
  m = memoria();
  assert.equal(await actualizarHoroscopos({ ...m, hoy: "2026-11-24", laCuarta: falla("caída"), yolanda: h("Yolanda Sultana", "2026-11-24") }), null);
  assert.equal(m.dias.get("2026-11-24").fuente, "Yolanda Sultana");

  // La Cuarta todavía no publica el de hoy: se guardan los dos (cada uno en su día).
  m = memoria();
  await actualizarHoroscopos({ ...m, hoy: "2026-11-24", laCuarta: h("La Cuarta", "2026-11-23"), yolanda: h("Yolanda Sultana", "2026-11-24") });
  assert.deepEqual([...m.dias].map(([f, x]) => [f, x.fuente]), [["2026-11-23", "La Cuarta"], ["2026-11-24", "Yolanda Sultana"]]);
  // Yolanda no pisa un día que ya tiene La Cuarta, pero La Cuarta sí pisa a Yolanda.
  await actualizarHoroscopos({ ...m, hoy: "2026-11-24", laCuarta: falla("caída"), yolanda: h("Yolanda Sultana", "2026-11-23") });
  assert.equal(m.dias.get("2026-11-23").fuente, "La Cuarta");
  await actualizarHoroscopos({ ...m, hoy: "2026-11-24", laCuarta: h("La Cuarta", "2026-11-24"), yolanda: falla("no") });
  assert.equal(m.dias.get("2026-11-24").fuente, "La Cuarta");

  // Fallan los dos: el error lleva los dos motivos.
  m = memoria();
  assert.equal(await actualizarHoroscopos({ ...m, hoy: "2026-11-24", laCuarta: falla("caída"), yolanda: falla("sin link") }), "La Cuarta: caída Yolanda Sultana: sin link");
  // La Cuarta trae uno viejo y Yolanda falla: no es error (se muestra el de La Cuarta).
  assert.equal(await actualizarHoroscopos({ ...m, hoy: "2026-11-24", laCuarta: h("La Cuarta", "2026-11-23"), yolanda: falla("sin link") }), null);
});
