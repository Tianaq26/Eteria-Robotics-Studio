// ======================================================
// index.js — Registro de herramientas de pintura. Agregar una herramienta
// nueva = crear su módulo con la misma forma { id, label, icon, usesSizeGroup,
// onStrokeStart(ctx, pt, state), onStrokeMove(ctx, from, to, state),
// onStrokeEnd(ctx, state) } y sumarla aquí; el motor (tools.js) no cambia.
// ======================================================
import { brush } from './brush.js';
import { eraser } from './eraser.js';
import { bucket } from './bucket.js';
import { blur } from './blur.js';
import { smudge } from './smudge.js';
import { eyedrop } from './eyedrop.js';
import { shapeRect } from './shapeRect.js';
import { shapeCircle } from './shapeCircle.js';

export const TOOLS = { brush, eraser, bucket, blur, smudge, eyedrop, shapeRect, shapeCircle };
export const TOOL_ORDER = ['brush', 'eraser', 'bucket', 'shapeRect', 'shapeCircle', 'blur', 'smudge', 'eyedrop'];

export function getTool(id) {
  return TOOLS[id] || TOOLS.brush;
}
