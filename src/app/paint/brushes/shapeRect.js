// Rectángulo relleno: arrastrar desde una esquina define el cuadro; se ve
// una vista previa "elástica" en vivo (se restaura el snapshot antes de
// redibujar en cada movimiento) y queda fijo al soltar.
//
// Estado por `ctx` (WeakMap), no en variables de módulo: con espejo activo
// esta misma herramienta se invoca a la vez sobre el canvas real y el
// espejado dentro de la MISMA pincelada (ver strokeEngine.js).
const strokes = new WeakMap(); // ctx -> { startPt, snapshot }

export const shapeRect = {
  id: 'shapeRect',
  label: 'Rectángulo',
  icon: '▭',
  usesSizeGroup: false,

  onStrokeStart(ctx, pt, state) {
    strokes.set(ctx, { startPt: pt, snapshot: ctx.getImageData(0, 0, state.skinSize, state.skinSize) });
  },
  onStrokeMove(ctx, from, to, state) {
    const s = strokes.get(ctx);
    if (!s) return;
    ctx.putImageData(s.snapshot, 0, 0);
    const x = Math.min(s.startPt.x, to.x), y = Math.min(s.startPt.y, to.y);
    const w = Math.abs(to.x - s.startPt.x), h = Math.abs(to.y - s.startPt.y);
    ctx.save();
    ctx.globalAlpha = state.opacity;
    ctx.fillStyle = state.color;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  },
  onStrokeEnd(ctx) { strokes.delete(ctx); },
};
