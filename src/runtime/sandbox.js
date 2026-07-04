// ======================================================
// sandbox.js — Compila el código del usuario en un bot {update, init}
// de forma aislada. Bloquea globales peligrosos (window, fetch, eval...).
// Nota MVP: un bucle infinito síncrono no se puede interrumpir en la misma
// página; eso se endurece con un Web Worker terminable en una fase futura.
// ======================================================

function fmt(a) {
  if (typeof a === 'string') return a;
  try { return JSON.stringify(a); } catch { return String(a); }
}

function makeConsole(onLog) {
  const emit = (lvl) => (...args) => { if (onLog) onLog(args.map(fmt).join(' '), lvl); };
  return { log: emit('log'), info: emit('log'), warn: emit('warn'), error: emit('error') };
}

// Identificadores globales que se "tapan" pasándolos como parámetros undefined.
// Nota: 'eval' y 'arguments' no pueden ser nombres de parámetro en strict mode,
// así que no se bloquean aquí (el sandbox duro con Worker llega en fase futura).
const BLOCKED = [
  'window', 'document', 'fetch', 'XMLHttpRequest', 'WebSocket',
  'Function', 'self', 'globalThis', 'importScripts', 'localStorage',
];

/**
 * @param {string} code  código del usuario (debe definir update(sensors))
 * @param {{onLog?:(msg:string,lvl:string)=>void}} opts
 * @returns {{ok:true, bot:object} | {ok:false, error:string}}
 */
export function compileBot(code, opts = {}) {
  const con = makeConsole(opts.onLog);
  const body =
    '"use strict";\n' +
    code + '\n' +
    'return { update: (typeof update==="function")?update:null,' +
    '         init:   (typeof init==="function")?init:null };';

  let factory;
  try {
    factory = new Function(...BLOCKED, 'console', 'Math', body);
  } catch (e) {
    return { ok: false, error: 'Error de sintaxis: ' + (e && e.message ? e.message : e) };
  }

  let api;
  try {
    api = factory(...BLOCKED.map(() => undefined), con, Math);
  } catch (e) {
    return { ok: false, error: 'Error al cargar el código: ' + (e && e.message ? e.message : e) };
  }

  if (!api || typeof api.update !== 'function') {
    return { ok: false, error: 'Falta la función update(sensors). Debe devolver { left, right }.' };
  }
  return { ok: true, bot: { name: 'Tu código', update: api.update, init: api.init || undefined } };
}
