import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLinks } from "../parse.js";

test("título en la misma línea", () => {
  const r = parseLinks("1. Perro se roba un pollo - https://www.tiktok.com/@x/video/1\n2) Sube la tasa https://latercera.com/a.");
  assert.deepEqual(r.map((x) => [x.title, x.url, x.domain]), [
    ["Perro se roba un pollo", "https://www.tiktok.com/@x/video/1", "tiktok.com"],
    ["Sube la tasa", "https://latercera.com/a", "latercera.com"],
  ]);
});

test("título en la línea anterior", () => {
  const r = parseLinks("Gato toca piano\nhttps://youtu.be/abc\n\nCae el dólar\nhttps://df.cl/x");
  assert.deepEqual(r.map((x) => x.title), ["Gato toca piano", "Cae el dólar"]);
});

test("link primero y título después", () => {
  const r = parseLinks("https://x.com/a/status/1\nTuit viral\nhttps://emol.com/b\nTemblor en el norte");
  assert.deepEqual(r.map((x) => x.title), ["Tuit viral", "Temblor en el norte"]);
});

test("markdown y link sin título", () => {
  const r = parseLinks("[Meme del día](https://instagram.com/p/1)\nhttps://biobiochile.cl/noticia/123");
  assert.equal(r[0].title, "Meme del día");
  assert.equal(r[1].title, "biobiochile.cl/noticia/123");
  assert.deepEqual(r.map((x) => x.id), [1, 2]);
});
