// ======================================================
// ProgressTracker.js — Persiste el progreso del estudiante en localStorage.
// ======================================================

const KEY = 'sumobot_progress_v1';

function defaultProgress() {
  return {
    xp: 0,
    nivel: 1,
    gemas: 0,                // moneda del juego (uso futuro: personalización de sumobots)
    misiones: {},           // { "0.1": { completada, estrellas, intentos, xp_ganado } }
    desbloqueadas: ['0.1'], // la primera siempre abierta
    logros: [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProgress();
    return { ...defaultProgress(), ...JSON.parse(raw) };
  } catch (_) {
    return defaultProgress();
  }
}

function save(progress) {
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch (_) {}
}

// ── API pública ───────────────────────────────────────

export function getProgress() { return load(); }

export function isMissionUnlocked(missionId) {
  const p = load();
  return p.desbloqueadas.includes(missionId);
}

export function getMissionProgress(missionId) {
  const p = load();
  return p.misiones[missionId] || { completada: false, estrellas: 0, intentos: 0, xp_ganado: 0 };
}

export function recordAttempt(missionId) {
  const p = load();
  if (!p.misiones[missionId]) p.misiones[missionId] = { completada: false, estrellas: 0, intentos: 0, xp_ganado: 0 };
  p.misiones[missionId].intentos++;
  save(p);
}

export function completeMission(missionId, estrellas, xpBase, desbloquea = []) {
  const p = load();
  if (!p.misiones[missionId]) p.misiones[missionId] = { completada: false, estrellas: 0, intentos: 0, xp_ganado: 0 };

  const prev = p.misiones[missionId];
  const esMejor = estrellas > prev.estrellas;
  const xpGanado   = esMejor ? Math.round(xpBase * (estrellas / 3)) : 0;
  const gemasGanadas = esMejor ? estrellas * 5 : 0; // 5 gemas por estrella

  prev.completada = true;
  prev.estrellas  = Math.max(prev.estrellas, estrellas);
  prev.xp_ganado  = Math.max(prev.xp_ganado, xpGanado);

  p.xp += xpGanado;
  p.gemas = (p.gemas || 0) + gemasGanadas;
  p.nivel = calcNivel(p.xp);

  // Desbloquear misiones siguientes
  for (const id of desbloquea) {
    if (!p.desbloqueadas.includes(id)) p.desbloqueadas.push(id);
  }

  save(p);
  return { xpGanado, gemasGanadas, esMejor, nivel: p.nivel };
}

export function awardAchievement(id, xpBonus = 0) {
  const p = load();
  if (p.logros.includes(id)) return false;
  const gemasBonus = Math.round(xpBonus / 10);
  p.logros.push(id);
  p.xp    += xpBonus;
  p.gemas = (p.gemas || 0) + gemasBonus;
  p.nivel  = calcNivel(p.xp);
  save(p);
  return true;
}

export function resetProgress() {
  localStorage.removeItem(KEY);
}

// ── Helpers internos ──────────────────────────────────

const NIVELES = [0, 500, 1500, 3500, 7000, 12000];
function calcNivel(xp) {
  for (let i = NIVELES.length - 1; i >= 0; i--) {
    if (xp >= NIVELES[i]) return i + 1;
  }
  return 1;
}
