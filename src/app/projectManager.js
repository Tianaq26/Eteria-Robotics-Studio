// ======================================================
// projectManager.js — Persistencia 100% cliente de proyectos (.sumo).
//
// Sin backend ni base de datos: usa la File System Access API cuando el
// navegador la soporta (Chrome/Edge — permite "Guardar"/"Guardar como" reales
// sobre un archivo del disco), y cae a IndexedDB (almacenamiento local del
// navegador, hace de "disco" cuando no hay FSA — Firefox/Safari) para
// Guardar/Abrir. Importar/Exportar siempre funcionan igual en cualquier
// navegador vía descarga (<a download>) y subida (<input type=file>).
//
// Este módulo no sabe nada de Monaco/Blockly/M: recibe un objeto de estado
// plano (getState) y lo aplica de vuelta con applyState. Así queda
// desacoplado del resto de la app.
// ======================================================

const EXT = '.sumo';
const FORMAT = 'sumobot-arena-project';
const FORMAT_VERSION = 1;

const DB_NAME = 'sumobot-arena-ide';
const DB_VERSION = 1;
const STORE = 'projects';

export const supportsFS =
  typeof window !== 'undefined' &&
  'showOpenFilePicker' in window &&
  'showSaveFilePicker' in window;

// Estado del "archivo actual" (equivalente a la pestaña activa de un IDE).
const current = {
  handle: null,  // FileSystemFileHandle (solo si supportsFS)
  idbId: null,   // id en IndexedDB (solo si !supportsFS)
  name: 'Proyecto sin título',
};

export function getCurrentProjectName() {
  return current.name;
}

function stripExt(name) {
  return name.replace(/\.sumo$/i, '');
}

function uid() {
  return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function buildProjectFile(state, name) {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    name: stripExt(name),
    updatedAt: new Date().toISOString(),
    state,
  };
}

// ── IndexedDB: hace de "disco local" cuando no hay File System Access API ──

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

// ── Descarga / subida de archivos .sumo (Importar / Exportar, siempre disponibles) ──

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
    // Si el usuario cierra el diálogo sin elegir nada no hay evento 'change';
    // no hace falta 'cancel' porque simplemente no se resuelve y el flujo termina ahí.
    input.click();
  });
}

function readFileAsJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(JSON.parse(reader.result)); }
      catch (e) { reject(new Error('El archivo no es un proyecto .sumo válido.')); }
    };
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

// ── API pública ──────────────────────────────────────────────────────────

/** Nuevo proyecto en blanco: limpia el archivo/registro actual y llama a resetState(). */
export async function newProject({ resetState }) {
  current.handle = null;
  current.idbId = null;
  current.name = 'Proyecto sin título';
  await resetState();
  return { ok: true };
}

/**
 * Guardar: escribe sobre el archivo/registro actual. Si todavía no hay uno
 * (proyecto nuevo), se comporta como "Guardar como".
 */
export async function saveProject({ getState }) {
  const state = await getState();

  if (supportsFS) {
    if (!current.handle) return saveProjectAs({ getState: async () => state });
    if (!(await verifyRWPermission(current.handle))) return { ok: false, error: 'Permiso de escritura denegado.' };
    const file = buildProjectFile(state, current.name);
    const writable = await current.handle.createWritable();
    await writable.write(JSON.stringify(file, null, 2));
    await writable.close();
    return { ok: true, name: current.name, mode: 'fs' };
  }

  // Sin FSA: IndexedDB hace de disco local.
  if (!current.idbId) return saveProjectAs({ getState: async () => state });
  const file = buildProjectFile(state, current.name);
  await idbPut({ id: current.idbId, name: current.name, updatedAt: file.updatedAt, file });
  return { ok: true, name: current.name, mode: 'idb' };
}

/** Guardar como: siempre pide un destino nuevo (archivo en disco o nombre local). */
export async function saveProjectAs({ getState }) {
  const state = await getState();

  if (supportsFS) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: current.name.endsWith(EXT) ? current.name : current.name + EXT,
        types: [{ description: 'Proyecto Eteria Robotics Studio', accept: { 'application/json': [EXT] } }],
      });
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, cancelled: true };
      throw e;
    }
    current.handle = handle;
    current.idbId = null;
    current.name = stripExt(handle.name);
    const file = buildProjectFile(state, current.name);
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(file, null, 2));
    await writable.close();
    return { ok: true, name: current.name, mode: 'fs' };
  }

  const name = window.prompt('Nombre del proyecto:', current.name || 'Mi sumobot');
  if (!name) return { ok: false, cancelled: true };
  current.handle = null;
  current.idbId = uid();
  current.name = name;
  const file = buildProjectFile(state, current.name);
  await idbPut({ id: current.idbId, name: current.name, updatedAt: file.updatedAt, file });
  return { ok: true, name: current.name, mode: 'idb' };
}

/**
 * Abrir: File System Access API → selector nativo del SO.
 * Fallback: diálogo con la lista de proyectos guardados en este navegador
 * (IndexedDB) + opción de subir un archivo .sumo del equipo.
 */
export async function openProject({ applyState }) {
  if (supportsFS) {
    let handle;
    try {
      [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Proyecto Eteria Robotics Studio', accept: { 'application/json': [EXT] } }],
      });
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, cancelled: true };
      throw e;
    }
    const file = await handle.file();
    const data = await readFileAsJson(file);
    current.handle = handle;
    current.idbId = null;
    current.name = data.name || stripExt(handle.name);
    await applyState(data.state || {});
    return { ok: true, name: current.name };
  }

  return openProjectDialog({ applyState });
}

/** Importar: siempre por subida de archivo, sin importar si hay FSA (útil para traer un .sumo que te compartieron). */
export async function importProject({ applyState }) {
  const file = await pickUploadFile();
  if (!file) return { ok: false, cancelled: true };
  const data = await readFileAsJson(file);
  current.handle = null;
  current.idbId = null;
  current.name = data.name || stripExt(file.name);
  await applyState(data.state || {});
  return { ok: true, name: current.name };
}

/** Exportar: siempre descarga un .sumo, sin tocar el archivo/registro "actual". */
export async function exportProject({ getState }) {
  const state = await getState();
  const name = current.name || 'Mi sumobot';
  downloadJson(name, buildProjectFile(state, name));
  return { ok: true, name };
}

export async function listLocalProjects() {
  const rows = await idbGetAll();
  return rows
    .map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt }))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function deleteLocalProject(id) {
  await idbDelete(id);
}

// ── Diálogo "Abrir" para navegadores sin File System Access API ──────────

let dialogEl = null;

function ensureDialog() {
  if (dialogEl) return dialogEl;
  dialogEl = document.createElement('div');
  dialogEl.className = 'proj-modal';
  dialogEl.innerHTML =
    '<div class="proj-box">' +
      '<div class="proj-title">📂 Abrir proyecto</div>' +
      '<div class="proj-hint">Guardado en este navegador (no requiere conexión ni cuenta).</div>' +
      '<div class="proj-list"></div>' +
      '<div class="proj-actions">' +
        '<button class="icon" data-act="upload">📥 Subir archivo .sumo…</button>' +
        '<button class="icon" data-act="cancel">Cancelar</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(dialogEl);
  dialogEl.addEventListener('click', (e) => { if (e.target === dialogEl) closeDialog(); });
  return dialogEl;
}

function closeDialog() {
  if (dialogEl) dialogEl.classList.remove('open');
}

async function openProjectDialog({ applyState }) {
  const el = ensureDialog();
  const listEl = el.querySelector('.proj-list');
  const projects = await listLocalProjects();

  listEl.innerHTML = projects.length
    ? ''
    : '<div class="proj-empty">Todavía no hay proyectos guardados aquí.</div>';

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      closeDialog();
      resolve(result);
    };

    for (const p of projects) {
      const row = document.createElement('div');
      row.className = 'proj-item';
      const when = p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '';
      row.innerHTML =
        '<div class="proj-item-main">' +
          '<div class="proj-item-name">' + p.name + '</div>' +
          '<div class="proj-item-date">' + when + '</div>' +
        '</div>' +
        '<button class="proj-item-del" title="Eliminar">✕</button>';
      row.querySelector('.proj-item-main').onclick = async () => {
        const rows = await idbGetAll();
        const rec = rows.find((r) => r.id === p.id);
        if (!rec) return;
        current.handle = null;
        current.idbId = rec.id;
        current.name = rec.name;
        await applyState((rec.file && rec.file.state) || {});
        finish({ ok: true, name: current.name });
      };
      row.querySelector('.proj-item-del').onclick = async (ev) => {
        ev.stopPropagation();
        if (!window.confirm('¿Eliminar "' + p.name + '"? Esta acción no se puede deshacer.')) return;
        await deleteLocalProject(p.id);
        row.remove();
        if (!listEl.querySelector('.proj-item')) listEl.innerHTML = '<div class="proj-empty">Todavía no hay proyectos guardados aquí.</div>';
      };
      listEl.appendChild(row);
    }

    el.querySelector('[data-act="upload"]').onclick = async () => {
      const file = await pickUploadFile();
      if (!file) return;
      try {
        const data = await readFileAsJson(file);
        current.handle = null;
        current.idbId = null;
        current.name = data.name || stripExt(file.name);
        await applyState(data.state || {});
        finish({ ok: true, name: current.name });
      } catch (e) {
        window.alert(e.message || 'No se pudo leer el archivo.');
      }
    };
    el.querySelector('[data-act="cancel"]').onclick = () => finish({ ok: false, cancelled: true });

    el.classList.add('open');
  });
}
