// ======================================================
// engine.js — Núcleo determinista.
//  - Round: combate paso a paso (lo usa el render en vivo y el modo batch).
//  - runRound / runMatch: helpers batch (headless, tests, evaluación masiva).
// Headless: no depende de render ni de DOM.
// ======================================================
import { RULES, ROBOT, SIM, START } from '../shared/config.js';
import { makeRng } from './rng.js';
import { sampleSensors } from './sensors.js';
import { integrate, resolveCollision, isOut } from './physics.js';
import { len } from './vec2.js';

function makeRobot() {
  return { pos: { x: 0, y: 0 }, th: 0, left: 0, right: 0, out: false, faulted: false };
}

function place(A, B, startPos) {
  A.out = B.out = A.faulted = B.faulted = false;
  A.left = A.right = B.left = B.right = 0;
  const P = Math.PI;
  switch (startPos) {
    case START.ESPALDAS: { const s = ROBOT.SIZE * 0.6; A.pos = { x: -s, y: 0 }; A.th = P; B.pos = { x: s, y: 0 }; B.th = 0; break; }
    case START.DE_LADO:  { const s = ROBOT.SIZE * 0.6; A.pos = { x: 0, y: -s }; A.th = 0; B.pos = { x: 0, y: s }; B.th = P; break; }
    default:             A.pos = { x: -30, y: 0 }; A.th = 0; B.pos = { x: 30, y: 0 }; B.th = P; break;
  }
}

// Llama al cerebro de forma segura. Si lanza, el robot "falla" (pierde).
function safeUpdate(bot, sensors) {
  try {
    const cmd = bot.update(sensors) || {};
    let l = Number(cmd.left), r = Number(cmd.right);
    if (!Number.isFinite(l)) l = 0;
    if (!Number.isFinite(r)) r = 0;
    return { left: l, right: r, error: null };
  } catch (e) {
    return { left: 0, right: 0, error: String(e && e.message ? e.message : e) };
  }
}

/** Un combate paso a paso. step() avanza un tick; getState() para render. */
export class Round {
  constructor(botA, botB, startPos = START.ESPALDAS, seed = 1) {
    this.solo = !botB;                       // modo libre: sin rival
    this.botA = botA; this.botB = botB || { name: '—', update: () => ({ left: 0, right: 0 }) };
    this.startPos = startPos;
    this.A = makeRobot(); this.B = makeRobot();
    // El robot del usuario (A) tiene 20% más de velocidad máxima que los rivales
    this.A.vmax = ROBOT.WHEEL_VMAX * 1.20;
    place(this.A, this.B, startPos);
    if (this.solo) { this.A.pos = { x: 0, y: 0 }; this.A.th = 0; this.B.pos = { x: 1e6, y: 1e6 }; this.B.out = true; }
    if (botA.init) try { botA.init({ startPos }); } catch (_) {}
    if (this.botB.init) try { this.botB.init({ startPos }); } catch (_) {}
    this.rng = makeRng(seed);
    this.t = 0; this.tick = 0; this.checksum = 0;
    this.done = false; this.result = null;
    this.sA = sampleSensors(this.A, this.B, 0);
    this.sB = sampleSensors(this.B, this.A, 0);
    // Métricas para evaluación de misiones
    this.metrics = { distanceTraveled: 0, totalAngleChange: 0, motorsActivated: false, timeInRing: 0, salio: false };
  }

  _finish(winner, reason) {
    this.done = true;
    this.result = { winner, reason, ticks: this.tick, checksum: this.checksum };
    if (winner === 'A') this.B.out = true;
    else if (winner === 'B') this.A.out = true;
    return this.result;
  }

  /** Modo libre: solo el robot A, sin rival ni colisiones. */
  _stepSolo() {
    if (this.done) return { done: true, ...this.result };
    const dt = SIM.DT;
    const A = this.A;
    this.sA = sampleSensors(A, this.B, this.t); // B lejísimos => enemy nunca detectado
    const cA = safeUpdate(this.botA, this.sA);
    if (cA.error) { A.faulted = true; return { done: true, ...this._finish('out', 'falla SW: ' + cA.error) }; }
    A.left = cA.left; A.right = cA.right;
    const vMaxS = ROBOT.WHEEL_VMAX;
    const vLS = A.left * vMaxS, vRS = A.right * vMaxS;
    this.metrics.distanceTraveled += Math.abs((vLS + vRS) * 0.5) * dt;
    this.metrics.totalAngleChange += Math.abs((vRS - vLS) / ROBOT.WHEEL_BASE) * dt;
    if (Math.abs(A.left) > 0.05 || Math.abs(A.right) > 0.05) this.metrics.motorsActivated = true;
    integrate(A, dt);
    this.checksum = (this.checksum + A.pos.x + A.pos.y * 3 + A.th * 13) % 1e9;
    this.tick++;
    if (isOut(A)) { this.metrics.salio = true; return { done: true, ...this._finish('out', 'saliste del ring') }; }
    this.metrics.timeInRing += dt;
    this.t += dt;
    if (this.tick >= SIM.MAX_TICKS) return { done: true, ...this._finish('survive', 'sobreviviste el límite') };
    return { done: false };
  }

  /** Avanza un tick. Devuelve {done, winner?, reason?}. */
  step() {
    if (this.solo) return this._stepSolo();
    if (this.done) return { done: true, ...this.result };
    const dt = SIM.DT;
    const A = this.A, B = this.B;

    this.sA = sampleSensors(A, B, this.t);
    this.sB = sampleSensors(B, A, this.t);
    const cA = safeUpdate(this.botA, this.sA);
    const cB = safeUpdate(this.botB, this.sB);
    if (cA.error) { A.faulted = true; return { done: true, ...this._finish('B', 'falla SW de A: ' + cA.error) }; }
    if (cB.error) { B.faulted = true; return { done: true, ...this._finish('A', 'falla SW de B: ' + cB.error) }; }
    A.left = cA.left; A.right = cA.right;
    B.left = cB.left; B.right = cB.right;

    // Métricas del robot A (antes de integrar para usar los valores de throttle actuales)
    const vMaxA = ROBOT.WHEEL_VMAX;
    const vLA = A.left * vMaxA, vRA = A.right * vMaxA;
    this.metrics.distanceTraveled += Math.abs((vLA + vRA) * 0.5) * dt;
    this.metrics.totalAngleChange += Math.abs((vRA - vLA) / ROBOT.WHEEL_BASE) * dt;
    if (Math.abs(A.left) > 0.05 || Math.abs(A.right) > 0.05) this.metrics.motorsActivated = true;
    this.metrics.timeInRing += dt;

    integrate(A, dt);
    integrate(B, dt);
    // 3 passes to handle tunneling at high throttle
    resolveCollision(A, B);
    resolveCollision(A, B);
    resolveCollision(A, B);

    this.checksum = (this.checksum + A.pos.x + A.pos.y * 3 + B.pos.x * 7 + B.pos.y * 11 + A.th * 13 + B.th * 17) % 1e9;
    this.tick++;

    const aOut = isOut(A), bOut = isOut(B);
    if (aOut && bOut) { this.metrics.salio = true; return { done: true, ...this._finish('draw', 'doble salida') }; }
    if (aOut) { this.metrics.salio = true; return { done: true, ...this._finish('B', 'B saca a A') }; }
    if (bOut) return { done: true, ...this._finish('A', 'A saca a B') };

    this.t += dt;
    if (this.t >= RULES.COMBAT_TIME || this.tick >= SIM.MAX_TICKS) {
      const dA = len(A.pos), dB = len(B.pos);
      if (Math.abs(dA - dB) < 1.0) return { done: true, ...this._finish('draw', 'tiempo: empate') };
      return { done: true, ...this._finish(dA < dB ? 'A' : 'B', 'tiempo: gana el más centrado') };
    }
    return { done: false };
  }

  getState() {
    return {
      A: { pos: this.A.pos, th: this.A.th, out: this.A.out, left: this.A.left, right: this.A.right },
      B: { pos: this.B.pos, th: this.B.th, out: this.B.out, left: this.B.left, right: this.B.right },
      sA: this.sA, sB: this.sB, solo: this.solo,
      t: this.t, tLeft: Math.max(0, RULES.COMBAT_TIME - this.t),
    };
  }

  getMetrics() { return { ...this.metrics }; }
}

/** Simula UN combate completo (batch). Mismo shape de retorno que antes. */
export function runRound(botA, botB, startPos, seed = 1) {
  const r = new Round(botA, botB, startPos, seed);
  let s; do { s = r.step(); } while (!s.done);
  return { winner: r.result.winner, reason: r.result.reason, ticks: r.tick, checksum: r.checksum };
}

/** Simula una PARTIDA al mejor de 3, rotando la posición de inicio. */
export function runMatch(botA, botB, seed = 1) {
  let scoreA = 0, scoreB = 0;
  const rounds = [];
  let startPos = START.ESPALDAS;
  for (let i = 0; i < RULES.ROUNDS; i++) {
    const res = runRound(botA, botB, startPos, seed + i);
    rounds.push({ startPos, ...res });
    if (res.winner === 'A') scoreA++;
    else if (res.winner === 'B') scoreB++;
    startPos = (startPos % 3) + 1;
    if (scoreA >= 2 || scoreB >= 2) break;
  }
  const winner = scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'draw';
  return { winner, scoreA, scoreB, rounds };
}
