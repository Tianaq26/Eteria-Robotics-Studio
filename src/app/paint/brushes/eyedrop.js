export const eyedrop = {
  id: 'eyedrop',
  label: 'Gotero',
  icon: '💧',
  usesSizeGroup: false,

  /** state.onSample(hexColor) — el orquestador decide qué hacer (fijar color, volver a pincel). */
  onStrokeStart(ctx, pt, state) {
    const px = Math.max(0, Math.min(state.skinSize - 1, Math.round(pt.x)));
    const py = Math.max(0, Math.min(state.skinSize - 1, Math.round(pt.y)));
    const d = ctx.getImageData(px, py, 1, 1).data;
    const hex = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
    if (state.onSample) state.onSample(hex);
  },
  onStrokeMove() {},
  onStrokeEnd() {},
};
