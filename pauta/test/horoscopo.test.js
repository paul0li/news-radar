import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearHoroscopo, fechaDelTitulo, SIGNOS } from "../horoscopo.js";
import { articulo } from "./horoscopo-fixture.js";

test("saca la fecha y los 12 signos en orden", () => {
  const h = parsearHoroscopo(articulo("2026-11-02"));
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

test("si falta un signo o la fecha, es un error", () => {
  assert.throws(() => parsearHoroscopo(articulo("2026-11-02", { sin: "LIBRA" })), /faltan: Libra/);
  assert.throws(() => parsearHoroscopo("<h1>Horóscopo de hoy</h1>"), /fecha/);
});

test("fecha del título", () => {
  assert.equal(fechaDelTitulo("Horóscopo Miércoles 28 de Octubre 2026"), "2026-10-28");
  assert.equal(fechaDelTitulo("Horóscopo sábado 1 de marzo de 2027"), "2027-03-01");
  assert.equal(fechaDelTitulo("Horóscopo semanal"), null);
});
