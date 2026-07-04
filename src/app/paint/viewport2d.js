// ======================================================
// viewport2d.js — Vista 2D "desplegada" (estilo UV layout). Un canvas 2D
// normal (no three.js) dibuja los 5 canvases de canvasStore.js recortados
// según layout2d.js. Pintar aquí transforma el punto de pantalla al pixel
// del canvas de la pieza tocada e invoca el mismo strokeEngine.js que usa
// el visor 3D, así ambas vistas quedan sincronizadas en vivo.
// ======================================================
import { SKIN, getPartDef } from './parts.js';
import { getPart } from './canvasStore.js';
import { LAYOUT, LAYOUT_W, LAYOUT_H } from './layout2d.js';
import { strokeStart, strokeMove, strokeEnd } from './strokeEngine.js';
import { state as paintState } from './paintState.js';

let canvas, ctx, container;
let rafId = null;
let view = { x: 0, y: 0, scale: 1 }; // pan/zoom del lienzo (screen = layout*scale + offset)
let painting = false;
let panning = false;
let panStart = null;
let hoverPt = null; // { screenX, screenY } último punto conocido para el cursor

function fitView() {
  const w = container.clientWidth || 600, h = container.clientHeight || 480;
  const scale = Math.min(w / (LAYOUT_W + 60), h / (LAYOUT_H + 60));
  view.scale = scale;
  view.x = (w - LAYOUT_W * scale) / 2;
  view.y = (h - LAYOUT_H * scale) / 2;
}

function screenToLayout(sx, sy) {
  const rect = canvas.getBoundingClientRect();
  return { x: (sx - rect.left - view.x) / view.scale, y: (sy - rect.top - view.y) / view.scale };
}

/** Punto en layout-space -> { partId, x, y } en pixeles del canvas de esa pieza, o null.
 * Cada tile es un cuadrado 1:1 con el canvas real (sin recorte ni deformar),
 * así que el mapeo es una simple regla de tres dentro del box. */
function hitTest(lx, ly) {
  for (const entry of LAYOUT) {
    const { box } = entry;
    const u = (lx - box.x) / box.w, v = (ly - box.y) / box.h;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    return { partId: entry.partId, x: u * SKIN, y: v * SKIN };
  }
  return null;
}

function draw() {
  const w = canvas.width, h = canvas.height;
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w / dpr, h / dpr);
  ctx.fillStyle = '#0c0e14';
  ctx.fillRect(0, 0, w / dpr, h / dpr);

  ctx.translate(view.x, view.y);
  ctx.scale(view.scale, view.scale);

  for (const entry of LAYOUT) {
    const part = getPart(entry.partId);
    if (!part) continue;
    const { box } = entry;
    // Blit 1:1 sin recortar ni deformar (box siempre cuadrado, igual que el
    // canvas real) — lo que se ve aquí es exactamente la textura tal cual.
    ctx.drawImage(part.canvas, box.x, box.y, box.w, box.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1 / view.scale;
    ctx.strokeRect(box.x, box.y, box.w, box.h);

    const def = getPartDef(entry.partId);
    if (def) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = `${14 / view.scale}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(def.label, box.x + box.w / 2, box.y - 6 / view.scale);
    }
  }

  if (hoverPt && !panning && !['bucket', 'eyedrop', 'shapeRect', 'shapeCircle'].includes(paintState.tool)) {
    const entry = LAYOUT.find((l) => l.partId === hoverPt.partId);
    const boxScale = entry ? entry.box.w / SKIN : 1; // tamaño del pincel está en pixeles del canvas (0..1024), convertir a espacio de layout
    const r = Math.max(1, (paintState.size / 2) * boxScale);
    ctx.beginPath();
    ctx.arc(hoverPt.x, hoverPt.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = paintState.tool === 'eraser' ? '#ffffff' : paintState.color;
    ctx.lineWidth = 2 / view.scale;
    ctx.stroke();
  }

  ctx.restore();
}

function loop() {
  rafId = requestAnimationFrame(loop);
  draw();
}

function resize() {
  if (!canvas || !container) return;
  const w = container.clientWidth || 600, h = container.clientHeight || 480;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
}

function onPointerDown(ev) {
  if (ev.button === 1) { // botón central = pan
    panning = true; panStart = { x: ev.clientX - view.x, y: ev.clientY - view.y };
    ev.preventDefault();
    return;
  }
  if (ev.button !== 0) return;
  const l = screenToLayout(ev.clientX, ev.clientY);
  const hit = hitTest(l.x, l.y);
  if (!hit) return;
  painting = true;
  hoverPt = { x: l.x, y: l.y, partId: hit.partId }; // espacio de layout (para dibujar el cursor), no confundir con hit.x/y (pixel del canvas de la pieza)
  strokeStart(hit.partId, { x: hit.x, y: hit.y });
  canvas.setPointerCapture(ev.pointerId);
}

function onPointerMove(ev) {
  if (panning && panStart) {
    view.x = ev.clientX - panStart.x;
    view.y = ev.clientY - panStart.y;
    return;
  }
  const l = screenToLayout(ev.clientX, ev.clientY);
  const hit = hitTest(l.x, l.y);
  hoverPt = hit ? { x: l.x, y: l.y, partId: hit.partId } : null;
  if (!painting || !hit) return;
  strokeMove(hit.partId, { x: hit.x, y: hit.y });
}

function onPointerUp(ev) {
  if (panning) { panning = false; panStart = null; return; }
  if (!painting) return;
  painting = false;
  strokeEnd();
  try { canvas.releasePointerCapture(ev.pointerId); } catch (_) {}
}

function onWheel(ev) {
  ev.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
  const before = { x: (mx - view.x) / view.scale, y: (my - view.y) / view.scale };
  const factor = Math.exp(-ev.deltaY * 0.001);
  view.scale = Math.max(0.2, Math.min(6, view.scale * factor));
  view.x = mx - before.x * view.scale;
  view.y = my - before.y * view.scale;
}

export function initViewport2d(el) {
  container = el;
  canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'crosshair';
  container.appendChild(canvas);
  ctx = canvas.getContext('2d');

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pe-focus-part', onFocusPart);

  resize();
  fitView();
}

function onFocusPart(ev) {
  const entry = LAYOUT.find((l) => l.partId === ev.detail);
  if (!entry || !container) return;
  const w = container.clientWidth || 600, h = container.clientHeight || 480;
  const { box } = entry;
  const scale = Math.min(w / (box.w * 1.6), h / (box.h * 1.6));
  view.scale = scale;
  view.x = w / 2 - (box.x + box.w / 2) * scale;
  view.y = h / 2 - (box.y + box.h / 2) * scale;
}

export function startViewport2d() {
  requestAnimationFrame(() => { resize(); loop(); });
}
export function stopViewport2d() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}
export function resizeViewport2d() { resize(); }
export function resetViewport2d() { fitView(); }
