// ======================================================
// headless.js — Prueba el núcleo sin render:
//  1) corre partidas entre bots predefinidos
//  2) verifica DETERMINISMO (misma semilla => mismo resultado)
// Ejecutar:  npm test   (o)  node tests/headless.js
// ======================================================
import { runMatch, runRound } from '../src/engine/engine.js';
import { START } from '../src/shared/config.js';
import StraightBot from '../src/bots/straight.js';
import SpinnerBot from '../src/bots/spinner.js';
import CenterBot from '../src/bots/center.js';
import ReactiveBot from '../src/bots/reactive.js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluarMision } from '../src/curriculum/MissionRunner.js';
import { getCriteriaProgress } from '../src/curriculum/HintEngine.js';

const bots = { StraightBot, SpinnerBot, CenterBot, ReactiveBot };
const posName = { 1: 'ESPALDAS', 2: 'DE_LADO', 3: 'DE_FRENTE' };

function partida(a, b, seed = 42) {
  const A = bots[a], B = bots[b];
  const res = runMatch(A, B, seed);
  console.log(`\n=== ${a}  vs  ${b}  (semilla ${seed}) ===`);
  res.rounds.forEach((r, i) =>
    console.log(`  Combate ${i + 1} [${posName[r.startPos]}] -> ${r.winner.padEnd(4)}  (${r.reason}, ${ (r.ticks/60).toFixed(1)}s)`));
  console.log(`  RESULTADO: ${res.winner === 'A' ? a : res.winner === 'B' ? b : 'EMPATE'}  (A ${res.scoreA} : ${res.scoreB} B)`);
  return res;
}

console.log('SUMOBOT ARENA IDE — pruebas del núcleo headless');

// 1) Algunas partidas de ejemplo
partida('ReactiveBot', 'StraightBot');
partida('ReactiveBot', 'SpinnerBot');
partida('CenterBot', 'StraightBot');
partida('SpinnerBot', 'StraightBot');

// 2) Test de determinismo: mismo input -> mismo checksum
console.log('\n=== Test de determinismo ===');
let ok = true;
for (const [a, b] of [['ReactiveBot','SpinnerBot'], ['CenterBot','ReactiveBot']]) {
  const r1 = runRound(bots[a], bots[b], START.DE_FRENTE, 123);
  const r2 = runRound(bots[a], bots[b], START.DE_FRENTE, 123);
  const same = r1.winner === r2.winner && r1.ticks === r2.ticks && r1.checksum === r2.checksum;
  console.log(`  ${a} vs ${b}: ${same ? 'OK determinista' : 'FALLO'}  (checksum ${r1.checksum.toFixed(2)} / ${r2.checksum.toFixed(2)})`);
  ok = ok && same;
}

// 3) Todas las misiones deben validar estrellas y progreso con los mismos criterios
console.log('\n=== Test de criterios de misiones ===');
const maxMetrics = {
  distanceTraveled: 999,
  totalAngleChange: Math.PI * 4,
  motorsActivated: true,
  salio: false,
  timeInRing: 999,
};
const maxExtra = {
  consoleLines: 99,
  pixelColor: [0, 80, 255],
  codigoActual: 'print("Mensaje propio")',
};

for (const worldDir of readdirSync('content').filter(name => name.startsWith('world-')).sort()) {
  for (const file of readdirSync(join('content', worldDir)).filter(name => name.endsWith('.json')).sort()) {
    const path = join('content', worldDir, file);
    const mission = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(mission.estrellas)) continue;
    const result = evaluarMision(mission, maxMetrics, maxExtra);
    const progress = getCriteriaProgress(mission, maxMetrics, maxExtra);
    const allProgressOk = progress.every(item => item.passed);
    const missionOk = result.estrellas === 3 && allProgressOk;
    console.log(`  ${mission.id || path}: ${missionOk ? 'OK' : 'FALLO'}  (estrellas ${result.estrellas}, progreso ${progress.filter(p => p.passed).length}/${progress.length})`);
    ok = ok && missionOk;
  }
}

console.log(`\n${ok ? 'TODO OK' : 'HAY FALLOS'}`);
process.exit(ok ? 0 : 1);
