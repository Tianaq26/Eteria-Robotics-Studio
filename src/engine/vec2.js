// ======================================================
// vec2.js — utilidades de vector 2D (funciones puras)
// ======================================================
export const add  = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub  = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s });
export const dot  = (a, b) => a.x * b.x + a.y * b.y;
export const len  = (a) => Math.hypot(a.x, a.y);
export const norm = (a) => {
  const l = len(a);
  return l > 1e-6 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};
export const fromAngle = (th) => ({ x: Math.cos(th), y: Math.sin(th) });
