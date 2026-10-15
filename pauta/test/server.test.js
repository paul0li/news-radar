import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Levanta el server de verdad con el Claude falso (test/fake-claude.js) y un DATA_DIR temporal.
let dir, server, base;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "pauta-server-test-"));
  server = spawn(process.execPath, ["server.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", DATA_DIR: dir, APP_PASSWORD: "", CLAUDE_BIN: "./test/fake-claude.js", FAKE_DELAY_MS: "0" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  base = await new Promise((resolve, reject) => {
    let out = "";
    server.stdout.on("data", (d) => {
      out += d;
      const m = out.match(/http:\/\/([\d.]+:\d+)/);
      if (m) resolve(`http://${m[1]}`);
    });
    server.on("exit", (code) => reject(new Error(`el server terminó con código ${code}`)));
  });
});
after(async () => {
  server?.kill();
  await rm(dir, { recursive: true, force: true });
});

async function api(path, body, method = body ? "POST" : "GET") {
  const r = await fetch(base + path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}

async function armarPauta() {
  const texto = "Perro roba pollo https://a.cl/1\nSube la tasa https://b.cl/2\nGato abre refri https://c.cl/3";
  const { status, data } = await api("/api/ordenar", { texto });
  assert.equal(status, 200);
  return data.pauta;
}

test("último minuto: la IA redacta el titular y la noticia queda primera", async () => {
  const p = await armarPauta();
  const { status, data } = await api(`/api/pautas/${p.id}/ultimo`, { titular: "  temblor   fuerte zona central ", url: "https://www.emol.com/x" });
  assert.equal(status, 200);
  assert.equal(data.item.id, 4);
  assert.equal(data.item.title, "temblor fuerte zona central"); // lo que escribió la persona
  assert.equal(data.item.titulo, "(fake) Título reescrito 0"); // lo que redactó la IA
  assert.ok(["gracioso", "serio", "neutro"].includes(data.item.tono));
  assert.equal(data.item.domain, "emol.com");
  assert.equal(data.item.ultimo, true);

  const { data: { pauta } } = await api(`/api/pautas/${p.id}`);
  assert.deepEqual(pauta.items.map((it) => it.id), [4, ...p.items.map((it) => it.id)]);
  assert.equal(pauta.items[0].titulo, "(fake) Título reescrito 0");

  // Se puede mover a mano con el reordenamiento de siempre.
  const order = [...pauta.items.slice(1).map((it) => it.id), 4];
  const moved = await api(`/api/pautas/${p.id}`, { order }, "PUT");
  assert.equal(moved.status, 200);
  assert.deepEqual(moved.data.pauta.items.map((it) => it.id), order);

  // El banner de OBS la muestra (pauta más reciente).
  const { data: ticker } = await api("/api/ticker");
  assert.equal(ticker.id, p.id);
  assert.ok(ticker.titulares.some((t) => t.texto === "(fake) Título reescrito 0"));
});

test("último minuto sin link", async () => {
  const p = await armarPauta();
  const { status, data } = await api(`/api/pautas/${p.id}/ultimo`, { titular: "renuncia ministro" });
  assert.equal(status, 200);
  assert.equal(data.pauta.items[0].id, data.item.id);
  assert.equal(data.item.url, "");
  assert.equal(data.item.domain, "");
});

test("último minuto: errores", async () => {
  const p = await armarPauta();
  for (const body of [{}, { titular: "   " }, { titular: "x".repeat(301) }, { titular: "ok", url: "javascript:alert(1)" }]) {
    const { status } = await api(`/api/pautas/${p.id}/ultimo`, body);
    assert.equal(status, 400, JSON.stringify(body));
  }
  assert.equal((await api("/api/pautas/20000101-000000-abcd/ultimo", { titular: "x" })).status, 404);
  assert.equal((await api("/api/pautas/nope/ultimo", { titular: "x" })).status, 400);
  const { data } = await api(`/api/pautas/${p.id}`);
  assert.equal(data.pauta.items.length, 3); // nada se agregó
});
