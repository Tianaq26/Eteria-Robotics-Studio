// ======================================================
// mirrorPaint.js — Modo espejo. Si la pieza activa tiene una pareja
// (panel_lateral_left/right), el trazo se replica en el canvas de la pareja
// con la X reflejada. Si la pieza no tiene pareja (panel_frontal,
// panel_trasero), se refleja dentro de su propio canvas sobre su eje vertical.
// ======================================================
import { getPartDef, SKIN } from './parts.js';
import { getPart, markDirty } from './canvasStore.js';

let enabled = false;

export function isMirrorEnabled() { return enabled; }
export function setMirrorEnabled(v) { enabled = v; }
export function toggleMirror() { enabled = !enabled; return enabled; }

/** Devuelve { ctx, sameCanvas } de la pieza espejo para `partId`, o null si el espejo está apagado. */
export function getMirrorCtx(partId) {
  if (!enabled) return null;
  const def = getPartDef(partId);
  const mirrorId = (def && def.mirrorOf) || partId;
  const entry = getPart(mirrorId);
  if (!entry) return null;
  return { id: mirrorId, ctx: entry.ctx, sameCanvas: mirrorId === partId };
}

export function mirrorX(x) { return SKIN - x; }

/** Aplica un punto/segmento ya calculado al canvas espejo, reflejando X. */
export function applyMirrored(partId, applyFn) {
  const mirror = getMirrorCtx(partId);
  if (!mirror) return;
  applyFn(mirror.ctx, mirrorX);
  markDirty(mirror.id);
}
