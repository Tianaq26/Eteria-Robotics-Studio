import { strokeAlong } from './common.js';

/** Box blur simple (separable, N pasadas) sobre un ImageData cuadrado. */
function boxBlur(imgData, w, h, radius, passes) {
  const src = imgData.data;
  let cur = src;
  for (let p = 0; p < passes; p++) {
    const out = new Uint8ClampedArray(cur.length);
    // horizontal
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = x + k;
          if (xx < 0 || xx >= w) continue;
          const i = (y * w + xx) * 4;
          r += cur[i]; g += cur[i + 1]; b += cur[i + 2]; a += cur[i + 3]; n++;
        }
        const o = (y * w + x) * 4;
        out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
      }
    }
    // vertical
    const out2 = new Uint8ClampedArray(cur.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let k = -radius; k <= radius; k++) {
          const yy = y + k;
          if (yy < 0 || yy >= h) continue;
          const i = (yy * w + x) * 4;
          r += out[i]; g += out[i + 1]; b += out[i + 2]; a += out[i + 3]; n++;
        }
        const o = (y * w + x) * 4;
        out2[o] = r / n; out2[o + 1] = g / n; out2[o + 2] = b / n; out2[o + 3] = a / n;
      }
    }
    cur = out2;
  }
  return new ImageData(cur, w, h);
}

function blurAt(ctx, cx, cy, size, hardness, skinSize) {
  const r = Math.max(3, Math.round(size / 2));
  const x0 = Math.max(0, Math.round(cx - r)), y0 = Math.max(0, Math.round(cy - r));
  const x1 = Math.min(skinSize, Math.round(cx + r)), y1 = Math.min(skinSize, Math.round(cy + r));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const original = ctx.getImageData(x0, y0, w, h);
  const blurRadius = Math.max(1, Math.round(size / 16));
  const blurred = boxBlur(original, w, h, blurRadius, 2);

  // Mezcla con caída circular suave (dureza controla el radio del núcleo sólido).
  const out = new ImageData(w, h);
  const inner = Math.max(0, Math.min(0.95, hardness)) * r;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x0 + x) - cx, (y0 + y) - cy);
      let t = d <= inner ? 1 : d >= r ? 0 : 1 - (d - inner) / Math.max(1, r - inner);
      const i = (y * w + x) * 4;
      out.data[i]     = blurred.data[i]     * t + original.data[i]     * (1 - t);
      out.data[i + 1] = blurred.data[i + 1] * t + original.data[i + 1] * (1 - t);
      out.data[i + 2] = blurred.data[i + 2] * t + original.data[i + 2] * (1 - t);
      out.data[i + 3] = blurred.data[i + 3] * t + original.data[i + 3] * (1 - t);
    }
  }
  ctx.putImageData(out, x0, y0);
}

export const blur = {
  id: 'blur',
  label: 'Difuminar',
  icon: '💫',
  usesSizeGroup: true,

  onStrokeStart(ctx, pt, state) {
    blurAt(ctx, pt.x, pt.y, state.size, state.hardness, state.skinSize);
  },
  onStrokeMove(ctx, from, to, state) {
    strokeAlong(from, to, Math.max(4, state.size * Math.max(0.35, state.spacing)), (x, y) =>
      blurAt(ctx, x, y, state.size, state.hardness, state.skinSize));
  },
  onStrokeEnd() {},
};
