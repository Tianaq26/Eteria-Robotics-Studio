// Círculo/elipse relleno: arrastrar desde una esquina define el cuadro
// contenedor, igual que shapeRect.js, con la misma vista previa elástica.
// Estado por `ctx` (WeakMap) — ver el comentario en shapeRect.js sobre por
// qué no puede ser una variable de módulo (rompería el modo espejo).
const strokes = new WeakMap(); // ctx -> { startPt, snapshot }

export const shapeCircle = {
  id: 'shapeCircle',
  label: 'Círculo',
  icon: '⬤',
  usesSizeGroup: false,

  onStrokeStart(ctx, pt, state) {
    strokes.set(ctx, { startPt: pt, snapshot: ctx.getImageData(0, 0, state.skinSize, state.skinSize) });
  },
  onStrokeMove(ctx, from, to, state) {
    const s = strokes.get(ctx);
    if (!s) return;
    ctx.putImageData(s.snapshot, 0, 0);
    const cx = (s.startPt.x + to.x) / 2, cy = (s.startPt.y + to.y) / 2;
    const rx = Math.abs(to.x - s.startPt.x) / 2, ry = Math.abs(to.y - s.startPt.y) / 2;
    ctx.save();
    ctx.globalAlpha = state.opacity;
    ctx.fillStyle = state.color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  onStrokeEnd(ctx) { strokes.delete(ctx); },
};
