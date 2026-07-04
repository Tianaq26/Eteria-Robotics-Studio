import { stampSoft, strokeAlong } from './common.js';
import { BASE_COLOR } from '../parts.js';

export const eraser = {
  id: 'eraser',
  label: 'Goma',
  icon: '🧽',
  usesSizeGroup: true,

  onStrokeStart(ctx, pt, state) {
    stampSoft(ctx, pt.x, pt.y, state.size, state.hardness, BASE_COLOR, state.opacity);
  },
  onStrokeMove(ctx, from, to, state) {
    strokeAlong(from, to, Math.max(2, state.size * state.spacing), (x, y) =>
      stampSoft(ctx, x, y, state.size, state.hardness, BASE_COLOR, state.opacity));
  },
  onStrokeEnd() {},
};
