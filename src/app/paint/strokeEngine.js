// ======================================================
// strokeEngine.js — Puente entre "el usuario tocó el pixel (x,y) de la
// pieza P" (que reportan viewport3d.js vía raycast+UV y viewport2d.js vía
// la transformación inversa del layout) y el motor de pinceles + el modo
// espejo. Único lugar que empuja undo y marca la textura para actualizar.
// ======================================================
import { SKIN, PART_IDS } from './parts.js';
import { getPart, pushUndo, markDirty } from './canvasStore.js';
import { getTool } from './brushes/index.js';
import { getMirrorCtx, mirrorX } from './mirrorPaint.js';
import { state as paintState, setColor, setTool } from './paintState.js';

let painting = false;
let lastPt = null;
let paintedPartId = null;
let lastTouchedPartId = PART_IDS[0];

export function getLastTouchedPart() { return lastTouchedPartId; }

function buildToolState(extra) {
  return {
    color: paintState.color,
    size: paintState.size,
    hardness: paintState.hardness,
    opacity: paintState.opacity,
    spacing: paintState.spacing,
    skinSize: SKIN,
    onSample: (hex) => { setColor(hex); setTool('brush'); },
    ...extra,
  };
}

export function isPainting() { return painting; }

export function strokeStart(partId, pt) {
  const entry = getPart(partId);
  if (!entry) return;
  const tool = getTool(paintState.tool);
  painting = true;
  paintedPartId = partId;
  lastTouchedPartId = partId;
  lastPt = pt;
  const skipUndo = tool.id === 'eyedrop';
  if (!skipUndo) pushUndo(partId);
  tool.onStrokeStart(entry.ctx, pt, buildToolState());
  markDirty(partId);

  const mirror = !skipUndo && getMirrorCtx(partId);
  if (mirror) {
    pushUndo(mirror.id);
    const mpt = { x: mirrorX(pt.x), y: pt.y };
    tool.onStrokeStart(mirror.ctx, mpt, buildToolState());
    markDirty(mirror.id);
  }
}

export function strokeMove(partId, pt) {
  if (!painting || partId !== paintedPartId) return;
  const entry = getPart(partId);
  if (!entry || !lastPt) return;
  const tool = getTool(paintState.tool);
  tool.onStrokeMove(entry.ctx, lastPt, pt, buildToolState());
  markDirty(partId);

  const mirror = getMirrorCtx(partId);
  if (mirror) {
    const from = { x: mirrorX(lastPt.x), y: lastPt.y };
    const to = { x: mirrorX(pt.x), y: pt.y };
    tool.onStrokeMove(mirror.ctx, from, to, buildToolState());
    markDirty(mirror.id);
  }
  lastPt = pt;
}

export function strokeEnd() {
  if (!painting) return;
  const tool = getTool(paintState.tool);
  const entry = paintedPartId && getPart(paintedPartId);
  if (entry) tool.onStrokeEnd(entry.ctx, buildToolState());
  painting = false;
  lastPt = null;
  paintedPartId = null;
}
