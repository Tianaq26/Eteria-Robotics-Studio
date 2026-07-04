// ======================================================
// CurriculumLoader.js — Carga y cachea los JSON de mundos y misiones.
// ======================================================

const BASE = './content';
const _cache = {};

async function fetchJSON(path) {
  if (_cache[path]) return _cache[path];
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (${res.status})`);
  const data = await res.json();
  _cache[path] = data;
  return data;
}

/** Devuelve el índice de todos los mundos. */
export async function loadWorlds() {
  const index = await fetchJSON(`${BASE}/worlds.json`);
  return index.worlds;
}

/** Devuelve los metadatos de un mundo (id numérico). */
export async function loadWorldMeta(worldId) {
  return fetchJSON(`${BASE}/world-${worldId}/meta.json`);
}

/** Devuelve los datos completos de una misión. */
export async function loadMission(missionId) {
  // missionId tiene forma "0.1", "1.3", etc.
  const [worldId] = missionId.split('.');
  return fetchJSON(`${BASE}/world-${worldId}/mission-${missionId}.json`);
}

/** Devuelve todos los mundos con sus metadatos cargados. */
export async function loadAllWorldMeta() {
  const worlds = await loadWorlds();
  return Promise.all(worlds.map(async (w) => {
    const meta = await loadWorldMeta(w.id);
    return { ...w, ...meta };
  }));
}
