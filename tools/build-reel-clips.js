// ======================================================
// build-reel-clips.js — Ensambla el reel final 1080x1920 para Instagram a
// partir de las GRABACIONES reales de la app (social/assets/*.mp4).
//
//   Los clips crudos son largos (arena 19s, editor 26s, paint 56s). Este
//   script recorta el mejor tramo de cada uno (ss/dur), encuadra la region
//   util (crop), lo mete en una "ventana" con marco de neon y superpone el
//   diseño de marca (kicker/titulo/subtitulo/dots). Cierra con un outro y
//   concatena todo con fundidos (xfade) + pista de audio silenciosa para que
//   Instagram permita añadir musica al publicar.
//
// Uso (Linux):
//   FFMPEG=/ruta/ffmpeg CHROME=/ruta/chrome node tools/build-reel-clips.js
// En Windows usar tools/build-reel.js (pipeline original desde .capture).
// ======================================================
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'social', 'assets');
const workDir = join(root, 'social', '.build');
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const chrome = process.env.CHROME || 'chromium';
const OUT = join(root, 'social', 'eteria-robotics-studio-reel-final.mp4');

const W = 1080, H = 1920, FPS = 30;
const BG = '#0b0e14', CYAN = '#32d4ff', GREEN = '#6de7b7';
const XFADE = 0.4, OUTRO_DUR = 4.2;

await mkdir(workDir, { recursive: true });
const evenify = (n) => 2 * Math.round(n / 2);

// ── Escenas: cada una recorta el mejor tramo de un clip real ──
// crop = region util del clip (px). ss/dur = tramo elegido dentro del clip.
const SCENES = [
  {
    id: 'arena', src: 'arena.mp4', ss: 2.4, dur: 4.2,
    crop: { x: 220, y: 100, w: 856, h: 900 },
    kicker: 'ETERIA TECH PRESENTA', title: 'Eteria Robotics<br>Studio',
    sub: 'Aprende robótica programando sumobots', accent: CYAN, dot: 0,
  },
  {
    id: 'editor', src: 'editor.mp4', ss: 12.5, dur: 5.4,
    crop: { x: 112, y: 1035, w: 800, h: 738 },
    kicker: 'CÓDIGO REAL', title: 'Programa en<br>Python o bloques',
    sub: 'La misma API que el robot físico', accent: GREEN, dot: 1,
  },
  {
    id: 'combate', src: 'arena.mp4', ss: 7.2, dur: 4.2,
    crop: { x: 220, y: 100, w: 856, h: 900 },
    kicker: 'ARENA 3D', title: 'Simula el combate<br>antes de competir',
    sub: 'Física real y reglas oficiales de sumobot', accent: CYAN, dot: 2,
  },
  {
    id: 'pintura', src: 'paint.mp4', ss: 19.5, dur: 6.2,
    crop: { x: 72, y: 92, w: 1004, h: 1560 },
    kicker: 'HAZLO TUYO', title: 'Pinta y personaliza<br>tu robot',
    sub: 'Editor de diseño 3D integrado', accent: GREEN, dot: 3,
  },
];

// ── layout de la ventana de footage segun el aspecto del crop ──
function holeFor(crop) {
  const ar = crop.h / crop.w;
  let w = 1000, h = Math.round(w * ar);
  const maxH = 1150;
  if (h > maxH) { h = maxH; w = Math.round(h / ar); }
  w = evenify(w); h = evenify(h);
  const x = Math.round((W - w) / 2);
  const y = Math.round(620 + (1150 - h) / 2);
  return { x, y, w, h };
}

// ── overlay de marca (fondo opaco con ventana recortada + textos) ──
function overlayHtml(sc, hole) {
  const dots = [0, 1, 2, 3].map(i =>
    `<span style="width:${i === sc.dot ? 34 : 10}px" class="dot ${i === sc.dot ? 'on' : ''}"></span>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${W}px; height:${H}px; background:transparent; overflow:hidden;
    font-family:'Segoe UI', system-ui, 'DejaVu Sans', sans-serif; }
  .punch { position:absolute; left:${hole.x}px; top:${hole.y}px; width:${hole.w}px; height:${hole.h}px;
    border-radius:26px; border:2px solid ${sc.accent}66;
    box-shadow: 0 0 90px 6px ${sc.accent}40, 0 0 0 4000px ${BG}; }
  .vig { position:absolute; left:0; top:0; width:${W}px; height:560px;
    background: radial-gradient(120% 130% at 50% -30%, ${sc.accent}1f 0%, transparent 62%); }
  .vig2 { position:absolute; left:0; bottom:0; width:${W}px; height:130px;
    background: linear-gradient(0deg, ${sc.accent}12 0%, transparent 100%); }
  .head { position:absolute; left:60px; right:60px; top:170px; text-align:center; }
  .kicker { display:inline-block; padding:14px 30px; border:1.5px solid ${sc.accent}99; border-radius:999px;
    color:${sc.accent}; font-size:30px; font-weight:700; letter-spacing:7px; }
  h1 { margin-top:44px; color:#f2f5fb; font-size:96px; line-height:1.06; font-weight:800; letter-spacing:-1px; }
  h1 b { color:${sc.accent}; }
  .sub { margin-top:30px; color:#aab3c8; font-size:40px; font-weight:500; }
  .dots { position:absolute; left:0; right:0; top:${hole.y + hole.h + 44}px; text-align:center; }
  .dot { display:inline-block; height:10px; border-radius:99px; background:#3a4356; margin:0 7px; vertical-align:middle; }
  .dot.on { background:${sc.accent}; box-shadow:0 0 14px ${sc.accent}; }
  .brand { position:absolute; left:0; right:0; bottom:96px; text-align:center;
    color:#8b94ab; font-size:34px; font-weight:600; letter-spacing:3px; }
  .brand b { color:#e8ecf5; }
</style></head><body>
  <div class="punch"></div>
  <div class="vig"></div><div class="vig2"></div>
  <div class="head">
    <div class="kicker">${sc.kicker}</div>
    <h1>${sc.title}</h1>
    <div class="sub">${sc.sub}</div>
  </div>
  <div class="dots">${dots}</div>
  <div class="brand"><b>ETERIA</b> TECH · ROBOTICS STUDIO</div>
</body></html>`;
}

function outroHtml() {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${W}px; height:${H}px; overflow:hidden;
    font-family:'Segoe UI', system-ui, 'DejaVu Sans', sans-serif;
    background: radial-gradient(90% 60% at 50% 0%, #14202e 0%, ${BG} 60%); }
  .glow { position:absolute; left:50%; top:34%; width:900px; height:900px; transform:translate(-50%,-50%);
    background: radial-gradient(circle, ${CYAN}22 0%, transparent 60%); }
  .wrap { position:absolute; left:60px; right:60px; top:300px; text-align:center; }
  .logo { color:${CYAN}; font-size:38px; font-weight:800; letter-spacing:10px; }
  h1 { margin-top:36px; color:#f2f5fb; font-size:110px; line-height:1.04; font-weight:800; }
  .free { display:inline-block; margin-top:56px; padding:20px 48px; border-radius:999px;
    background:linear-gradient(90deg, ${CYAN}, ${GREEN}); color:#07131c; font-size:42px; font-weight:800; }
  .web { margin-top:44px; color:#aab3c8; font-size:40px; }
  .web b { color:#fff; }
  .shot { position:absolute; left:50%; bottom:220px; transform:translateX(-50%) rotate(-2.5deg);
    width:820px; border-radius:22px; border:2px solid #2b3446;
    box-shadow: 0 30px 90px #000c, 0 0 70px ${CYAN}2e; }
  .cta { position:absolute; left:0; right:0; bottom:110px; text-align:center;
    color:${GREEN}; font-size:44px; font-weight:700; letter-spacing:2px; }
  .brand { position:absolute; left:0; right:0; bottom:52px; text-align:center;
    color:#8b94ab; font-size:30px; font-weight:600; letter-spacing:3px; }
</style></head><body>
  <div class="glow"></div>
  <div class="wrap">
    <div class="logo">ETERIA TECH</div>
    <h1>Eteria Robotics<br>Studio</h1>
    <div class="free">GRATIS · EN TU NAVEGADOR</div>
    <div class="web">Búscalo: <b>Eteria Robotics Studio</b></div>
  </div>
  <img class="shot" src="../.capture/app-final.png">
  <div class="cta">▶ Link en bio</div>
  <div class="brand">ETERIA TECH · ROBOTICS STUDIO</div>
</body></html>`;
}

async function renderPng(htmlFile, pngFile) {
  await run(chrome, [
    '--headless=new', '--no-sandbox', '--no-first-run', '--disable-gpu',
    `--window-size=${W},${H}`, '--default-background-color=00000000',
    '--force-color-profile=srgb', '--virtual-time-budget=4000', '--hide-scrollbars',
    `--screenshot=${pngFile}`, `file://${htmlFile}`,
  ]);
}

async function probeDur(file) {
  try {
    await run(ffmpeg, ['-hide_banner', '-i', file]);
  } catch (e) {
    const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(e.stderr || '');
    if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
  }
  return null;
}

// ── 1. recorta + encuadra el tramo de cada clip ──
async function encodeScene(sc) {
  const src = join(assets, sc.src);
  const hole = holeFor(sc.crop);
  const c = { x: evenify(sc.crop.x), y: evenify(sc.crop.y), w: evenify(sc.crop.w), h: evenify(sc.crop.h) };
  const raw = join(workDir, `${sc.id}_clip.mp4`);
  await run(ffmpeg, ['-y', '-ss', String(sc.ss), '-t', String(sc.dur), '-i', src,
    '-an', '-vf',
    `crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${hole.w}:${hole.h}:flags=lanczos,fps=${FPS},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', raw]);
  const realDur = await probeDur(raw);
  return { raw, hole, dur: realDur || sc.dur };
}

const composed = [];
for (const sc of SCENES) {
  console.log(`Escena ${sc.id} (${sc.src} ${sc.ss}s +${sc.dur}s)...`);
  const { raw, hole, dur } = await encodeScene(sc);
  const htmlFile = join(workDir, `${sc.id}.html`);
  const pngFile = join(workDir, `${sc.id}.png`);
  await writeFile(htmlFile, overlayHtml(sc, hole));
  await renderPng(htmlFile, pngFile);
  const outMp4 = join(workDir, `${sc.id}_final.mp4`);
  await run(ffmpeg, ['-y', '-i', raw, '-i', pngFile,
    '-filter_complex',
    `color=c=${BG.replace('#', '0x')}:s=${W}x${H}:r=${FPS}:d=${dur}[bg];` +
    `[bg][0:v]overlay=${hole.x}:${hole.y}:shortest=1[b1];[b1][1:v]overlay=0:0,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', outMp4]);
  composed.push({ file: outMp4, dur });
}

// ── 2. outro con zoom lento ──
console.log('Outro...');
const outroHtmlFile = join(workDir, 'outro.html');
const outroPng = join(workDir, 'outro.png');
await writeFile(outroHtmlFile, outroHtml());
await renderPng(outroHtmlFile, outroPng);
const outroMp4 = join(workDir, 'outro_final.mp4');
await run(ffmpeg, ['-y', '-i', outroPng,
  '-vf', `scale=${W}:${H},zoompan=z='min(zoom+0.0006,1.06)':d=${Math.round(OUTRO_DUR * FPS)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},format=yuv420p`,
  '-t', String(OUTRO_DUR),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', outroMp4]);
composed.push({ file: outroMp4, dur: OUTRO_DUR });

// ── 3. concat con xfade + audio silencioso ──
console.log('Concatenando...');
const inputs = composed.flatMap(c => ['-i', c.file]);
let fc = '', prev = '[0:v]', offset = 0;
for (let i = 1; i < composed.length; i++) {
  offset += composed[i - 1].dur - XFADE;
  const out = i === composed.length - 1 ? '[vout]' : `[x${i}]`;
  fc += `${prev}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(3)}${out};`;
  prev = `[x${i}]`;
}
fc = fc.slice(0, -1);
await run(ffmpeg, ['-y', ...inputs, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
  '-filter_complex', fc, '-map', '[vout]', '-map', `${composed.length}:a`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart', OUT]);

const totalDur = composed.reduce((s, c) => s + c.dur, 0) - XFADE * (composed.length - 1);
console.log(`LISTO → ${OUT} (${totalDur.toFixed(1)}s)`);
