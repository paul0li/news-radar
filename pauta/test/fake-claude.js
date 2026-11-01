#!/usr/bin/env node
// Claude falso para probar localmente sin gastar cuota: CLAUDE_BIN=./test/fake-claude.js
// Lee el prompt por stdin y devuelve los ids barajados con tonos al azar. Si el system prompt es
// de galletitas, devuelve 15 inventadas (generar) o las líneas del texto pegado (separar).
const DELAY = Number(process.env.FAKE_DELAY_MS ?? 1500);
const TONOS = ["gracioso", "serio", "neutro"];

let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (prompt += d));
process.stdin.on("end", () => {
  const system = process.argv[process.argv.indexOf("--system-prompt") + 1] || "";
  if (system.includes('"galletitas"')) {
    const galletitas = system.startsWith("Te pegan")
      ? prompt.split("\n").map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim()).filter((l) => l && !l.endsWith(":"))
      : Array.from({ length: 15 }, (_, i) => `(fake) Galletita ${i + 1}: ${prompt.slice(0, 40)}`);
    const out = { type: "result", subtype: "success", is_error: false, result: "ok", structured_output: { galletitas } };
    return setTimeout(() => process.stdout.write(JSON.stringify(out)), DELAY);
  }
  const ids = [...prompt.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const orden = ids.map((id) => {
    const tono = TONOS[Math.floor(Math.random() * TONOS.length)];
    return { id, tono, titulo: `(fake) Título reescrito ${id}` };
  });
  const out = {
    type: "result",
    subtype: "success",
    is_error: false,
    result: `Orden falso de ${orden.length} links.`,
    structured_output: { orden },
  };
  setTimeout(() => process.stdout.write(JSON.stringify(out)), DELAY);
});
