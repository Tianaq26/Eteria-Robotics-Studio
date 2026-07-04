// ======================================================
// sensors.js — Simulación de sensores (sin hardware real).
// 4 IR hacia el piso (borde blanco) + 1 ultrasónico frontal.
// ======================================================
import { RULES, ROBOT } from '../shared/config.js';
import { add, sub, scale, dot, len, norm, fromAngle } from './vec2.js';

// Un punto está sobre la banda blanca si su radio cae en [R_INT, R_EXT].
function sobreBlanco(p) {
  const d = Math.hypot(p.x, p.y);
  return d >= RULES.DOJO_R_INT && d <= RULES.DOJO_R_EXT;
}

/**
 * Construye el objeto de sensores que recibe el cerebro del bot.
 * @param {Robot} self  robot que percibe
 * @param {Robot} enemy rival
 * @param {number} time segundos transcurridos del combate
 */
export function sampleSensors(self, enemy, time) {
  const f = fromAngle(self.th);          // adelante
  const l = { x: -f.y, y: f.x };         // izquierda
  const o = ROBOT.IR_OFF;
  // Offset frontal = o en eje f, offset lateral = o*0.6 en eje l
  // Evita el error diagonal (antes era o en ambos ejes → distancia o*√2 desde centro)
  const ol = o * 0.6;

  const pFL = add(add(self.pos, scale(f, o)), scale(l, ol));
  const pFR = add(sub(self.pos, scale(l, ol)), scale(f, o));
  const pBL = add(sub(self.pos, scale(f, o)), scale(l, ol));
  const pBR = sub(sub(self.pos, scale(f, o)), scale(l, ol));

  const frontLeft  = sobreBlanco(pFL);
  const frontRight = sobreBlanco(pFR);
  const backLeft   = sobreBlanco(pBL);
  const backRight  = sobreBlanco(pBR);

  // Ultrasónico: cono frontal ~±15°, distancia a la cara del rival.
  const d = sub(enemy.pos, self.pos);
  const dist = len(d);
  let detected = false, distance = null, bearing = 0;
  if (dist > 1e-3) {
    const to = norm(d);
    const cosang = dot(to, f);
    const CONO = Math.cos((15 * Math.PI) / 180);
    if (cosang >= CONO) {
      detected = true;
      distance = Math.max(0, dist - ROBOT.COL_R);
    }
    // bearing: + = rival a la izquierda, - = a la derecha, 0 = al frente.
    const cross = f.x * to.y - f.y * to.x;
    bearing = Math.atan2(cross, cosang) / Math.PI; // -1..1
  }

  const contact = dist <= ROBOT.COL_R * 2 + 0.5;

  return {
    enemy: { detected, distance, bearing },
    border: {
      frontLeft, frontRight, backLeft, backRight,
      front: frontLeft || frontRight,
      any: frontLeft || frontRight || backLeft || backRight,
    },
    contact,
    time,
  };
}
