import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPauta, getPauta, listPautas, updatePauta, deletePauta, addItem, editItem, removeItem,
  hoyChile, getExtras, crearExtras, sacarGalletita, editarGalletita, guardarHoroscopo, horoscopoPara,
} from "../store.js";

let dir;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "pauta-test-"));
  process.env.DATA_DIR = dir; // el store lee DATA_DIR en cada llamada
});
after(() => rm(dir, { recursive: true, force: true }));

const items = [
  { id: 1, title: "Uno", url: "https://a.cl/1", domain: "a.cl", tono: "gracioso" },
  { id: 2, title: "Dos", url: "https://b.cl/2", domain: "b.cl", tono: "serio" },
  { id: 3, title: "Tres", url: "https://c.cl/3", domain: "c.cl", tono: "neutro" },
  { id: 4, title: "Cuatro", url: "https://d.cl/4", domain: "d.cl", tono: "neutro" },
];

test("create, get y list (más nueva primero)", async () => {
  const a = await createPauta({ criterio: "x", items });
  assert.match(a.id, /^\d{8}-\d{6}-[0-9a-f]{4}$/);
  assert.equal(a.items.length, 4);
  assert.ok(a.items.every((it) => it.done === false));
  await new Promise((r) => setTimeout(r, 1100)); // timestamps con resolución de segundos
  const b = await createPauta({ criterio: "", items: items.slice(0, 2) });

  assert.deepEqual(await getPauta(a.id), a);
  const list = await listPautas();
  assert.deepEqual(list.map((p) => p.id), [b.id, a.id]);
  assert.deepEqual(list[1], {
    id: a.id, createdAt: a.createdAt, updatedAt: a.updatedAt, count: 4, doneCount: 0, preview: ["Uno", "Dos", "Tres"],
  });
  assert.equal((await listPautas({ limit: 1 })).length, 1);
  assert.deepEqual(await readdir(dir).then((f) => f.filter((x) => x.endsWith(".tmp"))), []);
});

test("updatePauta reordena con una permutación válida", async () => {
  const p = await createPauta({ items });
  const u = await updatePauta(p.id, { order: [3, 1, 4, 2] });
  assert.deepEqual(u.items.map((it) => it.id), [3, 1, 4, 2]);
  assert.equal(u.items[0].title, "Tres");
  assert.ok(u.updatedAt >= p.updatedAt);
  assert.deepEqual((await getPauta(p.id)).items.map((it) => it.id), [3, 1, 4, 2]);
});

test("order inválido → 400", async () => {
  const p = await createPauta({ items });
  for (const order of [[1, 2, 3], [1, 2, 3, 3], [1, 2, 3, 99], [1, 2, 3, 4, 5], "1,2,3,4", [1, 2, 3, "4"]]) {
    await assert.rejects(updatePauta(p.id, { order }), (e) => e.status === 400, JSON.stringify(order));
  }
  assert.deepEqual((await getPauta(p.id)).items.map((it) => it.id), [1, 2, 3, 4]);
});

test("done marca exactamente los ids entregados", async () => {
  const p = await createPauta({ items });
  let u = await updatePauta(p.id, { done: [2, 4] });
  assert.deepEqual(u.items.map((it) => it.done), [false, true, false, true]);
  u = await updatePauta(p.id, { done: [1] });
  assert.deepEqual(u.items.map((it) => it.done), [true, false, false, false]);
  u = await updatePauta(p.id, { order: [4, 3, 2, 1], done: [4] });
  assert.deepEqual(u.items.map((it) => [it.id, it.done]), [[4, true], [3, false], [2, false], [1, false]]);
  await assert.rejects(updatePauta(p.id, { done: [7] }), (e) => e.status === 400);
  const [s] = (await listPautas()).filter((x) => x.id === p.id);
  assert.equal(s.doneCount, 1);
});

test("addItem suma la noticia de último minuto primera, con id nuevo", async () => {
  const p = await createPauta({ items });
  await updatePauta(p.id, { order: [3, 1, 4, 2], done: [1] });
  const { pauta, item } = await addItem(p.id, { title: "temblor fuerte", titulo: "Fuerte temblor en la zona central", tono: "serio" });
  assert.deepEqual(item, {
    id: 5, title: "temblor fuerte", titulo: "Fuerte temblor en la zona central", url: "", domain: "", tono: "serio", done: false, ultimo: true,
  });
  assert.deepEqual(pauta.items.map((it) => it.id), [5, 3, 1, 4, 2]);
  assert.deepEqual(pauta.items.map((it) => it.done), [false, false, true, false, false]);
  assert.deepEqual(await getPauta(p.id), pauta);
  // Después se puede mover con el reordenamiento de siempre.
  const u = await updatePauta(p.id, { order: [3, 1, 5, 4, 2] });
  assert.equal(u.items[2].titulo, "Fuerte temblor en la zona central");
  const { item: otro } = await addItem(p.id, { title: "otra", url: "https://e.cl/x", domain: "e.cl" });
  assert.equal(otro.id, 6);
  assert.equal(otro.titulo, "otra");
  assert.equal((await listPautas()).find((x) => x.id === p.id).preview[0], "otra");
  await assert.rejects(addItem("20000101-000000-abcd", { title: "x" }), (e) => e.status === 404);
  await assert.rejects(addItem("../x", { title: "x" }), (e) => e.status === 400);
});

test("removeItem saca una noticia y deja el resto igual", async () => {
  const p = await createPauta({ items });
  await updatePauta(p.id, { order: [3, 1, 4, 2], done: [4] });
  const u = await removeItem(p.id, 1);
  assert.deepEqual(u.items.map((it) => [it.id, it.done]), [[3, false], [4, true], [2, false]]);
  assert.deepEqual(await getPauta(p.id), u);
  await assert.rejects(removeItem(p.id, 1), (e) => e.status === 404);
  // El reordenamiento sigue funcionando con los que quedan.
  assert.deepEqual((await updatePauta(p.id, { order: [2, 3, 4] })).items.map((it) => it.id), [2, 3, 4]);
  const { item } = await addItem(p.id, { title: "nueva" });
  assert.equal(item.id, 5);
  await assert.rejects(removeItem("20000101-000000-abcd", 1), (e) => e.status === 404);
  await assert.rejects(removeItem("../x", 1), (e) => e.status === 400);
});

test("no encontrada → 404", async () => {
  const id = "20000101-000000-abcd";
  await assert.rejects(getPauta(id), (e) => e.status === 404);
  await assert.rejects(updatePauta(id, { done: [] }), (e) => e.status === 404);
  await assert.rejects(deletePauta(id), (e) => e.status === 404);
});

test("delete borra la pauta", async () => {
  const p = await createPauta({ items });
  await deletePauta(p.id);
  await assert.rejects(getPauta(p.id), (e) => e.status === 404);
  assert.ok(!(await listPautas()).some((x) => x.id === p.id));
});

test("ids inválidos se rechazan antes de tocar el disco", async () => {
  for (const id of ["../etc/passwd", "..%2Fx", "20261014-170908-ab12/../../x", "20261014-170908-AB12", "", null, 5]) {
    await assert.rejects(getPauta(id), (e) => e.status === 400, String(id));
    await assert.rejects(updatePauta(id, {}), (e) => e.status === 400);
    await assert.rejects(deletePauta(id), (e) => e.status === 400);
  }
});

test("editItem cambia el titular; vacío vuelve al título original", async () => {
  const p = await createPauta({ items });
  await updatePauta(p.id, { order: [3, 1, 4, 2], done: [1] });
  const { pauta, item } = await editItem(p.id, 1, { titulo: "  Perro   se roba un pollo " });
  assert.equal(item.titulo, "Perro se roba un pollo");
  assert.deepEqual(pauta.items.map((it) => [it.id, it.done]), [[3, false], [1, true], [4, false], [2, false]]);
  assert.deepEqual(await getPauta(p.id), pauta);
  assert.equal((await editItem(p.id, 1, { titulo: "  " })).item.titulo, item.title);
  await assert.rejects(editItem(p.id, 9, { titulo: "x" }), (e) => e.status === 404);
  await assert.rejects(editItem(p.id, 1, {}), (e) => e.status === 400);
  await assert.rejects(editItem(p.id, 1, { titulo: "x".repeat(301) }), (e) => e.status === 400);
  await assert.rejects(editItem("../x", 1, { titulo: "x" }), (e) => e.status === 400);
});

test("galletitas: las 15 salen una vez antes de repetir, y cada donación conserva la suya", async () => {
  const fecha = "2026-11-02";
  await assert.rejects(sacarGalletita(fecha, { donacion: "d0" }), { status: 409 });
  const textos = Array.from({ length: 15 }, (_, i) => `G${i + 1}`);
  await crearExtras(fecha, { tema: "lluvia", galletitas: textos });

  const vistas = new Set();
  for (let i = 0; i < 15; i++) {
    const r = await sacarGalletita(fecha, { donacion: `d${i}`, usuario: `@u${i}` });
    assert.equal(r.nueva, true);
    assert.equal(r.sinUsar, 14 - i);
    vistas.add(r.galleta.id);
  }
  assert.equal(vistas.size, 15); // ninguna repetida mientras quedaban sin usar

  // La misma donación recibe la misma galletita, sin gastar otra.
  const otra = await sacarGalletita(fecha, { donacion: "d3" });
  assert.equal(otra.nueva, false);
  assert.ok(otra.galleta.usos.some((u) => u.donacion === "d3" && u.usuario === "@u3"));

  // Con más de 15 donaciones se repiten, de a una vuelta.
  const r16 = await sacarGalletita(fecha, { donacion: "d15" });
  assert.equal(r16.galleta.usos.length, 2);
  assert.equal((await getExtras(fecha)).galletitas.reduce((n, g) => n + g.usos.length, 0), 16);

  // Generarlas de nuevo empieza de cero.
  await crearExtras(fecha, { tema: "sol", galletitas: textos });
  assert.ok((await getExtras(fecha)).galletitas.every((g) => g.usos.length === 0));
  await assert.rejects(async () => sacarGalletita(fecha, { donacion: "" }), { status: 400 });
  await assert.rejects(async () => sacarGalletita("ayer", { donacion: "x" }), { status: 400 });
});

test("editar una galletita, también la que ya se entregó", async () => {
  const fecha = "2026-11-03";
  await crearExtras(fecha, { tema: "x", galletitas: ["A", "B", "C"] });
  const { galleta } = await sacarGalletita(fecha, { donacion: "d1" });
  const { galleta: editada } = await editarGalletita(fecha, galleta.id, { texto: "  Nueva   versión " });
  assert.equal(editada.texto, "Nueva versión");
  assert.equal(editada.usos.length, 1); // conserva a quién le tocó
  assert.equal((await sacarGalletita(fecha, { donacion: "d1" })).galleta.texto, "Nueva versión");
  await assert.rejects(async () => editarGalletita(fecha, galleta.id, { texto: "  " }), { status: 400 });
  await assert.rejects(async () => editarGalletita(fecha, galleta.id, {}), { status: 400 });
  await assert.rejects(async () => editarGalletita(fecha, 99, { texto: "x" }), { status: 404 });
  await assert.rejects(async () => editarGalletita("2026-01-01", 1, { texto: "x" }), { status: 404 });
});

test("horóscopo: el del día, o el más cercano guardado", async () => {
  const h = (fecha) => ({ fuente: "Yolanda Sultana", url: "u", fecha, titulo: fecha, signos: [] });
  assert.equal(await horoscopoPara("2027-01-10"), null);
  await guardarHoroscopo(h("2027-01-08"));
  await guardarHoroscopo(h("2027-01-11"));
  assert.equal((await horoscopoPara("2027-01-08")).fecha, "2027-01-08");
  assert.equal((await horoscopoPara("2027-01-10")).fecha, "2027-01-11"); // a 1 día
  assert.equal((await horoscopoPara("2027-01-09")).fecha, "2027-01-08"); // empate: el anterior
  assert.equal(await horoscopoPara("2027-01-20"), null); // nada a menos de 3 días
  // No se mezcla con el historial de pautas.
  assert.ok((await listPautas()).every((p) => /^\d{8}-/.test(p.id)));
});

test("hoyChile usa la hora de Chile", () => {
  assert.equal(hoyChile(new Date("2026-11-02T02:30:00Z")), "2026-11-01"); // 23:30 en Chile
  assert.equal(hoyChile(new Date("2026-11-02T03:30:00Z")), "2026-11-02");
});
