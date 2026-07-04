import { hexToRgb } from './common.js';

const FLOOD_TOLERANCE = 30; // diferencia máxima por canal (0-255)

/** Relleno por inundación: pinta la región contigua de color similar al del clic. */
function floodFill(ctx, size, px, py, fillHex) {
  const w = size, h = size;
  const x0 = Math.max(0, Math.min(w - 1, Math.round(px)));
  const y0 = Math.max(0, Math.min(h - 1, Math.round(py)));
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const idx = (x, y) => (y * w + x) * 4;
  const { r: fr, g: fg, b: fb } = hexToRgb(fillHex);
  const startI = idx(x0, y0);
  const tr = data[startI], tg = data[startI + 1], tb = data[startI + 2], ta = data[startI + 3];
  if (Math.abs(tr - fr) <= 2 && Math.abs(tg - fg) <= 2 && Math.abs(tb - fb) <= 2 && ta === 255) return;
  const matches = (i) =>
    Math.abs(data[i] - tr) <= FLOOD_TOLERANCE && Math.abs(data[i + 1] - tg) <= FLOOD_TOLERANCE &&
    Math.abs(data[i + 2] - tb) <= FLOOD_TOLERANCE && Math.abs(data[i + 3] - ta) <= FLOOD_TOLERANCE;
  const visited = new Uint8Array(w * h);
  const stack = [x0, y0];
  visited[y0 * w + x0] = 1;
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    const i = idx(x, y);
    data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; data[i + 3] = 255;
    if (x + 1 < w && !visited[y * w + x + 1] && matches(idx(x + 1, y))) { visited[y * w + x + 1] = 1; stack.push(x + 1, y); }
    if (x - 1 >= 0 && !visited[y * w + x - 1] && matches(idx(x - 1, y))) { visited[y * w + x - 1] = 1; stack.push(x - 1, y); }
    if (y + 1 < h && !visited[(y + 1) * w + x] && matches(idx(x, y + 1))) { visited[(y + 1) * w + x] = 1; stack.push(x, y + 1); }
    if (y - 1 >= 0 && !visited[(y - 1) * w + x] && matches(idx(x, y - 1))) { visited[(y - 1) * w + x] = 1; stack.push(x, y - 1); }
  }
  ctx.putImageData(img, 0, 0);
}

export const bucket = {
  id: 'bucket',
  label: 'Balde',
  icon: '🪣',
  usesSizeGroup: false,

  onStrokeStart(ctx, pt, state) {
    floodFill(ctx, state.skinSize, pt.x, pt.y, state.color);
  },
  onStrokeMove() {},
  onStrokeEnd() {},
};
