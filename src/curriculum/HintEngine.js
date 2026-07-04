// ======================================================
// HintEngine.js — Sistema de pistas en 3 capas.
//   Capa 1: pistas JSON de la misión (genéricas)
//   Capa 2: diagnóstico basado en métricas reales
//   Capa 3: análisis del código del estudiante
// ======================================================

const RAD_TO_DEG = 180 / Math.PI;

// ── Capa 2: diagnóstico por métricas ─────────────────

export function getDiagnosticHint(misionData, metrics, extra) {
  for (const { criterio } of misionData.estrellas) {
    switch (criterio.tipo) {

      case 'distancia_minima': {
        const d = metrics.distanceTraveled || 0;
        if (d < 0.5)
          return 'El robot no se movió. Asegúrate de que los valores de throttle sean distintos de 0.';
        if (d < criterio.valor)
          return `El robot recorrió ${d.toFixed(1)} cm, pero necesita ${criterio.valor} cm para la siguiente estrella. Aumenta el throttle.`;
        break;
      }

      case 'angulo_minimo': {
        const deg = (metrics.totalAngleChange || 0) * RAD_TO_DEG;
        if (deg < 3)
          return 'El robot no giró. Para girar, las dos ruedas deben tener velocidades distintas.';
        if (deg < criterio.valor)
          return `El robot giró ${deg.toFixed(0)}°, necesita ${criterio.valor}° para la siguiente estrella. Aumenta la diferencia entre las ruedas.`;
        break;
      }

      case 'motores_activados':
      case 'motores_activos':
        if (!metrics.motorsActivated)
          return 'Los motores no se activaron. Verifica que throttle tenga un valor distinto de 0.';
        break;

      case 'no_salio':
        if (metrics.salio)
          return 'El robot salio del dojo. Baja la velocidad o gira antes de acercarte al borde.';
        break;

      case 'tiempo_minimo': {
        const t = metrics.timeInRing || 0;
        if (t < criterio.valor)
          return `El robot sobrevivio ${t.toFixed(1)}s, pero necesita ${criterio.valor}s para la siguiente estrella. Evita el borde y mantente dentro del dojo.`;
        break;
      }

      case 'consola_output': {
        const lines = extra.consoleLines || 0;
        if (lines === 0)
          return 'No apareció ningún mensaje. Verifica que print() esté escrito exactamente así, con paréntesis.';
        if (lines < (criterio.minimo || 1))
          return `Llegaron ${lines} mensaje(s), se necesitan ${criterio.minimo}. Agrega más líneas de print().`;
        break;
      }

      case 'pixel_set':
      case 'pixel_encendido': {
        const [r, g, b] = extra.pixelColor || [0, 0, 0];
        if (r === 0 && g === 0 && b === 0)
          return 'El LED está apagado. Cambia los valores: (0, 0, 0) es negro. Prueba con (255, 0, 0) para rojo.';
        break;
      }

      case 'pixel_no_rojo': {
        const [r, g, b] = extra.pixelColor || [0, 0, 0];
        const enc = r > 0 || g > 0 || b > 0;
        if (!enc) return 'El LED está apagado. Necesitas un color encendido que no sea rojo puro.';
        if (r >= 240 && g < 20 && b < 20)
          return 'El LED está en rojo puro (255,0,0). Cambia al menos uno de los otros valores para otro color.';
        break;
      }

      case 'consola_output_personalizado': {
        const inicial = '"Hola desde mi robot"';
        if ((extra.codigoActual || '').includes(inicial))
          return 'Cambia el texto dentro del print(). El mensaje "Hola desde mi robot" es el original — escribe el tuyo.';
        break;
      }
    }
  }
  return null;
}

// ── Capa 3: análisis del código ───────────────────────

export function getCodeWarnings(misionData, codigo) {
  const warnings = [];
  const tipos = misionData.estrellas.map(e => e.criterio.tipo);

  const needsMotors = tipos.some(t =>
    t === 'distancia_minima' || t === 'angulo_minimo' || t === 'motores_activados' || t === 'motores_activos'
  );

  if (needsMotors) {
    const m1zero = /motor_1\.throttle\s*=\s*0(\.0*)?\b/.test(codigo);
    const m2zero = /motor_2\.throttle\s*=\s*0(\.0*)?\b/.test(codigo);
    if (m1zero && m2zero)
      warnings.push('Ambos motores tienen throttle = 0. El robot no se moverá.');
    else if (m1zero)
      warnings.push('motor_1.throttle = 0 — ese motor está parado. ¿Es intencional?');
    else if (m2zero)
      warnings.push('motor_2.throttle = 0 — ese motor está parado. ¿Es intencional?');
  }

  const needsPixel = tipos.some(t => t.startsWith('pixel'));
  if (needsPixel && /pixel\s*=\s*\(\s*0\s*,\s*0\s*,\s*0\s*\)/.test(codigo))
    warnings.push('ib.pixel = (0, 0, 0) mantiene el LED apagado. Cambia al menos un valor para encenderlo.');

  const needsConsole = tipos.includes('consola_output') || tipos.includes('consola_output_personalizado');
  if (needsConsole && !/print\s*\(/.test(codigo))
    warnings.push('No hay ningún print() en el código. Necesitas al menos uno para que aparezca un mensaje.');

  return warnings;
}

// ── API pública: pista combinada ──────────────────────

/**
 * Devuelve la pista más útil en este momento.
 * Orden: diagnóstico → advertencias de código → pistas JSON.
 */
export function getBestHint(misionData, metrics, extra, hintIndex) {
  const diagnostic    = getDiagnosticHint(misionData, metrics, extra);
  const codeWarnings  = getCodeWarnings(misionData, extra.codigoActual || '');
  const jsonHints     = misionData.pistas || [];

  const pool = [
    ...(diagnostic   ? [{ text: diagnostic,   icon: '🔍' }] : []),
    ...codeWarnings.map(w => ({ text: w, icon: '⚠️' })),
    ...jsonHints.map(h     => ({ text: h, icon: '💡' })),
  ];

  if (pool.length === 0) return null;
  return pool[hintIndex % pool.length];
}

// ── Progreso por criterio (para overlay detallado) ───

export function getCriteriaProgress(misionData, metrics, extra) {
  return misionData.estrellas.map(({ criterio, descripcion, cantidad }) => {
    let passed = false;
    let value = null;   // valor actual
    let target = null;  // valor objetivo
    let unit = '';

    switch (criterio.tipo) {
      case 'distancia_minima':
        value  = metrics.distanceTraveled || 0;
        target = criterio.valor;
        unit   = 'cm';
        passed = value >= target;
        break;

      case 'angulo_minimo':
        value  = (metrics.totalAngleChange || 0) * RAD_TO_DEG;
        target = criterio.valor;
        unit   = '°';
        passed = value >= target;
        break;

      case 'motores_activados':
      case 'motores_activos':
        passed = metrics.motorsActivated;
        break;

      case 'no_salio':
        passed = !metrics.salio;
        break;

      case 'tiempo_minimo':
        value  = metrics.timeInRing || 0;
        target = criterio.valor;
        unit   = 's';
        passed = value >= target;
        break;

      case 'consola_output':
        value  = extra.consoleLines || 0;
        target = criterio.minimo || 1;
        unit   = 'msgs';
        passed = value >= target;
        break;

      case 'consola_output_personalizado':
        passed = !(extra.codigoActual || '').includes('"Hola desde mi robot"');
        break;

      case 'pixel_set':
      case 'pixel_encendido': {
        const [r, g, b] = extra.pixelColor || [0, 0, 0];
        passed = r > 0 || g > 0 || b > 0;
        break;
      }

      case 'pixel_no_rojo': {
        const [r, g, b] = extra.pixelColor || [0, 0, 0];
        passed = (r > 0 || g > 0 || b > 0) && !(r >= 240 && g < 20 && b < 20);
        break;
      }

      case 'pixel_distinto_al_inicial': {
        const [r, g, b] = extra.pixelColor || [0, 0, 0];
        passed = (r > 0 || g > 0 || b > 0) && !(r >= 240 && g < 20 && b < 20);
        break;
      }

      default:
        passed = false;
    }

    return { cantidad, descripcion, passed, value, target, unit };
  });
}
