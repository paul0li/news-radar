#!/usr/bin/env node
// Control remoto de OBS por obs-websocket v5 (OBS ≥ 28). Sin dependencias: Node ≥ 22 trae WebSocket.
//
// Configuración (fuera de la repo): ~/.config/obs-remote/env
//   OBS_HOST=asus            # nombre o IP en Tailscale
//   OBS_PORT=4455
//   OBS_PASSWORD=...         # la de Herramientas → Configuración del servidor WebSocket
//   OBS_BANNER=Titulares     # nombre de la fuente del banner en OBS
// Las variables de entorno con el mismo nombre tienen prioridad.

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AYUDA = `Uso: obs <comando>

  estado                   transmisión, grabación y escena actual
  escenas                  lista las escenas (★ = la que está al aire)
  escena "<nombre>"        cambia la escena al aire
  fuentes                  fuentes de la escena al aire (● visible, ○ oculta)
  mostrar "<fuente>"       muestra una fuente de la escena al aire
  ocultar "<fuente>"       oculta una fuente de la escena al aire
  banner on|off            muestra u oculta el banner de titulares (OBS_BANNER)
  grabar iniciar|detener   inicia o detiene la grabación
  transmision iniciar      inicia la transmisión
  transmision detener --si detiene la transmisión (pide --si para evitar accidentes)
  ping                     prueba la conexión (no necesita contraseña)`;

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(join(homedir(), ".config/obs-remote/env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2];
    }
  } catch {}
  const get = (k, def) => process.env[k] ?? env[k] ?? def;
  return {
    host: get("OBS_HOST", "asus"),
    port: Number(get("OBS_PORT", "4455")),
    password: get("OBS_PASSWORD", ""),
    banner: get("OBS_BANNER", "Titulares"),
  };
}

const sha256b64 = (s) => createHash("sha256").update(s).digest("base64");

// Abre la conexión, se identifica y devuelve { call, close, hello }.
function connect({ host, port, password }, { identify = true } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${host}:${port}`);
    const pending = new Map();
    let hello = null;
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`OBS no respondió en ${host}:${port}. ¿Está abierto OBS y el PC conectado a Tailscale?`));
    }, 6000);

    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`No pude conectar con ${host}:${port}. ¿Está abierto OBS con el servidor WebSocket activado?`));
    };
    ws.onclose = (e) => {
      clearTimeout(timer);
      if (e.code === 4009) reject(new Error("Contraseña incorrecta (revisa OBS_PASSWORD en ~/.config/obs-remote/env)."));
      for (const p of pending.values()) p.reject(new Error("Se cerró la conexión con OBS."));
    };
    ws.onmessage = (ev) => {
      const { op, d } = JSON.parse(ev.data);
      if (op === 0) {
        hello = d;
        if (!identify) { clearTimeout(timer); return resolve({ hello, close: () => ws.close() }); }
        const msg = { rpcVersion: 1, eventSubscriptions: 0 };
        if (d.authentication) {
          if (!password) { clearTimeout(timer); ws.close(); return reject(new Error("OBS pide contraseña: agrega OBS_PASSWORD en ~/.config/obs-remote/env.")); }
          const { salt, challenge } = d.authentication;
          msg.authentication = sha256b64(sha256b64(password + salt) + challenge);
        }
        ws.send(JSON.stringify({ op: 1, d: msg }));
      } else if (op === 2) {
        clearTimeout(timer);
        resolve({
          hello,
          close: () => ws.close(),
          call(requestType, requestData) {
            const requestId = randomUUID();
            ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
            return new Promise((res, rej) => pending.set(requestId, { res, rej, reject: rej }));
          },
        });
      } else if (op === 7) {
        const p = pending.get(d.requestId);
        if (!p) return;
        pending.delete(d.requestId);
        if (d.requestStatus.result) p.res(d.responseData || {});
        else p.rej(new Error(d.requestStatus.comment || `OBS rechazó ${d.requestType} (código ${d.requestStatus.code}).`));
      }
    };
  });
}

const dur = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`;
};

async function setVisible(obs, source, enabled) {
  const { currentProgramSceneName: sceneName } = await obs.call("GetCurrentProgramScene");
  let sceneItemId;
  try {
    ({ sceneItemId } = await obs.call("GetSceneItemId", { sceneName, sourceName: source }));
  } catch {
    throw new Error(`No encontré la fuente "${source}" en la escena "${sceneName}". Usa "obs fuentes" para ver los nombres.`);
  }
  await obs.call("SetSceneItemEnabled", { sceneName, sceneItemId, sceneItemEnabled: enabled });
  return `${enabled ? "Mostrando" : "Ocultando"} "${source}" en "${sceneName}".`;
}

async function main() {
  const [cmd, arg, flag] = process.argv.slice(2);
  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "ayuda") return console.log(AYUDA);
  const cfg = loadEnv();

  if (cmd === "ping") {
    const { hello, close } = await connect(cfg, { identify: false });
    close();
    return console.log(`OBS responde en ${cfg.host}:${cfg.port} (obs-websocket ${hello.obsWebSocketVersion}, ${hello.authentication ? "con" : "sin"} contraseña).`);
  }

  const obs = await connect(cfg);
  try {
    switch (cmd) {
      case "estado": {
        const [st, rec, sc] = await Promise.all([obs.call("GetStreamStatus"), obs.call("GetRecordStatus"), obs.call("GetCurrentProgramScene")]);
        console.log(`Transmisión: ${st.outputActive ? `🔴 AL AIRE (${dur(st.outputDuration)})` : "apagada"}`);
        console.log(`Grabación:   ${rec.outputActive ? `⏺ grabando (${dur(rec.outputDuration)})` : "apagada"}`);
        console.log(`Escena:      ${sc.currentProgramSceneName}`);
        if (st.outputActive) console.log(`Frames perdidos: ${st.outputSkippedFrames}/${st.outputTotalFrames}`);
        break;
      }
      case "escenas": {
        const { scenes, currentProgramSceneName } = await obs.call("GetSceneList");
        for (const s of scenes.slice().reverse()) console.log(`${s.sceneName === currentProgramSceneName ? "★" : " "} ${s.sceneName}`);
        break;
      }
      case "escena":
        if (!arg) throw new Error('Falta el nombre: obs escena "Nombre"');
        await obs.call("SetCurrentProgramScene", { sceneName: arg });
        console.log(`Escena al aire: ${arg}`);
        break;
      case "fuentes": {
        const { currentProgramSceneName: sceneName } = await obs.call("GetCurrentProgramScene");
        const { sceneItems } = await obs.call("GetSceneItemList", { sceneName });
        console.log(`Escena "${sceneName}":`);
        for (const it of sceneItems.slice().reverse()) console.log(`  ${it.sceneItemEnabled ? "●" : "○"} ${it.sourceName}`);
        break;
      }
      case "mostrar":
      case "ocultar":
        if (!arg) throw new Error(`Falta la fuente: obs ${cmd} "Nombre"`);
        console.log(await setVisible(obs, arg, cmd === "mostrar"));
        break;
      case "banner":
        if (arg !== "on" && arg !== "off") throw new Error("Uso: obs banner on|off");
        console.log(await setVisible(obs, cfg.banner, arg === "on"));
        break;
      case "grabar":
        if (arg === "iniciar") { await obs.call("StartRecord"); console.log("Grabación iniciada."); }
        else if (arg === "detener") { const r = await obs.call("StopRecord"); console.log(`Grabación detenida${r.outputPath ? `: ${r.outputPath}` : "."}`); }
        else throw new Error("Uso: obs grabar iniciar|detener");
        break;
      case "transmision":
        if (arg === "iniciar") { await obs.call("StartStream"); console.log("Transmisión iniciada."); }
        else if (arg === "detener") {
          if (flag !== "--si") throw new Error("Para detener la transmisión confirma con: obs transmision detener --si");
          await obs.call("StopStream");
          console.log("Transmisión detenida.");
        } else throw new Error("Uso: obs transmision iniciar | obs transmision detener --si");
        break;
      default:
        throw new Error(`Comando desconocido: ${cmd}\n\n${AYUDA}`);
    }
  } finally {
    obs.close();
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
