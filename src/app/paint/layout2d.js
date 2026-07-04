// ======================================================
// layout2d.js — Acomodo de las piezas pintables en la vista 2D "desplegada".
// Cada canvas es un cuadrado (1024×1024) y se muestra tal cual, SIN recortar
// ni deformar — un rectángulo no-cuadrado o un recorte inventado (triángulo)
// haría que lo pintado en 2D no correspondiera 1 a 1 con lo que realmente
// hay en la textura (y por lo tanto con lo que se ve en 3D). Así que aquí
// todas las piezas son cuadrados del mismo tamaño, acomodados en cruz
// (frontal arriba, laterales a los costados, trasero abajo) solo para
// que la posición recuerde a la silueta del robot — no representan la forma
// física de cada panel.
// ======================================================
const SIZE = 240;
const GAP = 16;
const STEP = SIZE + GAP;

export const LAYOUT_W = STEP * 3 - GAP;
export const LAYOUT_H = STEP * 3 - GAP;

export const LAYOUT = [
  { partId: 'panel_frontal',       box: { x: STEP,   y: 0,      w: SIZE, h: SIZE } },
  { partId: 'panel_lateral_left',  box: { x: 0,      y: STEP,   w: SIZE, h: SIZE } },
  { partId: 'panel_lateral_right', box: { x: STEP*2, y: STEP,   w: SIZE, h: SIZE } },
  { partId: 'panel_trasero',       box: { x: STEP,   y: STEP*2, w: SIZE, h: SIZE } },
];

export function getLayoutFor(partId) {
  return LAYOUT.find((l) => l.partId === partId) || null;
}
