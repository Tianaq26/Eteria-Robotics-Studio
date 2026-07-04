// ======================================================
// canvasStore.js — Un canvas 2D + CanvasTexture por pieza pintable, con
// undo/redo independiente por pieza. Este es el estado "fuente de verdad":
// viewport3d.js y viewport2d.js solo leen/escriben estos mismos canvases,
// por eso ambas vistas quedan sincronizadas en vivo.
// ======================================================
import * as THREE from 'three';
import { PARTS, SKIN, BASE_COLOR } from './parts.js';

const UNDO_MAX = 24;

const store = new Map(); // partId -> { canvas, ctx, texture, undoStack, redoStack }

function makeEntry() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SKIN;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = BASE_COLOR;
  ctx.fillRect(0, 0, SKIN, SKIN);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  return { canvas, ctx, texture, undoStack: [], redoStack: [] };
}

export function initStore() {
  if (store.size) return;
  for (const p of PARTS) store.set(p.id, makeEntry());
}

export function getPart(id) {
  return store.get(id) || null;
}

export function getAllParts() {
  return [...store.entries()].map(([id, entry]) => ({ id, ...entry }));
}

export function markDirty(id) {
  const entry = store.get(id);
  if (entry) entry.texture.needsUpdate = true;
}

export function pushUndo(id) {
  const entry = store.get(id);
  if (!entry) return;
  try { entry.undoStack.push(entry.ctx.getImageData(0, 0, SKIN, SKIN)); } catch (_) { return; }
  if (entry.undoStack.length > UNDO_MAX) entry.undoStack.shift();
  entry.redoStack.length = 0;
}

export function undo(id) {
  const entry = store.get(id);
  if (!entry || !entry.undoStack.length) return;
  try { entry.redoStack.push(entry.ctx.getImageData(0, 0, SKIN, SKIN)); } catch (_) {}
  const img = entry.undoStack.pop();
  entry.ctx.putImageData(img, 0, 0);
  markDirty(id);
}

export function redo(id) {
  const entry = store.get(id);
  if (!entry || !entry.redoStack.length) return;
  try { entry.undoStack.push(entry.ctx.getImageData(0, 0, SKIN, SKIN)); } catch (_) {}
  const img = entry.redoStack.pop();
  entry.ctx.putImageData(img, 0, 0);
  markDirty(id);
}

export function clearPart(id) {
  const entry = store.get(id);
  if (!entry) return;
  pushUndo(id);
  entry.ctx.fillStyle = BASE_COLOR;
  entry.ctx.fillRect(0, 0, SKIN, SKIN);
  markDirty(id);
}

export function clearAll() {
  for (const id of store.keys()) clearPart(id);
}

/** Dibuja un dataURL guardado dentro del canvas de una pieza. */
export function loadPartDataURL(id, dataURL) {
  return new Promise((resolve) => {
    const entry = store.get(id);
    if (!entry || !dataURL) return resolve(false);
    const img = new Image();
    img.onload = () => {
      entry.ctx.clearRect(0, 0, SKIN, SKIN);
      entry.ctx.drawImage(img, 0, 0, SKIN, SKIN);
      markDirty(id);
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = dataURL;
  });
}

export function exportPartDataURL(id) {
  const entry = store.get(id);
  return entry ? entry.canvas.toDataURL('image/png') : null;
}

export function exportAllDataURLs() {
  const out = {};
  for (const id of store.keys()) out[id] = exportPartDataURL(id);
  return out;
}
