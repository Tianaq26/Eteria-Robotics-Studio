// ======================================================
// MissionRunner.js — Evalúa si el estudiante superó los criterios de una misión.
// Recibe las métricas del motor + contexto externo y devuelve: estrellas, feedback.
// ======================================================

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Evalúa un único criterio contra las métricas.
 * @param {object} criterio  - del JSON de misión
 * @param {object} metrics   - del engine (distanceTraveled, totalAngleChange, motorsActivated)
 * @param {object} extra     - { consoleLines, pixelColor, codigoOriginal, codigoActual }
 */
function evaluaCriterio(criterio, metrics, extra) {
  switch (criterio.tipo) {

    case 'distancia_minima':
      return metrics.distanceTraveled >= criterio.valor;

    case 'angulo_minimo':
      // totalAngleChange está en radianes; el JSON lo define en grados
      return (metrics.totalAngleChange * RAD_TO_DEG) >= criterio.valor;

    case 'motores_activados':
    case 'motores_activos':
      return metrics.motorsActivated;

    case 'no_salio':
      return !metrics.salio;

    case 'tiempo_minimo':
      return (metrics.timeInRing || 0) >= criterio.valor;

    case 'pixel_encendido': {
      const [r, g, b] = extra.pixelColor || [0, 0, 0];
      return r > 0 || g > 0 || b > 0;
    }

    case 'consola_output':
      return (extra.consoleLines || 0) >= (criterio.minimo || 1);

    case 'consola_output_personalizado': {
      // Estrella 3 de misión 0.4: el estudiante cambió el mensaje original
      const inicial = '"Hola desde mi robot"';
      return !extra.codigoActual.includes(inicial);
    }

    case 'pixel_set': {
      const [r, g, b] = extra.pixelColor || [0, 0, 0];
      return r > 0 || g > 0 || b > 0;
    }

    case 'pixel_no_rojo': {
      const [r, g, b] = extra.pixelColor || [0, 0, 0];
      // Cualquier color donde no sea exactamente rojo puro (255,0,0) y esté encendido
      const encendido = r > 0 || g > 0 || b > 0;
      const esRojoPuro = r >= 240 && g < 20 && b < 20;
      return encendido && !esRojoPuro;
    }

    case 'pixel_distinto_al_inicial': {
      // El código inicial usa (255, 0, 0). La estrella 3 es haber cambiado el color.
      const [r, g, b] = extra.pixelColor || [0, 0, 0];
      const esRojoPuro = r >= 240 && g < 20 && b < 20;
      const encendido  = r > 0 || g > 0 || b > 0;
      return encendido && !esRojoPuro;
    }

    default:
      return false;
  }
}

/**
 * Evalúa todas las estrellas de una misión.
 * Devuelve { estrellas: 0-3, feedback: string }.
 */
export function evaluarMision(misionData, metrics, extra) {
  let estrellas = 0;

  for (const item of misionData.estrellas) {
    if (evaluaCriterio(item.criterio, metrics, extra)) {
      estrellas = item.cantidad; // el JSON está ordenado: 1, 2, 3
    } else {
      break; // las estrellas son acumulativas: 1 → 2 → 3 en orden
    }
  }

  const feedbackKey = estrellas === 0 ? '0_estrellas'
    : estrellas === 1 ? '1_estrella'
    : estrellas === 2 ? '2_estrellas'
    : '3_estrellas';

  const feedback = misionData.feedback[feedbackKey] || '';

  return { estrellas, feedback };
}
