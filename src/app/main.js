// ======================================================
// main.js — App de navegador: editor + sandbox + partida en vivo en 3D.
// ======================================================
import { Round } from '../engine/engine.js';
import { RULES, ROBOT, SIM, START } from '../shared/config.js';
import { createScene } from '../render/scene.js';
import { compileBot } from '../runtime/sandbox.js';
import { PyBridge } from '../runtime/pybridge.js';
import { loadWorlds, loadMission } from '../curriculum/CurriculumLoader.js';
import { getProgress, completeMission, recordAttempt } from '../curriculum/ProgressTracker.js';
import { evaluarMision } from '../curriculum/MissionRunner.js';
import { getBestHint, getCodeWarnings, getCriteriaProgress } from '../curriculum/HintEngine.js';
import { checkAchievements, loadAchievements } from '../curriculum/AchievementEngine.js';
import { SFX, initRipples, observeRipples, burstConfetti, shimmerXp, animateTabTransition, initCursorGlow } from './ux.js';
import {
  ensureBlocksEditor, generarPython, resumenBloques, getWorkspaceJson, loadWorkspaceJson,
  setPyblockMission,
} from './blocks.js';
import { ensurePainter, openPainter } from './paint/index.js';
import { initDock } from './dock/dockManager.js';
import { initMenubar } from './dock/menubar.js';
import * as ProjectManager from './projectManager.js';
import { initDeviceUI } from './deviceUI.js';
import './settings.js';
import { initI18n, t, getLang, setLang as setUILang, onLangChange } from './i18n.js';

initI18n();
initLangSwitcher();
initDock(document.getElementById('dockRoot'));
initMenubar({
  project: {
    supportsFS: ProjectManager.supportsFS,
    getCurrentProjectName: () => ProjectManager.getCurrentProjectName(),
    newProject:    () => ProjectManager.newProject({ resetState: resetProjectState }),
    openProject:   () => ProjectManager.openProject({ applyState: applyProjectState }),
    saveProject:   () => ProjectManager.saveProject({ getState: getProjectState }),
    saveProjectAs: () => ProjectManager.saveProjectAs({ getState: getProjectState }),
    importProject: () => ProjectManager.importProject({ applyState: applyProjectState }),
    exportProject: () => ProjectManager.exportProject({ getState: getProjectState }),
  },
  notify: (msg, cls) => logLine(msg, cls),
});
initDeviceUI({
  getUploadCode: () => getUploadCode(),
  openDeviceFile: (name, content) => loadDeviceFileIntoEditor(name, content),
  notify: (msg, cls) => logLine(msg, cls),
});

// ── Selector de idioma (header + landing) ────────────────────────────────────
function initLangSwitcher() {
  const sel = document.getElementById('selLangUI');
  const landBtns = Array.from(document.querySelectorAll('.land-lang-btn'));

  const syncControls = (lang) => {
    if (sel) sel.value = lang;
    landBtns.forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
  };

  if (sel) sel.addEventListener('change', () => setUILang(sel.value));
  landBtns.forEach((b) => b.addEventListener('click', () => setUILang(b.dataset.lang)));
  onLangChange(syncControls);
  syncControls(getLang());

  // Refresca las partes dinámicas que no se regeneran solas cada frame:
  // etiquetas del panel de misión y los modales abiertos (mapa / logros).
  onLangChange(() => {
    try {
      if (mLearn && mLearn.mission) {
        const d = mLearn.mission;
        $('mpWorldLabel').textContent = t('mission.worldLabel', { n: d.mundo, title: d.titulo });
        updateHintBtn();
      }
      refreshXp();
      if ($('missionModal').classList.contains('open')) {
        if (_currentTab === 'logros') renderAchievementsTab(); else openModal();
      }
    } catch (_) { /* aún no inicializado */ }
  });
}

import StraightBot from '../bots/straight.js';
import SpinnerBot from '../bots/spinner.js';
import CenterBot from '../bots/center.js';
import ReactiveBot from '../bots/reactive.js';

const BOTS = { StraightBot, SpinnerBot, CenterBot, ReactiveBot };
const USER = '__user__';
const NOOP = { name: 'Tu código', update: () => ({ left: 0, right: 0 }) };
const POS_NAME = { 1: 'ESPALDAS', 2: 'DE_LADO', 3: 'DE_FRENTE' };

const $ = (id) => document.getElementById(id);
const scene = createScene($('arena'), (colRadius) => {
  ROBOT.COL_R = colRadius;
  ROBOT.SIZE = colRadius * 2;
});

// Puente hacia el Worker de Python (lazy). El bot Python publica sensores y
// lee los motores que el código del usuario fijó en el worker.
let bridge = null;
const pythonBot = {
  name: 'Tu código (Python)',
  update(s) {
    if (bridge) { bridge.publishSensors(s); return bridge.readMotors(); }
    return { left: 0, right: 0 };
  },
};
async function getBridge() {
  if (!bridge) { bridge = new PyBridge(); await bridge.init((m, l) => logLine(m, l)); }
  return bridge;
}

const M = {
  mode: 'rival', // 'rival' | 'solo'
  lang: 'py',    // 'py' | 'js' | 'blocks' | 'cpp'
  botAName: 'ReactiveBot', botBName: 'SpinnerBot', userBot: null,
  scoreA: 0, scoreB: 0, round: 1, startPos: START.ESPALDAS, salidas: 0,
  cur: null, phase: 'fight', endTimer: 0,
  paused: false, speed: 1, acc: 0, lastT: 0, resultMsg: '',
  _learnMode: false, _missionLines: 0, _overlays: false,
};

const resolveBot = (name) => (name === USER ? (M.userBot || NOOP) : BOTS[name]);

// ── consola ──
function logLine(text, cls = 'log') {
  const el = $('console');
  const div = document.createElement('div');
  div.className = cls; div.textContent = text;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
  while (el.childElementCount > 200) el.removeChild(el.firstChild);
  if (M._learnMode && cls !== 'ok' && cls !== 'warn') M._missionLines++;
  // forward to pop-out console
  if (window._sumoBc) try { window._sumoBc.postMessage({ type: 'log', text, cls }); } catch (_) {}
}

// ── partida ──
function newRound() {
  const b = M.mode === 'solo' ? null : resolveBot(M.botBName);
  M.cur = new Round(resolveBot(M.botAName), b, M.startPos, 1 + M.round);
  M.phase = 'fight';
}
function newMatch() {
  M.scoreA = 0; M.scoreB = 0; M.round = 1; M.startPos = START.ESPALDAS;
  M.salidas = 0; M.resultMsg = ''; M.acc = 0;
  newRound();
}
// Traduce las razones que devuelve el motor (strings en español) a la UI activa.
// Si es una falla de software (código del usuario), se deja tal cual para depurar.
const REASON_KEYS = {
  'saliste del ring': 'reason.saliste',
  'sobreviviste el límite': 'reason.sobreviviste',
  'doble salida': 'reason.dobleSalida',
  'tiempo: empate': 'reason.empateTiempo',
  'tiempo: gana el más centrado': 'reason.centrado',
};
function transReason(reason) {
  if (!reason) return reason;
  return REASON_KEYS[reason] ? t(REASON_KEYS[reason]) : reason;
}

function endRound(res) {
  if (res.winner === 'A') M.scoreA++; else if (res.winner === 'B') M.scoreB++;
  const aName = M.botAName === USER ? t('hud.userCode') : M.botAName;
  M.resultMsg = res.winner === 'draw' ? t('result.draw', { reason: transReason(res.reason) })
    : t('result.win', { name: res.winner === 'A' ? aName : M.botBName, reason: transReason(res.reason) });
  if (res.reason && res.reason.includes('falla SW')) logLine(res.reason, 'error');
  M.phase = 'roundend'; M.endTimer = 1.6;
}
function advanceMatch() {
  if (M.scoreA >= 2 || M.scoreB >= 2 || M.round >= RULES.ROUNDS) {
    M.phase = 'matchend';
    const aName = M.botAName === USER ? t('hud.userCode') : M.botAName;
    M.resultMsg = M.scoreA > M.scoreB ? t('result.matchWinA', { name: aName })
      : M.scoreB > M.scoreA ? t('result.matchWinB', { name: M.botBName }) : t('result.matchDraw');
  } else {
    M.round++; M.startPos = (M.startPos % 3) + 1; newRound();
  }
}

function endRoundSolo(res) {
  if (res.reason && res.reason.includes('falla SW')) logLine(res.reason, 'error');
  if (res.winner === 'out') { M.salidas++; M.resultMsg = t('result.soloOut', { n: M.salidas }); }
  else M.resultMsg = t('result.soloSurvive');
  M.phase = 'roundend'; M.endTimer = 1.2;
}

function update(realDt) {
  if (M.paused) return;
  if (M.phase === 'fight') {
    M.acc += realDt * M.speed;
    // El bridge de Python maneja al robot A tanto en modo Python como en Bloques
    // (los bloques se traducen a CircuitPython y corren en el mismo worker).
    // Sin esto, el sleep() del worker no progresa y el bucle se congela tras
    // la primera iteración → los sensores parecen "no funcionar".
    const pyActive = (bridge && M.botAName === USER && M.userBot === pythonBot);
    let guard = 0;
    while (M.acc >= SIM.DT && guard++ < 4000) {
      const s = M.cur.step(); M.acc -= SIM.DT;
      if (pyActive) bridge.advance(SIM.DT * 1000); // hace progresar el sleep de Python
      if (s.done) {
        if (M.mode === 'solo') endRoundSolo(s); else endRound(s);
        break;
      }
    }
  } else if (M.phase === 'roundend') {
    if (!M._learnMode) {
      M.endTimer -= realDt;
      if (M.endTimer <= 0) {
        if (M.mode === 'solo') newRound(); else advanceMatch();
      }
    }
  }
}

function drawHUD() {
  const st    = M.cur.getState();
  const solo  = M.mode === 'solo';
  const uA    = st.sA.enemy.distance == null ? '—' : st.sA.enemy.distance.toFixed(0) + ' cm';

  if (solo) {
    $('round').textContent    = t('hud.free');
    $('score').textContent    = t('hud.exits', { n: M.salidas });
    $('startpos').textContent = t('hud.noRival');
    $('stateA').textContent   = `M: L=${st.A.left.toFixed(2)} R=${st.A.right.toFixed(2)}`;
    $('stateB').textContent   = '';
  } else {
    $('round').textContent    = `${M.round} / ${RULES.ROUNDS}`;
    $('score').textContent    = `${M.scoreA} – ${M.scoreB}`;
    $('startpos').textContent = t('hud.startPrefix', { pos: t('pos.' + POS_NAME[M.startPos]) });
    const uB = st.sB.enemy.distance == null ? '—' : st.sB.enemy.distance.toFixed(0) + ' cm';
    $('stateA').textContent   = `A  L=${st.A.left.toFixed(2)} R=${st.A.right.toFixed(2)}  📡${uA}`;
    $('stateB').textContent   = `B  L=${st.B.left.toFixed(2)} R=${st.B.right.toFixed(2)}  📡${uB}`;
  }

  $('time').textContent         = `${st.tLeft.toFixed(1)} s`;
  $('result-panel').textContent = M.phase === 'fight' ? (M.paused ? t('hud.paused') : t('hud.fighting')) : M.resultMsg;
  $('result').textContent       = M.phase === 'fight' ? '' : M.resultMsg;
  $('speedLabel').textContent   = `×${M.speed.toFixed(2)}`;

  // Botón Ejecutar: color + texto según estado
  const isUserActive = M.botAName === USER;
  const active = isUserActive && M.phase === 'fight' && !M.paused;
  const paused = isUserActive && M.paused;
  const btn = $('btnRun');
  btn.classList.toggle('running', active);
  btn.classList.toggle('paused',  paused);
  $('btnRunLabel').textContent = active ? t('toolbar.run.active') : paused ? t('toolbar.run.paused') : t('toolbar.run');
}

let _bcTick = 0;
function frame(now) {
  const realDt = Math.min(0.05, (now - M.lastT) / 1000 || 0);
  M.lastT = now;
  update(realDt);
  const st = M.cur.getState();
  // Actualizar LED del modelo 3D con el pixel del bridge Python
  if (bridge && bridge.data) {
    scene.setPixelColor(bridge.data[7] || 0, bridge.data[8] || 0, bridge.data[9] || 0);
  } else {
    scene.setPixelColor(0, 0, 0);
  }
  scene.render(st, M.paused, M._overlays);
  drawHUD();
  if (M._learnMode) learnTick(realDt);

  // Broadcast to pop-out windows every 4 frames (~15 fps)
  if (window._sumoBc && (++_bcTick % 4 === 0)) {
    const bc = window._sumoBc;
    const aName = M.botAName === '__user__' ? 'Tu código' : M.botAName;
    // State for control popup
    try {
      bc.postMessage({
        type: 'state',
        round: M.round, scoreA: M.scoreA, scoreB: M.scoreB,
        tLeft: Math.max(0, RULES.COMBAT_TIME - st.t).toFixed(1),
        phase: M.phase, resultMsg: M.resultMsg,
        stateA: `A  L=${st.A.left.toFixed(2)} R=${st.A.right.toFixed(2)}`,
        stateB: M.mode === 'rival' ? `B  L=${st.B.left.toFixed(2)} R=${st.B.right.toFixed(2)}` : '',
      });
    } catch (_) {}
    // Canvas frame for arena popup — only if someone is listening
    try {
      const canvas = $('arena');
      bc.postMessage({
        type: 'frame',
        img: canvas.toDataURL('image/jpeg', 0.7),
        round: M.round, scoreA: M.scoreA, scoreB: M.scoreB,
        tLeft: Math.max(0, RULES.COMBAT_TIME - st.t).toFixed(1),
        resultMsg: M.phase !== 'fight' ? M.resultMsg : '',
      });
    } catch (_) {}
  }

  requestAnimationFrame(frame);
}

// ── ejecutar el código del usuario ──
async function runUserCode() {
  if (M.lang === 'py')  return runPython();
  if (M.lang === 'cpp') return runCpp();
  if (M.lang === 'blocks') {
    // Los bloques se traducen a CircuitPython y corren en el worker de Python,
    // exactamente igual que el código Python escrito a mano.
    const code = generarPython();
    if (!code) { logLine('✗ El editor de pyblock no está listo.', 'error'); return; }
    return runPython(code, `🧩 pyblock (${resumenBloques()}) → CircuitPython`);
  }

  const ed = window.SumoEditor;
  if (!ed) { logLine('El editor aún está cargando…', 'warn'); return; }
  const res = compileBot(ed.getValue(), { onLog: (m, lvl) => logLine('bot> ' + m, lvl) });
  if (!res.ok) { logLine('✗ ' + res.error, 'error'); return; }
  if (bridge) bridge.stop();
  M.userBot = res.bot; M.botAName = USER; $('selA').value = USER;
  logLine(M.mode === 'solo' ? '✓ Compilado. Modo libre: Tu código' : `✓ Compilado. Combate: Tu código vs ${M.botBName}`, 'ok');
  newMatch();
}

// C++ no se ejecuta en el navegador: se descarga el .ino para el robot real.
function runCpp() {
  const ed = window.SumoEditor;
  if (!ed) { logLine('El editor aún está cargando…', 'warn'); return; }
  const blob = new Blob([ed.getValue()], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sumobot.ino';
  a.click();
  URL.revokeObjectURL(a.href);
  logLine('⚙️ C++ corre en el robot real (ESP32), no en el simulador. Se descargó "sumobot.ino".', 'warn');
  logLine('   Ábrelo con Arduino IDE o PlatformIO y súbelo al robot.', 'log');
  logLine('📖 Documentación oficial: https://docs.arduino.cc/language-reference/', 'log');
  logLine('   Para probar tu estrategia aquí, usa Python, JavaScript o pyblock.', 'log');
}

async function runPython(codeOverride, etiqueta) {
  let code = codeOverride;
  if (code == null) {
    const ed = window.SumoEditor;
    if (!ed) { logLine('El editor aún está cargando…', 'warn'); return; }
    code = ed.getValue();
  }
  if (typeof SharedArrayBuffer === 'undefined' || !self.crossOriginIsolated) {
    const sab = typeof SharedArrayBuffer === 'undefined' ? 'SharedArrayBuffer no disponible' : 'crossOriginIsolated=false';
    logLine(`✗ Python bloqueado (${sab}). Reinicia Live Server y recarga la página. Si el problema persiste, usa JavaScript en vez de Python.`, 'error');
    return;
  }
  try {
    const b = await getBridge();
    b.start(code);
    M.userBot = pythonBot; M.botAName = USER; $('selA').value = USER;
    const lines = code.trim().split('\n').length;
    const quien = etiqueta || '✓ Python';
    logLine(M.mode === 'solo'
      ? `${quien} en ejecución (modo libre) · ${lines} líneas.`
      : `${quien} en ejecución vs ${M.botBName} · ${lines} líneas.`, 'ok');
    newMatch();
  } catch (e) {
    logLine('✗ ' + (e && e.message ? e.message : e), 'error');
  }
}

// ── UI ──
function fillSelect(sel, val, includeUser) {
  if (includeUser) {
    const o = document.createElement('option');
    o.value = USER; o.textContent = t('hud.userCode'); o.dataset.i18n = 'hud.userCode'; sel.appendChild(o);
  }
  for (const name of Object.keys(BOTS)) {
    const o = document.createElement('option');
    o.value = name; o.textContent = name; sel.appendChild(o);
  }
  sel.value = val;
}
fillSelect($('selA'), M.botAName, true);
fillSelect($('selB'), M.botBName, false);
// ── Cambio de lenguaje (py / js / blocks / cpp) ──
const LANG_INFO = {
  py:     { nombre: '🐍 Python (CircuitPython)', msg: 'La misma API que el robot real. Pulsa "▶ Ejecutar" para correrlo.' },
  js:     { nombre: '✨ JavaScript',             msg: 'Define update(s) y devuelve { left, right }. Pulsa "▶ Ejecutar".' },
  blocks: { nombre: '🧩 pyblock',                msg: 'Arrastra bloques desde la paleta (motores, sensores, bucles, variables…). Se traducen a CircuitPython: pulsa "🐍 Ver código" para verlo y "▶ Ejecutar" para correrlo.' },
  cpp:    { nombre: '⚙️ C++ (Arduino)',          msg: 'Código del robot real (ESP32). "▶ Ejecutar" descarga el .ino para subirlo con Arduino IDE.' },
};
const _starterCache = {};
async function loadStarter(lang, path, fallback) {
  if (_starterCache[lang] == null) {
    try { _starterCache[lang] = await (await fetch(path)).text(); }
    catch (_) { _starterCache[lang] = fallback; }
  }
  return _starterCache[lang];
}

async function setLang(lang) {
  M.lang = lang;
  $('selLang').value = lang;
  const esBloques = lang === 'blocks';
  $('monaco-container').style.display = esBloques ? 'none' : '';
  $('blocksEditor').style.display = esBloques ? '' : 'none';
  if (esBloques) ensureBlocksEditor($('blocksEditor')); // inyecta Blockly la primera vez (necesita el div visible)
  setPyblockMission(esBloques && M._learnMode ? mLearn.mission : null);

  if (!esBloques && window.SumoEditor) {
    let code;
    if (lang === 'cpp')      code = await loadStarter('cpp', './content/starter.cpp', '// Error: no se pudo cargar content/starter.cpp');
    else if (lang === 'py')  code = await loadStarter('py',  './content/starter.py',  '# Error: no se pudo cargar content/starter.py');
    else                     code = await loadStarter('js',  './content/starter.js',  '// Error: no se pudo cargar content/starter.js');
    window.SumoEditor.setValue(code);
    if (window.SumoEditor.setLanguage) window.SumoEditor.setLanguage(lang);
  }
  if (lang !== 'py' && bridge) bridge.stop();
  const info = LANG_INFO[lang] || LANG_INFO.js;
  logLine('Lenguaje: ' + info.nombre + '. ' + info.msg, 'ok');
}
$('selLang').onchange = (e) => setLang(e.target.value);

// ── Proyectos (.sumo): estado que se guarda/carga con projectManager.js ──
// El módulo de proyectos no conoce Monaco/Blockly/M; solo intercambia estos
// objetos planos vía getProjectState()/applyProjectState()/resetProjectState().
function getProjectState() {
  const state = { lang: M.lang, mode: M.mode, botBName: M.botBName };
  if (M.lang === 'blocks') state.blocksWorkspace = getWorkspaceJson();
  else if (window.SumoEditor) state.code = window.SumoEditor.getValue();
  return state;
}

async function applyProjectState(data) {
  data = data || {};
  M.mode = data.mode === 'solo' ? 'solo' : 'rival';
  $('selMode').value = M.mode;
  $('selB').disabled = (M.mode === 'solo');
  if (data.botBName && BOTS[data.botBName]) { M.botBName = data.botBName; $('selB').value = data.botBName; }

  const lang = (data.lang && LANG_INFO[data.lang]) ? data.lang : 'py';
  await setLang(lang); // prepara Monaco o Blockly según corresponda

  if (lang === 'blocks') {
    if (data.blocksWorkspace) loadWorkspaceJson(data.blocksWorkspace);
  } else if (window.SumoEditor && typeof data.code === 'string') {
    window.SumoEditor.setValue(data.code);
  }
  newMatch();
}

async function resetProjectState() {
  M.mode = 'rival';
  $('selMode').value = 'rival';
  $('selB').disabled = false;
  await setLang('py');
  newMatch();
}

// ── Subir al robot: el mismo código que se simula, sin modificarlo ──
// Solo py/blocks son CircuitPython válido para la IdeaBoard real; JS es el
// bot del sandbox del navegador y C++ ya tiene su propio flujo (.ino).
function getUploadCode() {
  if (M.lang === 'py') return window.SumoEditor ? window.SumoEditor.getValue() : null;
  if (M.lang === 'blocks') return generarPython();
  return null;
}

// Abrir un archivo leído de la CIRCUITPY (panel "Archivos del robot") en el editor.
// .py se trata como CircuitPython (mismo editor que "Subir al robot"); cualquier
// otro archivo de texto se carga tal cual, sin forzar el lenguaje.
async function loadDeviceFileIntoEditor(name, content) {
  if (name.toLowerCase().endsWith('.py') && M.lang !== 'py') await setLang('py');
  if (window.SumoEditor) window.SumoEditor.setValue(content);
}

// Atajos de teclado: Ctrl/Cmd+S guardar, +Shift+S guardar como, +O abrir.
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (key === 's') {
    e.preventDefault();
    (e.shiftKey ? ProjectManager.saveProjectAs : ProjectManager.saveProject)({ getState: getProjectState })
      .then((r) => { if (r.ok) logLine(`💾 Proyecto guardado: ${r.name}`, 'ok'); else if (r.error) logLine('✗ ' + r.error, 'error'); })
      .catch((err) => logLine('✗ ' + (err.message || err), 'error'));
  } else if (key === 'o') {
    e.preventDefault();
    ProjectManager.openProject({ applyState: applyProjectState })
      .then((r) => { if (r.ok) logLine(`📂 Proyecto abierto: ${r.name}`, 'ok'); })
      .catch((err) => logLine('✗ ' + (err.message || err), 'error'));
  }
});

$('selMode').onchange = (e) => {
  M.mode = e.target.value;
  $('selB').disabled = (M.mode === 'solo');
  newMatch();
};
$('selA').onchange = (e) => { if (e.target.value === USER) { runUserCode(); } else { M.botAName = e.target.value; newMatch(); } };
$('selB').onchange = (e) => { M.botBName = e.target.value; newMatch(); };
$('btnRun').onclick = runUserCode;
$('btnReset').onclick = () => newMatch();
$('btnPause').onclick = () => {
  M.paused = !M.paused;
  const pb = $('btnPause');
  pb.classList.toggle('active', M.paused);
  pb.querySelector('span') && (pb.querySelector('span').textContent = M.paused ? 'Reanudar' : 'Pausa');
};
$('speed').oninput = (e) => { M.speed = parseFloat(e.target.value); };

// ── Botón overlays de sensores ──
function setOverlaysActive(on) {
  M._overlays = on;
  const btn = $('btnOverlays');
  btn.style.color        = on ? '#a855f7' : 'var(--muted)';
  btn.style.borderColor  = on ? '#a855f744' : 'transparent';
  btn.style.background   = on ? '#a855f714' : 'none';
}
$('btnOverlays').onclick = () => setOverlaysActive(!M._overlays);

// El editor pyblock (Blockly) se inyecta perezosamente en setLang('blocks'),
// porque Blockly necesita que su contenedor sea visible para medirse.

// Atajo global: Ctrl/Cmd + Enter = Ejecutar (fuera del editor Monaco;
// dentro lo captura el comando propio de Monaco).
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (document.activeElement && document.activeElement.closest('.monaco-editor')) return;
    e.preventDefault();
    runUserCode();
  }
});

logLine('Listo. Elige tu lenguaje (🧩 pyblock, 🐍 Python, ✨ JS o ⚙️ C++) y pulsa "▶ Ejecutar mi bot" o Ctrl+Enter.', 'ok');
newMatch();
M.lastT = performance.now();
requestAnimationFrame(frame);

// ══════════════════════════════════════════════════════
// LEARN MODE — misiones guiadas
// ══════════════════════════════════════════════════════
const mLearn = {
  mission: null, hintIndex: 0, timerActive: false, timerRemaining: 0,
  lastMetrics: null, lastExtra: null, liveStars: 0,
};

let _toastTimer = null;
function showCodeToast(msg) {
  const el = $('codeToast');
  if (!el) return;
  el.textContent = '⚠️ ' + msg;
  el.style.display = 'block';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function learnTick(dt) {
  if (!mLearn.timerActive) return;
  mLearn.timerRemaining -= dt * M.speed;
  $('mpTimerVal').textContent = Math.max(0, mLearn.timerRemaining).toFixed(1) + ' s';
  updateMissionProgress(true);
  if (mLearn.timerRemaining <= 0) {
    mLearn.timerActive = false;
    $('mpTimerWrap').style.display = 'none';
    M.paused = true;   // congela la simulación tras el test
    doEvaluate();
  }
}

function buildExtra() {
  const pixelColor = bridge ? [bridge.data[7] || 0, bridge.data[8] || 0, bridge.data[9] || 0] : [0, 0, 0];
  return {
    consoleLines: M._missionLines,
    pixelColor,
    codigoActual: M.lang === 'blocks' ? (generarPython() || '') : (window.SumoEditor ? window.SumoEditor.getValue() : ''),
  };
}

function resetMissionProgress() {
  mLearn.liveStars = 0;
  const pct = $('mpProgressPct'); if (pct) pct.textContent = '0%';
  const fill = $('mpProgressFill'); if (fill) fill.style.width = '0%';
  const note = $('mpProgressNote'); if (note) note.textContent = t('mission.progress.note');
  for (let i = 1; i <= 3; i++) {
    const star = $('mpLiveStar' + i);
    if (star) {
      star.classList.remove('earned', 'pop');
      star.style.animationDelay = '';
    }
  }
}

function criterionPct(c) {
  if (c.passed) return 100;
  if (c.target != null) {
    const v = Math.max(0, c.value || 0);
    return Math.max(0, Math.min(99, (v / c.target) * 100));
  }
  return 0;
}

function updateMissionProgress(animate = true) {
  if (!mLearn.mission) return;
  const metrics = M.cur ? M.cur.getMetrics() : { distanceTraveled: 0, totalAngleChange: 0, motorsActivated: false };
  const extra = buildExtra();
  const criteria = getCriteriaProgress(mLearn.mission, metrics, extra);
  const { estrellas } = evaluarMision(mLearn.mission, metrics, extra);
  const pct = criteria.length
    ? Math.round(criteria.reduce((sum, c) => sum + criterionPct(c), 0) / criteria.length)
    : 0;

  const pctEl = $('mpProgressPct'); if (pctEl) pctEl.textContent = pct + '%';
  const fill = $('mpProgressFill'); if (fill) fill.style.width = pct + '%';
  const note = $('mpProgressNote');
  if (note) {
    const next = criteria.find(c => !c.passed);
    note.textContent = next ? t('mission.progress.next', { desc: next.descripcion }) : t('mission.progress.done');
  }

  for (let i = 1; i <= 3; i++) {
    const star = $('mpLiveStar' + i);
    if (!star) continue;
    const earned = i <= estrellas;
    star.classList.toggle('earned', earned);
    if (animate && earned && i > mLearn.liveStars) {
      star.classList.remove('pop');
      void star.offsetWidth;
      star.classList.add('pop');
    }
  }
  if (animate && estrellas > mLearn.liveStars && estrellas > 0) SFX.star(estrellas);
  mLearn.liveStars = Math.max(mLearn.liveStars, estrellas);
}

async function doEvaluate() {
  if (!mLearn.mission) return;
  const metrics  = M.cur ? M.cur.getMetrics() : { distanceTraveled: 0, totalAngleChange: 0, motorsActivated: false };
  const extra    = buildExtra();
  const criteria = getCriteriaProgress(mLearn.mission, metrics, extra);
  const { estrellas, feedback } = evaluarMision(mLearn.mission, metrics, extra);
  const prevNivel = getProgress().nivel;
  const { xpGanado, gemasGanadas, esMejor } = completeMission(
    mLearn.mission.id, estrellas, mLearn.mission.xp || 100, mLearn.mission.desbloquea || []
  );
  mLearn.lastMetrics = metrics;
  mLearn.lastExtra   = extra;
  updateMissionProgress(false);
  showResultOverlay(estrellas, feedback, xpGanado, gemasGanadas, esMejor, criteria);
  refreshXp();

  // Level-up
  const newNivel = getProgress().nivel;
  if (newNivel > prevNivel) setTimeout(() => showLevelUp(newNivel), 900);

  // Logros
  try {
    const worlds = await loadWorlds();
    const [worldId] = mLearn.mission.id.split('.');
    const worldMissions = (worlds.find(w => String(w.id) === worldId) || {}).misiones || [];
    const nuevos = await checkAchievements({
      misionId: mLearn.mission.id, estrellas, metrics, extra,
      hintUsed: mLearn.hintIndex > 0, worldMissions,
    });
    refreshXp();
    if (nuevos.length) queueAchievementToasts(nuevos);
  } catch (_) {}
}

function showResultOverlay(estrellas, feedback, xpGanado, gemasGanadas, esMejor, criteria) {
  // Reset star animations
  for (let i = 1; i <= 3; i++) {
    const el = $('roStar' + i);
    el.classList.remove('earned');
    el.style.animationDelay = '';
  }
  $('resultOverlay').classList.add('open');
  for (let i = 1; i <= 3; i++) {
    if (i <= estrellas) {
      const el = $('roStar' + i);
      el.style.animationDelay = (i - 1) * 0.18 + 's';
      void el.offsetWidth;
      el.classList.add('earned');
    }
  }
  $('roTitle').textContent = estrellas === 3 ? t('result.title.perfect') : estrellas > 0 ? t('result.title.done') : t('result.title.retry');
  $('roFeedback').textContent = feedback;
  const xpEl = $('roXp');
  if (xpGanado > 0 && esMejor) { xpEl.textContent = '+' + xpGanado + ' XP'; xpEl.style.display = 'block'; }
  else xpEl.style.display = 'none';
  const gemasEl = $('roGemas');
  if (gemasGanadas > 0 && esMejor) { gemasEl.textContent = '+' + gemasGanadas + ' 💎'; gemasEl.style.display = 'block'; }
  else gemasEl.style.display = 'none';
  const hasNext = (mLearn.mission.desbloquea || []).length > 0;
  $('roNextBtn').style.display = hasNext ? '' : 'none';
  if (estrellas > 0) { SFX.star(estrellas); if (estrellas === 3) burstConfetti(28); }
  else if (estrellas === 0) SFX.error();

  // Criteria detail rows
  const critEl = $('roCriteria');
  critEl.innerHTML = '';
  if (criteria && criteria.length) {
    criteria.forEach(({ descripcion, passed, value, target, unit }) => {
      const row = document.createElement('div');
      row.className = 'ro-criterion ' + (passed ? 'pass' : 'fail');
      let valText = '';
      let pct     = 0;
      if (target != null) {
        const v = Math.max(0, value || 0);
        pct     = Math.min(100, Math.round((v / target) * 100));
        valText = v.toFixed(unit === '°' ? 0 : 1) + ' / ' + target + ' ' + unit;
      }
      row.innerHTML =
        '<span class="ro-crit-icon">' + (passed ? '✓' : '○') + '</span>' +
        '<div class="ro-crit-body">' +
          '<div class="ro-crit-label">' + descripcion + '</div>' +
          (target != null
            ? '<div class="ro-crit-track"><div class="ro-crit-fill" style="width:' + pct + '%"></div></div>'
            : '') +
        '</div>' +
        (valText ? '<span class="ro-crit-val">' + valText + '</span>' : '');
      critEl.appendChild(row);
    });
  }
}

const NIVELES_XP = [0, 500, 1500, 3500, 7000, 12000];
function refreshXp() {
  const p = getProgress();
  $('xpVal').textContent = p.xp;
  $('gemVal').textContent = p.gemas || 0;
  // Header badge
  const nivel = p.nivel || 1;
  const xp    = p.xp || 0;
  const cur   = NIVELES_XP[nivel - 1] || 0;
  const next  = NIVELES_XP[nivel]     || NIVELES_XP[NIVELES_XP.length - 1];
  const pct   = nivel >= NIVELES_XP.length ? 100 : Math.round(((xp - cur) / (next - cur)) * 100);
  // Mission panel XP bar
  const mpNiv = $('mpNivelNum'); if (mpNiv) mpNiv.textContent = nivel;
  const mpXp  = $('mpXpNum');   if (mpXp)  mpXp.textContent  = xp;
  const mpFil = $('mpXpFill');  if (mpFil) { mpFil.style.width = pct + '%'; shimmerXp(mpFil); }
  const mpLbl = $('mpNivelLabel');
  if (mpLbl) {
    mpLbl.textContent = nivel >= NIVELES_XP.length
      ? t('mission.levelUp.max')
      : t('mission.level.progress', { cur: xp - cur, next: next - cur, lvl: nivel + 1 });
  }
}

function playStarSound(stars) { SFX.star(stars); } // legacy alias

async function selectMission(id) {
  try {
    const data = await loadMission(id);
    mLearn.mission = data;
    mLearn.hintIndex = 0;
    mLearn.timerActive = false;
    $('mpTimerWrap').style.display = 'none';
    M._missionLines = 0;
    resetMissionProgress();

    $('mpWorldLabel').textContent = t('mission.worldLabel', { n: data.mundo, title: data.titulo });
    $('mpTitle').textContent = data.titulo;
    $('mpTagline').textContent = data.tagline;
    $('mpObjetivo').textContent = data.objetivo;
    $('mpNarrativa').textContent = data.narrativa;
    updateHintBtn();

    if (window.SumoEditor && data.codigo_inicial)
      window.SumoEditor.setValue(data.codigo_inicial);

    // El estudiante puede aprender con Python o con pyblock: alternar entre 'py' y 'blocks'
    // es libre y no se pisa al cambiar de misión. Solo normalizamos si venía de JS/C++
    // (lenguajes de SumoLab libre, no pensados para las misiones guiadas).
    if (!['py', 'blocks'].includes(M.lang)) M.lang = data.lenguaje || 'py';
    $('selLang').value = M.lang;
    $('monaco-container').style.display = M.lang === 'blocks' ? 'none' : '';
    $('blocksEditor').style.display = M.lang === 'blocks' ? '' : 'none';
    if (M.lang === 'blocks') ensureBlocksEditor($('blocksEditor'));
    setPyblockMission(M.lang === 'blocks' ? data : null);
    if (M.lang !== 'blocks' && window.SumoEditor && window.SumoEditor.setLanguage)
      window.SumoEditor.setLanguage(M.lang);
    if (M.lang !== 'py' && bridge) bridge.stop();

    // Sync mode
    const solo = data.escenario && data.escenario.modo === 'solo';
    M.mode = solo ? 'solo' : 'rival';
    $('selMode').value = M.mode;
    $('selB').disabled = solo;
    newMatch();
    M.paused = true;   // no arranca hasta que el estudiante pulse Probar

    $('missionModal').classList.remove('open');
    logLine('Misión ' + data.id + ': ' + data.titulo + ' — ' + data.objetivo, 'ok');
  } catch (e) {
    logLine('Error cargando misión: ' + (e.message || e), 'error');
  }
}

function renderPyblockGuide() {
  return;
  const box = $('mpPyblockGuide');
  if (!box || !mLearn.mission) return;
  const guide = getPyblockGuide(mLearn.mission);
  const isBlocks = M.lang === 'blocks';
  box.classList.toggle('active', isBlocks);

  const blockChips = guide.blocks.map(b =>
    '<span class="mp-pb-chip"><b>' + b.name + '</b><em>' + b.category + '</em></span>'
  ).join('');
  const steps = guide.steps.map((s, i) => {
    const mini = (s.blocks || []).map(t => {
      const info = guide.blocks.find(b => b.type === t) || { name: t };
      return '<span>' + info.name + '</span>';
    }).join('');
    return '<li><strong>' + (i + 1) + '. ' + s.title + '</strong><p>' + s.detail + '</p>' +
      (mini ? '<div class="mp-pb-mini">' + mini + '</div>' : '') + '</li>';
  }).join('');

  box.innerHTML =
    '<div class="mp-pb-head">' +
      '<div><span class="mp-section-title">Guía pyblock</span><h4>' + guide.title + '</h4></div>' +
      '<button id="mpUsePyblockBtn" class="icon" type="button">' + (isBlocks ? 'Usar plantilla' : 'Cambiar a pyblock') + '</button>' +
    '</div>' +
    '<p class="mp-pb-intro">' + guide.intro + '</p>' +
    '<div class="mp-pb-blocks">' + blockChips + '</div>' +
    '<ol class="mp-pb-steps">' + steps + '</ol>';

  const btn = $('mpUsePyblockBtn');
  if (btn) btn.onclick = async () => {
    if (M.lang !== 'blocks') await setLang('blocks');
    ensureBlocksEditor($('blocksEditor'));
    const ok = loadPyblockStarter(mLearn.mission);
    renderPyblockGuide();
    logLine(ok
      ? '🧩 Plantilla pyblock cargada. Sigue los pasos de la guía y pulsa Probar.'
      : 'No pude cargar la plantilla pyblock. Revisa si Blockly terminó de cargar.',
      ok ? 'ok' : 'warn');
  };
}

function updateHintBtn() {
  if (!mLearn.mission) return;
  const metrics = mLearn.lastMetrics || { distanceTraveled: 0, totalAngleChange: 0, motorsActivated: false };
  const extra   = mLearn.lastExtra   || { consoleLines: 0, pixelColor: [0,0,0], codigoActual: '' };
  const hint    = getBestHint(mLearn.mission, metrics, extra, mLearn.hintIndex);
  $('mpHintText').textContent = hint ? t('mission.hint.n', { n: mLearn.hintIndex + 1 }) : t('mission.hint.none');
  $('mpHintBtn').disabled = !hint;
}

$('mpHintBtn').onclick = () => {
  if (!mLearn.mission) return;
  const metrics = mLearn.lastMetrics || { distanceTraveled: 0, totalAngleChange: 0, motorsActivated: false };
  const extra   = mLearn.lastExtra   || buildExtra();
  const hint    = getBestHint(mLearn.mission, metrics, extra, mLearn.hintIndex);
  if (!hint) { logLine('No hay más pistas disponibles para esta misión.', 'warn'); return; }
  mLearn.hintIndex++;
  logLine((hint.icon || '💡') + ' ' + hint.text, 'warn');
  updateHintBtn();
};

$('mpRunBtn').onclick = async () => {
  // Capa 3: advertencias de código antes de ejecutar
  if (mLearn.mission) {
    const codigo   = M.lang === 'blocks' ? (generarPython() || '') : (window.SumoEditor ? window.SumoEditor.getValue() : '');
    const warnings = getCodeWarnings(mLearn.mission, codigo);
    if (warnings.length) showCodeToast(warnings[0]);
  }
  M._missionLines = 0;
  mLearn.lastMetrics = null;
  mLearn.lastExtra   = null;
  resetMissionProgress();
  await runUserCode();         // llama newMatch() internamente
  M.paused = false;            // despausa después de cargar el código
  if (mLearn.mission) {
    recordAttempt(mLearn.mission.id);
    const dur = (mLearn.mission.escenario && mLearn.mission.escenario.duracion_test_s) || 5;
    mLearn.timerRemaining = dur;
    mLearn.timerActive = true;
    $('mpTimerWrap').style.display = 'flex';
    $('mpTimerVal').textContent = dur.toFixed(1) + ' s';
  }
};

$('mpSkipBtn').onclick = () => {
  if (!mLearn.mission) return;
  // Detener simulación si está corriendo
  M.paused = true;
  mLearn.timerActive = false;
  $('mpTimerWrap').style.display = 'none';

  // Desbloquear misiones siguientes sin dar estrellas ni XP
  const desbloquea = mLearn.mission.desbloquea || [];
  if (desbloquea.length) {
    completeMission(mLearn.mission.id, 0, 0, desbloquea);
  }

  // Navegar a la siguiente misión automáticamente si existe
  const siguiente = desbloquea[0];
  if (siguiente) {
    selectMission(siguiente);
  } else {
    // Era la última misión — solo mostrar mapa
    window._learnUI && window._learnUI.openModal();
  }
  refreshXp();
};

// ── Transición Lab ↔ Mapa (pantalla de carga breve, estilo Duolingo) ──
const _layoutEl = document.getElementById('dockRoot');

async function withTransition(fn, label) {
  const loader = $('viewLoader');
  const text = loader && loader.querySelector('.vl-text');
  const prevText = text ? text.textContent : '';
  if (text && label) text.textContent = label;
  loader.classList.add('show');
  await new Promise(r => setTimeout(r, 260));
  await fn();
  await new Promise(r => setTimeout(r, 200));
  loader.classList.remove('show');
  if (text && label) text.textContent = prevText;
}

/** Del lab (o de cualquier estado) hacia el mapa de misiones, a pantalla completa. */
async function goToMap() {
  await withTransition(async () => {
    _layoutEl.style.display = 'none';
    await openModal();
  });
}

/** Del mapa hacia el lab, cargando una misión específica. */
async function goToMission(id) {
  await withTransition(async () => {
    $('missionModal').classList.remove('open');
    _layoutEl.style.display = '';
    await selectMission(id);
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  });
}

$('btnLearn').onclick = async () => {
  M._learnMode = !M._learnMode;
  $('btnLearn').classList.toggle('active', M._learnMode);
  $('xpBadge').classList.toggle('visible', M._learnMode);
  $('gemBadge').classList.toggle('visible', M._learnMode);

  // Toggle control panel vs mission panel
  const ctrlDivs = document.querySelectorAll('#mainPanel > :not(#missionPanel)');
  ctrlDivs.forEach(el => { el.style.display = M._learnMode ? 'none' : ''; });
  $('missionPanel').classList.toggle('active', M._learnMode);

  if (M._learnMode) {
    setOverlaysActive(true);
    refreshXp();
    await goToMap(); // Aprender siempre entra por el mapa, no directo a una misión
  } else {
    await withTransition(async () => {
      setOverlaysActive(false);
      setPyblockMission(null);
      mLearn.timerActive = false;
      $('mpTimerWrap').style.display = 'none';
      $('resultOverlay').classList.remove('open');
      $('missionModal').classList.remove('open');
      _layoutEl.style.display = '';
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }, 'Volviendo a SumoLab...');
  }
};

// ── Página de inicio (landing): 3 secciones ──
const _landing    = $('landing');
const _sectionChip = $('sectionChip');
function _setSectionChip(mode) {
  if (mode === 'aprende') {
    _sectionChip.dataset.i18n = 'header.section.learn';
    _sectionChip.textContent = t('header.section.learn');
    _sectionChip.classList.add('learn');
  } else {
    _sectionChip.dataset.i18n = 'header.section.sumolab';
    _sectionChip.textContent = t('header.section.sumolab');
    _sectionChip.classList.remove('learn');
  }
}
async function enterApp(mode) {
  // Alinea el modo Aprender con la sección elegida (reusa el toggle existente).
  if (mode === 'aprende' && !M._learnMode)      await $('btnLearn').onclick();
  else if (mode !== 'aprende' && M._learnMode)  await $('btnLearn').onclick();
  _setSectionChip(mode);
  _landing.classList.add('hidden');
  // El arena estaba tapado por la landing: recalcula el tamaño del canvas.
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}
function goHome() { _landing.classList.remove('hidden'); }

$('landSumolab').onclick = () => enterApp('sumolab');
$('landAprende').onclick = () => enterApp('aprende');
$('btnHome').onclick     = goHome;
$('appLogo').onclick     = goHome;

// Accesibilidad: Enter/Espacio activan las tarjetas de la landing.
[['landSumolab', 'sumolab'], ['landAprende', 'aprende']].forEach(([id, mode]) => {
  $(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterApp(mode); }
  });
});

// Batalla: aún en desarrollo → aviso amistoso, no entra.
const _landBatalla = $('landBatalla');
_landBatalla.onclick = () => {
  const cta = _landBatalla.querySelector('.lc-cta');
  if (cta.dataset.busy) return;
  cta.dataset.busy = '1';
  const orig = cta.textContent;
  cta.textContent = t('landing.battle.soon');
  _landBatalla.animate?.(
    [{ transform:'translateX(0)' }, { transform:'translateX(-5px)' },
     { transform:'translateX(5px)' }, { transform:'translateX(0)' }],
    { duration:260 }
  );
  setTimeout(() => { cta.textContent = orig; delete cta.dataset.busy; }, 1400);
};

// ── Editor de pintura (🎨 Personalizar) ──
const DESIGN_AUTOSAVE_KEY = 'sumobot_design_current_v1'; // debe coincidir con designManager.js

// Al arrancar: si hay un diseño guardado, vestir las 5 piezas del robot A del combate.
(function applySavedDesign() {
  let raw = null;
  try { raw = localStorage.getItem(DESIGN_AUTOSAVE_KEY); } catch (_) {}
  if (!raw) return;
  let parts = null;
  try { parts = JSON.parse(raw); } catch (_) { return; }
  const canvasMap = {};
  const entries = Object.entries(parts).filter(([, dataURL]) => !!dataURL);
  let pending = entries.length;
  if (!pending) return;
  entries.forEach(([partId, dataURL]) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 1024;
      c.getContext('2d').drawImage(img, 0, 0, 1024, 1024);
      canvasMap[partId] = c;
      if (--pending === 0) scene.applyDesign(canvasMap);
    };
    img.onerror = () => { if (--pending === 0 && Object.keys(canvasMap).length) scene.applyDesign(canvasMap); };
    img.src = dataURL;
  });
})();

$('btnPaint').onclick = () => {
  ensurePainter({
    onApply: (canvasMap) => { scene.applyDesign(canvasMap); scene.refreshDesign(); },
  });
  openPainter();
};

// Desplazamiento horizontal en zigzag (estilo camino serpenteante), en px.
const WM_ZIGZAG = [0, 56, 90, 56, 0, -56, -90, -56];

function shadeColor(hex, percent) {
  const n = parseInt(hex.replace('#', ''), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const d = Math.round(255 * percent / 100);
  const r = clamp(((n >> 16) & 255) + d), g = clamp(((n >> 8) & 255) + d), b = clamp((n & 255) + d);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Dibuja las líneas del camino conectando el centro de cada burbuja (SVG, curvas suaves). */
function drawWorldPath(pathEl, nodes, worldColor) {
  const svg = pathEl.querySelector('.wm-path-svg');
  if (!svg) return;
  const rect = pathEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  let html = '';
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i].el.getBoundingClientRect();
    const b = nodes[i + 1].el.getBoundingClientRect();
    const x1 = a.left + a.width / 2 - rect.left, y1 = a.top + a.height / 2 - rect.top;
    const x2 = b.left + b.width / 2 - rect.left, y2 = b.top + b.height / 2 - rect.top;
    const midY = (y1 + y2) / 2;
    const color = nodes[i].done ? worldColor : 'var(--border2)';
    html += `<path d="M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}" ` +
      `stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="1 14"/>`;
  }
  svg.innerHTML = html;
}

async function openModal() {
  $('missionModal').classList.add('open');
  const mmBody = $('mmBody');
  mmBody.innerHTML = '<div style="padding:20px;color:var(--muted)">' + t('map.loading') + '</div>';
  try {
    const worlds = await loadWorlds();
    const progress = getProgress();
    mmBody.innerHTML = '';
    for (const world of worlds) {
      const sec = document.createElement('div');
      sec.className = 'wm-world';
      sec.style.setProperty('--wc', world.color || '#a855f7');
      sec.style.setProperty('--wcd', shadeColor(world.color || '#a855f7', -35));

      // Banner de sección (estilo Duolingo, color propio del mundo)
      const hdr = document.createElement('div');
      hdr.className = 'wm-world-banner';
      hdr.style.background = world.color || '#a855f7';
      hdr.innerHTML =
        '<div class="wm-world-icon">' + (world.icono || '⚡') + '</div>' +
        '<div class="wm-world-info">' +
          '<div class="wm-world-label">' + t('map.world', { n: world.id }) + '</div>' +
          '<div class="wm-world-name">' + world.titulo + '</div>' +
          '<div class="wm-world-sub">' + (world.tagline || '') + '</div>' +
        '</div>';
      sec.appendChild(hdr);

      // Camino de misiones (serpenteante, vertical)
      const path = document.createElement('div');
      path.className = 'wm-path';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'wm-path-svg');
      path.appendChild(svg);

      const nodes = [];
      const namePromises = [];
      for (let i = 0; i < world.misiones.length; i++) {
        const mId    = world.misiones[i];
        const unlocked = progress.desbloqueadas.includes(mId);
        const mp       = (progress.misiones && progress.misiones[mId]) || { estrellas: 0 };
        const active   = mLearn.mission && mLearn.mission.id === mId;
        const done     = mp.estrellas > 0;

        // Node wrap, desplazado horizontalmente según el patrón zigzag
        const wrap = document.createElement('div');
        wrap.className = 'wm-node-wrap';
        wrap.style.transform = 'translateX(' + WM_ZIGZAG[i % WM_ZIGZAG.length] + 'px)';

        // Stars above bubble
        const starsDiv = document.createElement('div');
        starsDiv.className = 'wm-node-stars';
        for (let s = 1; s <= 3; s++)
          starsDiv.innerHTML += '<span class="' + (mp.estrellas >= s ? 'e' : '') + '">★</span>';
        wrap.appendChild(starsDiv);

        // Bubble
        const bubble = document.createElement('div');
        bubble.className = 'wm-bubble' +
          (active   ? ' active' :
           done     ? ' done'   :
           !unlocked ? ' locked' : ' ready');
        bubble.textContent = unlocked ? (done ? '✓' : mId.split('.')[1]) : '🔒';
        bubble.title = unlocked ? t('map.mission', { id: mId }) : t('map.locked');
        if (unlocked) bubble.onclick = () => goToMission(mId);
        wrap.appendChild(bubble);

        // Name below bubble (async)
        const nameDiv = document.createElement('div');
        nameDiv.className = 'wm-node-name';
        nameDiv.textContent = mId;
        wrap.appendChild(nameDiv);

        namePromises.push(loadMission(mId).then(d => {
          nameDiv.textContent = d.titulo;
          if (done && !active) bubble.title = t('map.missionStars', { title: d.titulo, stars: mp.estrellas });
        }).catch(() => {}));

        path.appendChild(wrap);
        nodes.push({ el: bubble, done });
      }
      sec.appendChild(path);
      mmBody.appendChild(sec);

      drawWorldPath(path, nodes, world.color || '#a855f7');
      // Los nombres cargan async y pueden alterar la altura de los nodos: redibuja al terminar.
      Promise.all(namePromises).then(() => drawWorldPath(path, nodes, world.color || '#a855f7'));
    }
  } catch (e) {
    mmBody.innerHTML = '<div style="padding:20px;color:var(--err)">' + t('map.error', { msg: e.message || e }) + '</div>';
  }
}

// ── Toast de logro ───────────────────────────────────

const _toastQueue = [];
let   _toastRunning = false;

function queueAchievementToasts(logros) {
  logros.forEach(l => _toastQueue.push(l));
  if (!_toastRunning) nextToast();
}

function nextToast() {
  if (!_toastQueue.length) { _toastRunning = false; return; }
  _toastRunning = true;
  const logro = _toastQueue.shift();
  const el = $('achievementToast');
  $('achToastIcon').textContent  = logro.icono || '🏆';
  $('achToastTitle').textContent = logro.titulo;
  $('achToastDesc').textContent  = logro.descripcion;
  const xpEl = $('achToastXp');
  if (logro.xp_bonus > 0) { xpEl.textContent = '+' + logro.xp_bonus + ' XP'; xpEl.style.display = 'block'; }
  else xpEl.style.display = 'none';
  const gemasEl = $('achToastGemas');
  const gemasBonus = Math.round((logro.xp_bonus || 0) / 10);
  if (gemasBonus > 0) { gemasEl.textContent = '+' + gemasBonus + ' 💎'; gemasEl.style.display = 'block'; }
  else gemasEl.style.display = 'none';
  el.classList.add('show');
  SFX.unlock();
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(nextToast, 400);
  }, 3200);
}

// ── Level-up overlay ─────────────────────────────────

function showLevelUp(nivel) {
  $('luNum').textContent = nivel;
  $('luMsg').textContent = (nivel >= 1 && nivel <= 5) ? t('levelup.msg.' + nivel) : t('levelup.msg.more');
  const el = $('levelUpOverlay');
  el.classList.add('show');
  SFX.unlock();
  setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Galería de logros en modal ────────────────────────

async function renderAchievementsTab() {
  const body = $('mmBodyLogros');
  body.innerHTML = '<div style="padding:20px;color:var(--muted)">' + t('map.loading') + '</div>';
  try {
    const [todos, progress] = await Promise.all([loadAchievements(), Promise.resolve(getProgress())]);
    const earned = progress.logros || [];
    body.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'ach-gallery';
    for (const logro of todos) {
      const got  = earned.includes(logro.id);
      const card = document.createElement('div');
      card.className = 'ach-card ' + (got ? 'earned' : 'locked');
      card.innerHTML =
        '<div class="ach-card-icon">' + logro.icono + '</div>' +
        '<div class="ach-card-info">' +
          '<div class="ach-card-title">' + logro.titulo + '</div>' +
          '<div class="ach-card-desc">'  + logro.descripcion + '</div>' +
          (got && logro.xp_bonus > 0 ? '<div class="ach-card-xp">+' + logro.xp_bonus + ' XP</div>' : '') +
        '</div>';
      grid.appendChild(card);
    }
    body.appendChild(grid);
  } catch (e) {
    body.innerHTML = '<div style="padding:20px;color:var(--err)">' + t('map.error', { msg: e.message || e }) + '</div>';
  }
}

// ── Tabs del modal ────────────────────────────────────

let _currentTab = 'misiones';
window.switchModalTab = function(tab) {
  if (tab === _currentTab) return;
  SFX.tabSwitch();
  const dir = tab === 'logros' ? 1 : -1;
  const from = tab === 'logros' ? $('mmBody')       : $('mmBodyLogros');
  const to   = tab === 'logros' ? $('mmBodyLogros') : $('mmBody');
  $('mmTabMisiones').classList.toggle('active', tab === 'misiones');
  $('mmTabLogros').classList.toggle('active',   tab === 'logros');
  animateTabTransition(from, to, dir);
  _currentTab = tab;
  if (tab === 'logros') renderAchievementsTab();
};

// ── Botón de solución ────────────────────────────────

$('mpSolBtn').onclick = () => {
  SFX.clickSoft();
  if (!mLearn.mission) return;
  if (!mLearn.mission.solucion) {
    logLine('Esta misión no tiene solución disponible aún.', 'warn');
    return;
  }
  $('solConfirm').classList.add('open');
};

$('solConfirmYes').onclick = () => {
  SFX.solution();
  $('solConfirm').classList.remove('open');
  if (mLearn.mission && mLearn.mission.solucion && window.SumoEditor)
    window.SumoEditor.setValue(mLearn.mission.solucion);
};

// ── Init UX: ripples + sonidos de click + typing ────

initRipples();
observeRipples();
initCursorGlow(document.querySelector('.arena-wrap'));

// Sonidos click en todos los botones
document.addEventListener('pointerdown', (e) => {
  const btn = e.target.closest('button');
  if (btn) SFX.click();
}, true);

// Sonido de escritura en el editor (muy sutil)
let _typeThrottle = 0;
document.addEventListener('keydown', (e) => {
  if (document.activeElement && document.activeElement.closest('.monaco-editor')) {
    const now = Date.now();
    if (now - _typeThrottle > 40) { // máx ~25 veces/s
      SFX.type();
      _typeThrottle = now;
    }
  }
}, true);

// Cerrar solConfirm con Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('solConfirm').classList.remove('open');
});

// Glow en mpRunBtn mientras está corriendo
const _origRunClick = $('mpRunBtn').onclick;
$('mpRunBtn').addEventListener('click', () => {
  $('mpRunBtn').classList.add('running-glow');
  setTimeout(() => $('mpRunBtn').classList.remove('running-glow'), 4000);
});

// Toast de logro también con sonido unlock
const _origNextToast = window.nextToast;

window._learnUI = {
  openModal,
  closeResult() { $('resultOverlay').classList.remove('open'); },
  async backToMap() {
    SFX.clickSoft();
    $('resultOverlay').classList.remove('open');
    await goToMap();
  },
  async nextMission() {
    SFX.clickSoft();
    $('resultOverlay').classList.remove('open');
    if (mLearn.mission && (mLearn.mission.desbloquea || []).length > 0) {
      await selectMission(mLearn.mission.desbloquea[0]); // sigue en el lab, sin pantalla de carga
    } else {
      await goToMap();
    }
  },
};
