// ======================================================
// capture-app-clips.js — Graba clips REALES de la app (arena 3D, editor,
// combate, editor de pintura) usando Chrome + CDP screencast.
// Salida: social/.capture/<escena>/f*.jpg + manifest.json (timestamps + rects).
// Uso: node tools/serve.js  (aparte)  →  node tools/capture-app-clips.js
// ======================================================
import { spawn, execFile } from 'node:child_process';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = join(root, '.tmp-chrome-capture');
const outRoot = join(root, 'social', '.capture');
const port = 9333;
const appUrl = 'http://127.0.0.1:8080/';

await rm(profile, { recursive: true, force: true }).catch(() => {});
await rm(outRoot, { recursive: true, force: true }).catch(() => {});
await mkdir(profile, { recursive: true });
await mkdir(outRoot, { recursive: true });

const child = spawn(chrome, [
  '--new-window', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`,
  '--window-size=1620,1060', '--window-position=40,10',
  '--mute-audio', '--disable-session-crashed-bubble', '--hide-crash-restore-bubble',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion',
  `--user-data-dir=${profile}`,
  appUrl,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getTab() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const tabs = await res.json();
      const tab = tabs.find(t => t.type === 'page' && t.url.includes('8080') && t.webSocketDebuggerUrl);
      if (tab) return tab;
    } catch {}
    await sleep(400);
  }
  throw new Error('No se encontró la pestaña de la app');
}

const tab = await getTab();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();

// ── estado de screencast ──
let cast = null; // { dir, frames: [{file, ts}], n }

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' timeout')); } }, 60000);
  });
}

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id);
    if (msg.error) p.rej(new Error(JSON.stringify(msg.error))); else p.res(msg.result);
    return;
  }
  if (msg.method === 'Page.screencastFrame') {
    const { data, metadata, sessionId } = msg.params;
    send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    if (cast) {
      const n = cast.frames.length;
      const file = join(cast.dir, `f${String(n).padStart(5, '0')}.jpg`);
      cast.frames.push({ file, ts: metadata.timestamp });
      const stream = createWriteStream(file);
      stream.end(Buffer.from(data, 'base64'));
    }
  }
});

await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});

await send('Runtime.enable');
await send('Page.enable');

async function evalJson(expr) {
  const r = await send('Runtime.evaluate', { expression: `JSON.stringify(${expr})`, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return JSON.parse(r.result.value);
}
async function evalVoid(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: false, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
}

async function startCast(name) {
  const dir = join(outRoot, name);
  await mkdir(dir, { recursive: true });
  cast = { dir, frames: [] };
  await send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
}
async function stopCast() {
  await send('Page.stopScreencast');
  await sleep(300);
  const done = cast; cast = null;
  return done.frames.map(f => ({ file: f.file, ts: f.ts }));
}

// ── mouse helpers (coordenadas CSS del viewport) ──
async function mouse(type, x, y, opts = {}) {
  await send('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), ...opts });
}
async function drag(x0, y0, points, button = 'left', stepMs = 16) {
  const buttons = button === 'right' ? 2 : 1;
  await mouse('mousePressed', x0, y0, { button, buttons, clickCount: 1 });
  for (const [x, y] of points) {
    await mouse('mouseMoved', x, y, { button, buttons });
    await sleep(stepMs);
  }
  const last = points[points.length - 1] || [x0, y0];
  await mouse('mouseReleased', last[0], last[1], { button, buttons: 0, clickCount: 1 });
}
function line(x0, y0, x1, y1, steps) {
  const pts = [];
  for (let i = 1; i <= steps; i++) pts.push([x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps]);
  return pts;
}
function wave(x0, y0, x1, amp, cycles, steps) {
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    pts.push([x0 + (x1 - x0) * t, y0 + Math.sin(t * Math.PI * 2 * cycles) * amp]);
  }
  return pts;
}

const manifest = { scenes: {}, meta: {} };

// ── localizar el robot en pantalla por luminancia (blanco sobre fondo oscuro) ──
const runFile = promisify(execFile);
const ffmpegBin = process.env.FFMPEG || 'C:\\Users\\sebas\\AppData\\Local\\Temp\\claude\\D--Datos-Proyectos-Web-SumobotArenaIDE\\2f540b9a-a753-4696-956b-460ba519183a\\scratchpad\\ffmpeg-8.1.2-essentials_build\\bin\\ffmpeg.exe';

async function findRobot(pe, iw) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const png = join(outRoot, '_probe.png');
  const raw = join(outRoot, '_probe.raw');
  await writeFile(png, Buffer.from(shot.data, 'base64'));
  await runFile(ffmpegBin, ['-y', '-i', png, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw]);
  const buf = await readFile(raw);
  const W = iw; // dpr=1 → screenshot en px CSS
  // margen interior para ignorar bordes/cursores del viewport
  const x0 = Math.round(pe.x + 8), x1 = Math.round(pe.x + pe.w - 8);
  const y0 = Math.round(pe.y + 40), y1 = Math.round(pe.y + pe.h - 8);
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, count = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * W + x) * 3;
      if (buf[i] + buf[i + 1] + buf[i + 2] > 430) { // gris claro del chasis
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        count++;
      }
    }
  }
  if (count < 200) return null;
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

try {
  // ── 1. esperar carga completa (GLB + Monaco) ──
  console.log('Esperando carga de la app...');
  {
    const deadline = Date.now() + 90000;
    let ready = false, blanks = 0;
    while (Date.now() < deadline) {
      const st = await evalJson(`({
        url: location.href, ready: document.readyState,
        sel: !!document.getElementById('selLang'), monaco: !!document.querySelector('.monaco-editor'),
      })`).catch(e => ({ err: e.message }));
      if (st.sel && st.monaco && st.ready === 'complete') { ready = true; break; }
      if (st.url === 'about:blank' && ++blanks === 4) {
        console.log('  navegando explícitamente...');
        await send('Page.navigate', { url: appUrl }).catch(() => {});
      }
      console.log('  esperando...', JSON.stringify(st));
      await sleep(1500);
    }
    if (!ready) throw new Error('La app no terminó de cargar');
    await sleep(3000);
  }

  // entrar a SumoLab desde la pantalla de inicio
  await evalVoid(`(() => {
    const l = document.getElementById('landSumolab');
    if (l) l.click();
    window.getSelection && window.getSelection().removeAllRanges();
  })()`);
  console.log('Entrando a SumoLab...');
  await sleep(8000); // GLB + three.js + layout del dock
  manifest.meta = await evalJson(`({
    dpr: window.devicePixelRatio, iw: innerWidth, ih: innerHeight,
    langs: [...document.getElementById('selLang').options].map(o=>o.value),
    bots: [...document.getElementById('selB').options].map(o=>o.value),
  })`);
  console.log('Meta:', JSON.stringify(manifest.meta));

  // cerrar cualquier overlay/tour que haya aparecido
  await evalVoid(`document.querySelectorAll('.tour-overlay .tour-close, .lu-box button, .mm-close').forEach(b=>b.click())`).catch(() => {});

  // rects de paneles (CSS px)
  const rects = await evalJson(`(() => {
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const arena = document.getElementById('arena');
    const monaco = document.querySelector('.monaco-editor');
    const editorPanel = monaco ? monaco.closest('.dock-panel-body') || monaco : document.getElementById('code');
    return { arena: r(arena), editor: r(editorPanel), full: { x: 0, y: 0, w: innerWidth, h: innerHeight } };
  })()`);
  manifest.meta.rects = rects;
  console.log('Rects:', JSON.stringify(rects));

  const bots = manifest.meta.bots;
  const botA = bots.find(b => /react/i.test(b)) || bots[bots.length - 1];
  const botB = bots.find(b => /spin|gira/i.test(b)) || bots[0];

  // ── 2. escena "arena": combate con órbita lenta de cámara ──
  console.log('Escena arena...');
  await evalVoid(`(() => {
    const sA = document.getElementById('selA'); sA.value = ${JSON.stringify(botA)}; sA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(300);
  await evalVoid(`(() => {
    const sB = document.getElementById('selB'); sB.value = ${JSON.stringify(botB)}; sB.dispatchEvent(new Event('change'));
  })()`);
  await sleep(1500);

  const a = rects.arena;
  const acx = a.x + a.w / 2, acy = a.y + a.h / 2;
  await startCast('arena');
  await sleep(700);
  // órbita suave y corta (no perder el dojo de cuadro)
  await drag(acx + a.w * 0.15, acy + 15, line(acx + a.w * 0.15, acy + 15, acx - a.w * 0.15, acy - 5, 200), 'left', 30);
  await sleep(1200);
  manifest.scenes.arena = await stopCast();

  // ── 3. escena "editor": código Python apareciendo (typewriter) ──
  console.log('Escena editor...');
  await evalVoid(`(() => {
    const sl = document.getElementById('selLang');
    if ([...sl.options].some(o => o.value === 'py')) { sl.value = 'py'; sl.dispatchEvent(new Event('change')); }
  })()`);
  await sleep(1500);
  const pyCode = [
    'from ideaboard import IdeaBoard',
    'from hcsr04 import HCSR04',
    'import time',
    '',
    'ib = IdeaBoard()',
    '',
    'while True:',
    '    d = sonar.dist_cm()',
    '    if 0 < d < 40:',
    '        # ¡Enemigo detectado: embiste!',
    '        ib.motor_1.throttle = 1.0',
    '        ib.motor_2.throttle = 1.0',
    '    else:',
    '        # Busca girando sobre su eje',
    '        ib.motor_1.throttle = 0.6',
    '        ib.motor_2.throttle = -0.6',
    '    time.sleep(0.02)',
  ].join('\n');
  await evalVoid(`window.SumoEditor.setValue('')`);
  await sleep(400);
  await startCast('editor');
  await sleep(500);
  await evalVoid(`(() => {
    const code = ${JSON.stringify(pyCode)};
    let i = 0;
    const t = setInterval(() => {
      i += 3;
      window.SumoEditor.setValue(code.slice(0, i));
      if (i >= code.length) clearInterval(t);
    }, 50);
  })()`);
  await sleep(Math.ceil(pyCode.length / 3) * 50 + 1400);
  manifest.scenes.editor = await stopCast();

  // ── 4. escena "combate": reinicio + choque, un poco más rápido ──
  console.log('Escena combate...');
  await evalVoid(`(() => {
    const sp = document.getElementById('speed'); sp.value = 1.5; sp.dispatchEvent(new Event('input'));
    document.getElementById('btnReset').click();
  })()`);
  await sleep(600);
  await startCast('combate');
  await sleep(9500);
  manifest.scenes.combate = await stopCast();

  // ── 5. escena "pintura": abrir editor de pintura y pintar de verdad ──
  console.log('Escena pintura...');
  await evalVoid(`document.getElementById('btnPaint').click()`);
  await sleep(4500); // GLB + viewport 3D

  const pe = await evalJson(`(() => {
    const b = document.querySelector('#peViewport3d canvas').getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  })()`);
  manifest.meta.rects.paint = pe;
  const pcx = pe.x + pe.w / 2, pcy = pe.y + pe.h / 2;
  // el robot queda algo abajo del centro del viewport
  const rx = pcx, ry = pcy + pe.h * 0.13;

  const pickSwatch = (i) => evalVoid(`document.querySelectorAll('.pe-cp-swatch')[${i}].click()`);
  const wheel = async (n, dy) => {
    for (let i = 0; i < n; i++) {
      await mouse('mouseWheel', rx, ry, { deltaX: 0, deltaY: dy });
      await sleep(140);
    }
  };

  await startCast('pintura');
  await sleep(700);
  // acercar el robot (rueda = zoom) hasta que llene el viewport
  await wheel(7, -160);
  await sleep(700);

  // localizar el robot de verdad (análisis de píxeles del screenshot)
  let bot = await findRobot(pe, manifest.meta.iw);
  console.log('  robot detectado:', JSON.stringify(bot));
  if (!bot) bot = { cx: rx, cy: ry, w: pe.w * 0.25, h: pe.h * 0.3 };

  // color cian (índice 4) — franja ondulada sobre el panel frontal (mitad baja)
  await pickSwatch(4);
  await sleep(350);
  let sy = bot.cy + bot.h * 0.18;
  await drag(bot.cx - bot.w * 0.30, sy, wave(bot.cx - bot.w * 0.30, sy, bot.cx + bot.w * 0.30, bot.h * 0.06, 1.5, 60), 'left', 26);
  await sleep(500);

  // girar el robot (clic derecho = rotar) — punto de agarre fuera del modelo
  await drag(pe.x + pe.w * 0.80, pe.y + pe.h * 0.5, line(pe.x + pe.w * 0.80, pe.y + pe.h * 0.5, pe.x + pe.w * 0.62, pe.y + pe.h * 0.48, 55), 'right', 22);
  await sleep(600);

  // re-localizar tras el giro y pintar franja verde (índice 3)
  bot = (await findRobot(pe, manifest.meta.iw)) || bot;
  console.log('  robot tras giro:', JSON.stringify(bot));
  await pickSwatch(3);
  await sleep(350);
  sy = bot.cy + bot.h * 0.30;
  await drag(bot.cx - bot.w * 0.28, sy, wave(bot.cx - bot.w * 0.28, sy, bot.cx + bot.w * 0.28, bot.h * 0.05, 1, 50), 'left', 26);
  await sleep(400);

  // color amarillo (índice 2) — trazo corto más arriba del panel
  await pickSwatch(2);
  await sleep(350);
  sy = bot.cy + bot.h * 0.05;
  await drag(bot.cx - bot.w * 0.20, sy, line(bot.cx - bot.w * 0.20, sy, bot.cx + bot.w * 0.20, sy, 35), 'left', 26);
  await sleep(900);
  manifest.scenes.pintura = await stopCast();

  // ── 6. screenshot del robot pintado en la arena (para el cierre) ──
  console.log('Screenshot final...');
  await evalVoid(`document.getElementById('peApply')?.click()`).catch(() => {});
  await sleep(800);
  await evalVoid(`document.getElementById('peClose')?.click()`).catch(() => {});
  await sleep(1500);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(outRoot, 'app-final.png'), Buffer.from(shot.data, 'base64'));

  await writeFile(join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const counts = Object.fromEntries(Object.entries(manifest.scenes).map(([k, v]) => [k, v.length]));
  console.log('OK. Frames por escena:', JSON.stringify(counts));
} catch (e) {
  console.error('ERROR:', e.message);
  try {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(outRoot, 'error.png'), Buffer.from(shot.data, 'base64'));
    console.error('Screenshot de diagnóstico: social/.capture/error.png');
  } catch {}
  process.exitCode = 1;
} finally {
  try { ws.close(); } catch {}
  try { child.kill(); } catch {}
}
