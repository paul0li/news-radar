import { test } from "node:test";
import assert from "node:assert/strict";
import { tituloSeguro } from "../titulo.js";

test("acepta solo ortografía: letras y tildes", () => {
  assert.equal(tituloSeguro("el gato q abrio el refri", "el gato q abrió el refri"), "el gato q abrió el refri");
  assert.equal(tituloSeguro("ecuentro de lideres", "encuentro de líderes"), "encuentro de líderes");
  assert.equal(tituloSeguro("ULTIMO MINUTO: kast anuncia", "ÚLTIMO MINUTO: kast anuncia"), "ÚLTIMO MINUTO: kast anuncia");
});

test("no cambia mayúsculas ni minúsculas, aunque la IA lo haga", () => {
  assert.equal(tituloSeguro("temblor en antofagasta", "Temblor en Antofagasta"), "temblor en antofagasta");
  assert.equal(tituloSeguro("el gato q abrio", "El gato q abrió"), "el gato q abrió");
  assert.equal(tituloSeguro("URGENTE: cae el dolar", "Urgente: cae el dólar"), "URGENTE: cae el dólar");
  assert.equal(tituloSeguro("Boric en LA MONEDA", "boric en La Moneda"), "Boric en LA MONEDA");
});

test("deshace palabras cambiadas, agregadas, quitadas o reordenadas, y la puntuación", () => {
  assert.equal(tituloSeguro("el gato q abrio el refri", "El gato que abrió el refrigerador"), "el gato q abrió el refri");
  assert.equal(tituloSeguro("perro roba pollo", "Perro se roba un pollo en vivo"), "perro roba pollo");
  assert.equal(tituloSeguro("bc sube tasa al 6%", "Banco Central sube la tasa al 6%"), "bc sube tasa al 6%");
  assert.equal(tituloSeguro("sube la tasa", "Sube la renta"), "sube la tasa");
  assert.equal(tituloSeguro("se cruzan , en debate", "se cruzan, en debate"), "se cruzan , en debate");
  assert.equal(tituloSeguro("que paso", "¿qué pasó?"), "que paso");
});

test("sin propuesta queda el original; si el original es solo un link, la IA redacta", () => {
  assert.equal(tituloSeguro("perro roba pollo", ""), "perro roba pollo");
  assert.equal(tituloSeguro("tiktok.com/@x/video/1", "Video de TikTok"), "Video de TikTok");
});
