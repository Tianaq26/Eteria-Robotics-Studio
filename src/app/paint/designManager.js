// ======================================================
// designManager.js — Guardar/Abrir/Importar/Exportar diseños del sumobot.
// Mismo patrón que projectManager.js: File System Access API cuando el
// navegador la soporta, IndexedDB como "disco local" si no, y descarga/
// subida de archivo para Importar/Exportar (siempre disponibles). DB propia
// (no comparte la de projectManager.js) para no chocar con su versión.
// ======================================================
import { PART_IDS } from './parts.js';
import { exportAllDataURLs, loadPartDataURL, clearAll } from './canvasStore.js';

const EXT = '.sumoskin';
const FORMAT = 'sumobot-arena-design';
const FORMAT_VERSION = 1;
const AUTOSAVE_KEY = 'sumobot_design_current_v1';

const DB_NAME = 'sumobot-arena-designs';
const DB_VERSION = 1;
const STORE = 'designs';

export const supportsFS =
  typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;

const current = { handle: null, idbId: null, name: 'Mi sumobot' };

export function getCurrentDesignName() { return current.name; }

function stripExt(name) { return name.replace(/\.sumoskin$/i, ''); }
function uid() { return 'd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function buildDesignFile(parts, name) {
  return { format: FORMAT, version: FORMAT_VERSION, name: stripExt(name), updatedAt: new Date().toISOString(), parts };
}

async function applyParts(parts) {
  await Promise.all(PART_IDS.map((id) => parts && parts[id] ? loadPartDataURL(id, parts[id]) : Promise.resolve()));
}

// ── IndexedDB ──────────────────────────────────────────────────────────────
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGetAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function idbDelete(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Descarga / subida de archivos (Importar / Exportar) ────────────────────
function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(EXT) ? filename : filename + EXT;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
function pickUploadFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = EXT + ',application/json';
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}
function readFileAsJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { try { resolve(JSON.parse(reader.result)); } catch (e) { reject(new Error('El archivo no es un diseño válido.')); } };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
async function verifyRWPermission(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

// ── Autoguardado local (diseño activo, se restaura solo al abrir el editor) ──
export function autosave() {
  try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(exportAllDataURLs())); } catch (_) {}
}
export async function restoreAutosave() {
  let raw = null;
  try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch (_) {}
  if (!raw) return false;
  try { await applyParts(JSON.parse(raw)); return true; } catch (_) { return false; }
}

// ── API pública ──────────────────────────────────────────────────────────
export async function newDesign() {
  current.handle = null; current.idbId = null; current.name = 'Mi sumobot';
  clearAll();
}

export async function saveDesign() {
  const parts = exportAllDataURLs();
  if (supportsFS) {
    if (!current.handle) return saveDesignAs();
    if (!(await verifyRWPermission(current.handle))) return { ok: false, error: 'Permiso de escritura denegado.' };
    const file = buildDesignFile(parts, current.name);
    const writable = await current.handle.createWritable();
    await writable.write(JSON.stringify(file, null, 2));
    await writable.close();
    return { ok: true, name: current.name, mode: 'fs' };
  }
  if (!current.idbId) return saveDesignAs();
  const file = buildDesignFile(parts, current.name);
  await idbPut({ id: current.idbId, name: current.name, updatedAt: file.updatedAt, file });
  return { ok: true, name: current.name, mode: 'idb' };
}

export async function saveDesignAs() {
  const parts = exportAllDataURLs();
  if (supportsFS) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: current.name.endsWith(EXT) ? current.name : current.name + EXT,
        types: [{ description: 'Diseño Eteria Robotics Studio', accept: { 'application/json': [EXT] } }],
      });
    } catch (e) { if (e && e.name === 'AbortError') return { ok: false, cancelled: true }; throw e; }
    current.handle = handle; current.idbId = null; current.name = stripExt(handle.name);
    const file = buildDesignFile(parts, current.name);
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(file, null, 2));
    await writable.close();
    return { ok: true, name: current.name, mode: 'fs' };
  }
  const name = window.prompt('Nombre del diseño:', current.name || 'Mi sumobot');
  if (!name) return { ok: false, cancelled: true };
  current.handle = null; current.idbId = uid(); current.name = name;
  const file = buildDesignFile(parts, current.name);
  await idbPut({ id: current.idbId, name: current.name, updatedAt: file.updatedAt, file });
  return { ok: true, name: current.name, mode: 'idb' };
}

export async function openDesign() {
  if (supportsFS) {
    let handle;
    try {
      [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Diseño Eteria Robotics Studio', accept: { 'application/json': [EXT] } }],
      });
    } catch (e) { if (e && e.name === 'AbortError') return { ok: false, cancelled: true }; throw e; }
    const file = await handle.file();
    const data = await readFileAsJson(file);
    current.handle = handle; current.idbId = null; current.name = data.name || stripExt(handle.name);
    await applyParts(data.parts || {});
    return { ok: true, name: current.name };
  }
  return openDesignDialog();
}

export async function importDesign() {
  const file = await pickUploadFile();
  if (!file) return { ok: false, cancelled: true };
  const data = await readFileAsJson(file);
  current.handle = null; current.idbId = null; current.name = data.name || stripExt(file.name);
  await applyParts(data.parts || {});
  return { ok: true, name: current.name };
}

export async function exportDesign() {
  const parts = exportAllDataURLs();
  const name = current.name || 'Mi sumobot';
  downloadJson(name, buildDesignFile(parts, name));
  return { ok: true, name };
}

export async function listLocalDesigns() {
  const rows = await idbGetAll();
  return rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt })).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}
export async function deleteLocalDesign(id) { await idbDelete(id); }

// ── Diálogo "Abrir" sin File System Access API ────────────────────────────
let dialogEl = null;
function ensureDialog() {
  if (dialogEl) return dialogEl;
  dialogEl = document.createElement('div');
  dialogEl.className = 'proj-modal';
  dialogEl.innerHTML =
    '<div class="proj-box">' +
      '<div class="proj-title">🎨 Abrir diseño</div>' +
      '<div class="proj-hint">Guardado en este navegador (no requiere conexión ni cuenta).</div>' +
      '<div class="proj-list"></div>' +
      '<div class="proj-actions">' +
        '<button class="icon" data-act="upload">📥 Subir archivo ' + EXT + '…</button>' +
        '<button class="icon" data-act="cancel">Cancelar</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(dialogEl);
  dialogEl.addEventListener('click', (e) => { if (e.target === dialogEl) dialogEl.classList.remove('open'); });
  return dialogEl;
}

async function openDesignDialog() {
  const el = ensureDialog();
  const listEl = el.querySelector('.proj-list');
  const designs = await listLocalDesigns();
  listEl.innerHTML = designs.length ? '' : '<div class="proj-empty">Todavía no hay diseños guardados aquí.</div>';

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => { if (settled) return; settled = true; el.classList.remove('open'); resolve(result); };

    for (const d of designs) {
      const row = document.createElement('div');
      row.className = 'proj-item';
      const when = d.updatedAt ? new Date(d.updatedAt).toLocaleString() : '';
      row.innerHTML =
        '<div class="proj-item-main"><div class="proj-item-name">' + d.name + '</div><div class="proj-item-date">' + when + '</div></div>' +
        '<button class="proj-item-del" title="Eliminar">✕</button>';
      row.querySelector('.proj-item-main').onclick = async () => {
        const rows = await idbGetAll();
        const rec = rows.find((r) => r.id === d.id);
        if (!rec) return;
        current.handle = null; current.idbId = rec.id; current.name = rec.name;
        await applyParts((rec.file && rec.file.parts) || {});
        finish({ ok: true, name: current.name });
      };
      row.querySelector('.proj-item-del').onclick = async (ev) => {
        ev.stopPropagation();
        if (!window.confirm('¿Eliminar "' + d.name + '"? Esta acción no se puede deshacer.')) return;
        await deleteLocalDesign(d.id);
        row.remove();
        if (!listEl.querySelector('.proj-item')) listEl.innerHTML = '<div class="proj-empty">Todavía no hay diseños guardados aquí.</div>';
      };
      listEl.appendChild(row);
    }

    el.querySelector('[data-act="upload"]').onclick = async () => {
      const file = await pickUploadFile();
      if (!file) return;
      try {
        const data = await readFileAsJson(file);
        current.handle = null; current.idbId = null; current.name = data.name || stripExt(file.name);
        await applyParts(data.parts || {});
        finish({ ok: true, name: current.name });
      } catch (e) { window.alert(e.message || 'No se pudo leer el archivo.'); }
    };
    el.querySelector('[data-act="cancel"]').onclick = () => finish({ ok: false, cancelled: true });

    el.classList.add('open');
  });
}
