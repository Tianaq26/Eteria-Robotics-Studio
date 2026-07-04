import { strokeAlong } from './common.js';

// Arrastre de color (smudge): en cada paso, toma un parche circular del punto
// anterior y lo mezcla en el punto actual antes de avanzar — imita el efecto
// "dedo mojado" sin necesitar WebGL.
//
// El estado (parche capturado) se guarda por `ctx` (WeakMap), no en variables
// de módulo: con el modo espejo activo, strokeEngine.js llama a esta misma
// herramienta una vez por el canvas real y otra por el canvas espejado en la
// MISMA pincelada — variables de módulo compartidas mezclarían el parche de
// una pieza con el de la otra.
const patches = new WeakMap(); // ctx -> { canvas, ctx }

function getPatchSlot(ctx) {
  let slot = patches.get(ctx);
  if (!slot) { slot = { canvas: document.createElement('canvas'), ctx: null }; slot.ctx = slot.canvas.getContext('2d'); patches.set(ctx, slot); }
  return slot;
}

function capturePatch(ctx, sourceCanvas, x, y, r) {
  const slot = getPatchSlot(ctx);
  const size = Math.max(2, Math.round(r * 2));
  if (slot.canvas.width !== size) { slot.canvas.width = slot.canvas.height = size; }
  slot.ctx.clearRect(0, 0, size, size);
  slot.ctx.drawImage(sourceCanvas, x - r, y - r, size, size, 0, 0, size, size);
}

function stampPatch(ctx, x, y, r, opacity) {
  const slot = patches.get(ctx);
  if (!slot) return;
  const size = slot.canvas.width;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(slot.canvas, x - r, y - r, size, size);
  ctx.restore();
}

export const smudge = {
  id: 'smudge',
  label: 'Arrastrar',
  icon: '👆',
  usesSizeGroup: true,

  onStrokeStart(ctx, pt, state) {
    const r = Math.max(2, state.size / 2);
    capturePatch(ctx, ctx.canvas, pt.x, pt.y, r);
  },
  onStrokeMove(ctx, from, to, state) {
    const r = Math.max(2, state.size / 2);
    strokeAlong(from, to, Math.max(2, state.size * state.spacing), (x, y) => {
      stampPatch(ctx, x, y, r, state.opacity);
      capturePatch(ctx, ctx.canvas, x, y, r);
    });
  },
  onStrokeEnd() {},
};
