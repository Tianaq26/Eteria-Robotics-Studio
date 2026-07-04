// ======================================================
// settings.js — Preferencias del usuario: tema, acento, sonido.
// Persiste en localStorage y aplica los cambios vía atributos en <html>,
// que la hoja de estilos ya lee con selectores html[data-theme]/html[data-accent].
// ======================================================
import { SFX } from './ux.js';

const KEY = 'sumobot_settings_v1';

const DEFAULTS = { theme: 'dark', accent: 'azul', sfxMuted: false }; // azul = --accent actual, sin cambios al primer uso

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

let state = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
}

function apply() {
  document.documentElement.setAttribute('data-theme', state.theme);
  document.documentElement.setAttribute('data-accent', state.accent);
  SFX.setMuted(state.sfxMuted);
}

export function getSettings() { return { ...state }; }

export function setTheme(theme) { state.theme = theme; apply(); save(); }
export function setAccent(accent) { state.accent = accent; apply(); save(); }
export function setSfxMuted(muted) { state.sfxMuted = muted; apply(); save(); }

// Aplicar de inmediato al cargar el módulo, antes de cualquier interacción.
apply();
