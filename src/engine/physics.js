// ======================================================
// physics.js — Movimiento (tracción diferencial) y empuje.
// Colisión: OBB vs OBB (SAT) para cuerpos rectangulares reales.
// ======================================================
import { ROBOT, RULES } from '../shared/config.js';
import { add, sub, scale, dot, len, norm, fromAngle } from './vec2.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Integra un robot un paso dt según sus velocidades de rueda (left/right -1..1). */
export function integrate(r, dt) {
  if (r.out) return;
  const vmax = r.vmax || ROBOT.WHEEL_VMAX;
  const vR = clamp(r.right, -1, 1) * vmax;
  const vL = clamp(r.left,  -1, 1) * vmax;
  const v  = (vR + vL) * 0.5;
  const w  = (vR - vL) / ROBOT.WHEEL_BASE;
  r.th  += w * dt;
  r.pos  = add(r.pos, scale(fromAngle(r.th), v * dt));
}

/**
 * Colisión OBB vs OBB usando el Teorema del Eje de Separación (SAT).
 * Robots cuadrados de lado ROBOT.SIZE. Sin penetración visual.
 */
export function resolveCollision(a, b) {
  if (a.out || b.out) return;

  const h  = ROBOT.SIZE / 2;          // semi-lado
  const d  = sub(b.pos, a.pos);       // vector A→B

  // Ejes locales de cada robot (frente y derecha)
  const fA = fromAngle(a.th);
  const rA = fromAngle(a.th + Math.PI / 2);
  const fB = fromAngle(b.th);
  const rB = fromAngle(b.th + Math.PI / 2);

  let minPen  = Infinity;
  let penAxis = null;

  // Probar los 4 ejes (2 de A, 2 de B)
  for (const ax of [fA, rA, fB, rB]) {
    // Proyección de A y B sobre el eje ax
    const pA = h * (Math.abs(dot(fA, ax)) + Math.abs(dot(rA, ax)));
    const pB = h * (Math.abs(dot(fB, ax)) + Math.abs(dot(rB, ax)));
    const dd = dot(d, ax);
    const pen = pA + pB - Math.abs(dd);

    if (pen <= 0) return;          // eje separador encontrado → sin colisión

    if (pen < minPen) {
      minPen  = pen;
      // El eje debe apuntar de A hacia B
      penAxis = dd >= 0 ? ax : { x: -ax.x, y: -ax.y };
    }
  }

  // Resolver: empujar a lo largo del eje de mínima penetración
  const n = penAxis;

  // Fuerza de empuje proporcional al impulso de cada robot en esa dirección
  const thrA = Math.max(0, dot(fA, n))               * Math.max(0, (a.left + a.right) * 0.5);
  const thrB = Math.max(0, dot(fB, { x: -n.x, y: -n.y })) * Math.max(0, (b.left + b.right) * 0.5);

  const total  = thrA + thrB;
  const shareA = total < 1e-3 ? 0.5 : thrA / total;
  const shareB = total < 1e-3 ? 0.5 : thrB / total;

  b.pos = add(b.pos, scale(n,              minPen * shareA));
  a.pos = sub(a.pos, scale(n,              minPen * shareB));
}

/** ¿El robot salió del ring? (centro supera la mitad del borde blanco) */
export function isOut(r) {
  return len(r.pos) > RULES.RINGOUT_R;
}
