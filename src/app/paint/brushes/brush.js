import { stampSoft, strokeAlong } from './common.js';

export const brush = {
  id: 'brush',
  label: 'Pincel',
  icon: '🖌️',
  usesSizeGroup: true,

  onStrokeStart(ctx, pt, state) {
    stampSoft(ctx, pt.x, pt.y, state.size, state.hardness, state.color, state.opacity);
  },
  onStrokeMove(ctx, from, to, state) {
    strokeAlong(from, to, Math.max(2, state.size * state.spacing), (x, y) =>
      stampSoft(ctx, x, y, state.size, state.hardness, state.color, state.opacity));
  },
  onStrokeEnd() {},
};
