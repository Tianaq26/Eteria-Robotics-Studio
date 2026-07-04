// ======================================================
// AchievementEngine.js — Evalúa y desbloquea logros.
// ======================================================
import { getProgress, awardAchievement } from './ProgressTracker.js';

const RAD_TO_DEG = 180 / Math.PI;

let _allAchievements = null;

export async function loadAchievements() {
  if (_allAchievements) return _allAchievements;
  const res  = await fetch('./content/achievements.json');
  const data = await res.json();
  _allAchievements = data.logros;
  return _allAchievements;
}

/**
 * Evalúa los logros desbloqueables tras completar una misión.
 * @param {object} context — { misionId, estrellas, metrics, extra, hintUsed, worldMissions }
 * @returns {Array} logros recién desbloqueados (para mostrar toast)
 */
export async function checkAchievements(context) {
  const logros    = await loadAchievements();
  const progress  = getProgress();
  const earned    = progress.logros || [];
  const newly     = [];

  for (const logro of logros) {
    if (earned.includes(logro.id)) continue;   // ya desbloqueado

    let unlocked = false;

    switch (logro.tipo) {

      case 'misiones_completadas': {
        const done = Object.values(progress.misiones || {})
          .filter(m => m.completada).length;
        unlocked = done >= logro.valor;
        break;
      }

      case 'max_estrellas_mision':
        unlocked = context.estrellas >= logro.valor;
        break;

      case 'mundo_completo': {
        const ids = context.worldMissions || [];
        unlocked = ids.length > 0 && ids.every(id => {
          const m = (progress.misiones || {})[id];
          return m && m.completada;
        });
        break;
      }

      case 'mundo_todas_3_estrellas': {
        const ids = context.worldMissions || [];
        unlocked = ids.length > 0 && ids.every(id => {
          const m = (progress.misiones || {})[id];
          return m && m.estrellas >= 3;
        });
        break;
      }

      case 'mision_sin_pistas':
        unlocked = context.estrellas > 0 && !context.hintUsed;
        break;

      case 'distancia_prueba': {
        const dist = (context.metrics || {}).distanceTraveled || 0;
        unlocked = dist >= logro.valor;
        break;
      }

      case 'angulo_prueba': {
        const deg = ((context.metrics || {}).totalAngleChange || 0) * RAD_TO_DEG;
        unlocked = deg >= logro.valor;
        break;
      }

      case 'pixel_personalizado': {
        const [r, g, b] = (context.extra || {}).pixelColor || [0, 0, 0];
        const enc  = r > 0 || g > 0 || b > 0;
        const nRed = !(r >= 240 && g < 20 && b < 20);
        unlocked = enc && nRed;
        break;
      }

      case 'console_lines_prueba': {
        const lines = (context.extra || {}).consoleLines || 0;
        unlocked = lines >= logro.valor;
        break;
      }

      case 'nivel_alcanzado':
        unlocked = (progress.nivel || 1) >= logro.valor;
        break;
    }

    if (unlocked) {
      awardAchievement(logro.id, logro.xp_bonus || 0);
      newly.push(logro);
    }
  }

  return newly;
}
