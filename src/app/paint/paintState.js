// ======================================================
// paintState.js — Estado compartido del editor (herramienta activa, color,
// parámetros del pincel). Módulos de UI y los dos visores leen/escriben
// este mismo estado para quedar sincronizados.
// ======================================================
export const PRESET_COLORS = [
  '#e23b3b', '#f0821e', '#ffd23f', '#34d058', '#22b8cf', '#3c82f0',
  '#7c3aed', '#e64980', '#ffffff', '#9aa0b5', '#20242e', '#000000',
];

const RECENTS_KEY = 'sumobot_design_recent_colors_v1';
const SAVED_KEY = 'sumobot_design_saved_colors_v1';
const RECENTS_MAX = 12;

export const state = {
  tool: 'brush',
  color: PRESET_COLORS[0],
  size: 42,
  hardness: 0.85,
  opacity: 1,
  spacing: 0.22,   // fracción del tamaño entre estampas
  mode: '3d',      // '3d' | '2d'
};

const listeners = new Set();
export function onStateChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function notify() { listeners.forEach(cb => cb(state)); }

export function setTool(id) { state.tool = id; notify(); }
export function setColor(hex) {
  state.color = hex;
  pushRecentColor(hex);
  notify();
}
export function setSize(v) { state.size = v; notify(); }
export function setHardness(v) { state.hardness = v; notify(); }
export function setOpacity(v) { state.opacity = v; notify(); }
export function setSpacing(v) { state.spacing = v; notify(); }
export function setMode(m) { state.mode = m; notify(); }

function loadJson(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch (_) { return fallback; }
}
function saveJson(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
}

let recentColors = loadJson(RECENTS_KEY, []);
let savedColors = loadJson(SAVED_KEY, []);

export function getRecentColors() { return recentColors; }
export function getSavedColors() { return savedColors; }

export function pushRecentColor(hex) {
  recentColors = [hex, ...recentColors.filter(c => c.toLowerCase() !== hex.toLowerCase())].slice(0, RECENTS_MAX);
  saveJson(RECENTS_KEY, recentColors);
}

export function saveColor(hex) {
  if (savedColors.some(c => c.toLowerCase() === hex.toLowerCase())) return;
  savedColors = [...savedColors, hex];
  saveJson(SAVED_KEY, savedColors);
  notify();
}

export function removeSavedColor(hex) {
  savedColors = savedColors.filter(c => c.toLowerCase() !== hex.toLowerCase());
  saveJson(SAVED_KEY, savedColors);
  notify();
}
