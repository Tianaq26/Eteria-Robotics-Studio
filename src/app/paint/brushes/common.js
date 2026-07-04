// ======================================================
// common.js — utilidades compartidas por las herramientas de pintura:
// estampado circular con dureza (caída radial) y interpolación por
// espaciado a lo largo de un trazo (para no dejar huecos al arrastrar).
// ======================================================

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Estampa un punto circular con caída radial (dureza 1 = borde duro, 0 = muy suave). */
export function stampSoft(ctx, x, y, size, hardness, color, opacity) {
  const r = Math.max(0.5, size / 2);
  ctx.save();
  ctx.globalAlpha = opacity;
  if (hardness >= 0.98) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const innerStop = Math.max(0, Math.min(0.95, hardness));
    const grad = ctx.createRadialGradient(x, y, r * innerStop, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color + '00'); // transparente en el borde (color debe ser hex #rrggbb)
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Recorre el segmento from→to estampando cada `spacingPx` para no dejar huecos. */
export function strokeAlong(from, to, spacingPx, stampFn) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.max(2, spacingPx);
  const steps = Math.max(1, Math.ceil(dist / step));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    stampFn(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
  }
}
