import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPauta, getPauta, listPautas, updatePauta, deletePauta } from "../store.js";

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
