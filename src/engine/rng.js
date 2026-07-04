// ======================================================
// rng.js — Generador pseudoaleatorio con semilla (determinista).
// mulberry32: rápido, reproducible. NUNCA usar Math.random en el núcleo.
// ======================================================
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
