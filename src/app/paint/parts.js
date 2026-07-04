// ======================================================
// parts.js — Catálogo de las piezas pintables del sumobot.
// Cada pieza es una malla independiente del GLB con su propio UV 0..1
// (no comparten atlas), así que cada una tiene su propio canvas/textura.
// ======================================================

export const SKIN = 1024;          // resolución de cada canvas de pieza
export const BASE_COLOR = '#c8c8cc'; // gris "sin pintar"

// robot_base NO es pintable a propósito: conserva siempre su material original
// del GLB (nunca se le clona material ni se le asigna canvas/textura).
export const PARTS = [
  { id: 'panel_frontal',        nodeName: 'panel_frontal',        label: 'Panel frontal' },
  { id: 'panel_lateral_left',   nodeName: 'panel_lateral_left',   label: 'Panel lateral izq.', mirrorOf: 'panel_lateral_right' },
  { id: 'panel_lateral_right',  nodeName: 'panel_lateral_right',  label: 'Panel lateral der.', mirrorOf: 'panel_lateral_left' },
  { id: 'panel_trasero',        nodeName: 'panel_trasero',        label: 'Panel trasero' },
];

export const PART_IDS = PARTS.map(p => p.id);

export function getPartDef(id) {
  return PARTS.find(p => p.id === id) || null;
}
