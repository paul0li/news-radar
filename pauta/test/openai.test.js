import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

// Con OPENAI_API_KEY el server llama a la Responses API: aquí, un OpenAI falso local que guarda
// cada pedido y responde con salida estructurada.
let dir, server, base, openai;
const pedidos = [];
let siguiente = null; // respuesta a devolver en el próximo pedido

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "pauta-openai-test-"));
  openai = http.createServer(async (req, res) => {
    let cuerpo = "";
    for await (const c of req) cuerpo += c;
    pedidos.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(cuerpo) });
    const { status = 200, json } = siguiente;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(json));
  }).listen(0, "127.0.0.1");
  await new Promise((r) => openai.once("listening", r));
  server = spawn(process.execPath, ["server.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      ...process.env, PORT: "0", HOST: "127.0.0.1", DATA_DIR: dir, APP_PASSWORD: "", HOROSCOPO: "no",
      HOROSCOPO_URL: "http://127.0.0.1:9/", OPENAI_API_KEY: "sk-test", OPENAI_MODEL: "gpt-prueba",
      OPENAI_BASE_URL: `http://127.0.0.1:${openai.address().port}/v1`,
    },
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
  openai?.close();
  await rm(dir, { recursive: true, force: true });
});

const respuesta = (obj) => ({
  json: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(obj) }] }] },
});

async function api(path, body) {
  const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
}

test("ordenar usa la Responses API con esquema estricto y sin búsqueda", async () => {
  siguiente = respuesta({ orden: [{ id: 2, tono: "gracioso", titulo: "Gato abre refri" }, { id: 1, tono: "serio", titulo: "sube la tasa de interés" }] });
  const { status, data } = await api("/api/ordenar", { texto: "sube la tasa de interes https://b.cl/2\ngato abre refri https://c.cl/3" });
  assert.equal(status, 200);
  assert.equal(data.model, "gpt-prueba");
  assert.deepEqual(data.pauta.items.map((it) => it.titulo), ["gato abre refri", "sube la tasa de interés"]);
  const p = pedidos.at(-1);
  assert.equal(p.path, "/v1/responses");
  assert.equal(p.auth, "Bearer sk-test");
  assert.equal(p.body.model, "gpt-prueba");
  assert.equal(p.body.text.format.type, "json_schema");
  assert.equal(p.body.text.format.strict, true);
  assert.equal(p.body.tools, undefined);
});

test("generar galletitas habilita web_search", async () => {
  siguiente = respuesta({ galletitas: ["Hoy es tu día", "Mañana también"] });
  const { status, data } = await api("/api/extras", { tema: "dos galletitas" });
  assert.equal(status, 200);
  assert.deepEqual(data.galletitas.map((g) => g.texto), ["Hoy es tu día", "Mañana también"]);
  assert.deepEqual(pedidos.at(-1).body.tools, [{ type: "web_search" }]);
});

test("un error de OpenAI llega como 502 con su mensaje", async () => {
  siguiente = { status: 401, json: { error: { message: "Incorrect API key provided" } } };
  const { status, data } = await api("/api/ordenar", { texto: "algo https://a.cl/1" });
  assert.equal(status, 502);
  assert.match(data.error, /OpenAI: Incorrect API key/);
});
