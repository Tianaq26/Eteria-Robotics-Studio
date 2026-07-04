// ======================================================
// index.js — Orquestador del editor de pintura. Expone la misma API pública
// que el paint.js anterior (ensurePainter/openPainter/closePainter) para no
// romper la integración con main.js, pero por dentro conecta los módulos
// nuevos: canvasStore, brushes, mirrorPaint, viewport3d/2d, colorPicker,
// designManager.
// ======================================================
import { PARTS, PART_IDS } from './parts.js';
import { initStore, getAllParts, undo, redo, clearPart } from './canvasStore.js';
import { state, onStateChange, setTool, setSize, setHardness, setOpacity, setSpacing, setMode } from './paintState.js';
import { getLastTouchedPart } from './strokeEngine.js';
import { isMirrorEnabled, toggleMirror } from './mirrorPaint.js';
import {
  initViewport3d, startViewport3d, stopViewport3d, resizeViewport3d, refreshCursor,
} from './viewport3d.js';
import { initViewport2d, startViewport2d, stopViewport2d, resizeViewport2d, resetViewport2d } from './viewport2d.js';
import { initColorPicker } from './colorPicker.js';
import * as designManager from './designManager.js';

const $ = (id) => document.getElementById(id);

let inited = false;
let onApplyCb = null;

function buildToolRail() {
  const buttons = {
    peBrush: 'brush', peEraser: 'eraser', peBucket: 'bucket',
    peShapeRect: 'shapeRect', peShapeCircle: 'shapeCircle',
    peBlur: 'blur', peSmudge: 'smudge', peEyedrop: 'eyedrop',
  };
  for (const [id, toolId] of Object.entries(buttons)) {
    const el = $(id);
    if (el) el.onclick = () => setTool(toolId);
  }
  const mirrorBtn = $('peMirror');
  if (mirrorBtn) mirrorBtn.onclick = () => { toggleMirror(); mirrorBtn.classList.toggle('active', isMirrorEnabled()); };
  const clearBtn = $('peClear');
  if (clearBtn) clearBtn.onclick = () => clearPart(getLastTouchedPart());
  const undoBtn = $('peUndo'); if (undoBtn) undoBtn.onclick = () => undo(getLastTouchedPart());
  const redoBtn = $('peRedo'); if (redoBtn) redoBtn.onclick = () => redo(getLastTouchedPart());

  const reflectTool = () => {
    for (const id of Object.keys(buttons)) {
      const el = $(id);
      if (el) el.classList.toggle('active', buttons[id] === state.tool);
    }
  };
  onStateChange(reflectTool);
  reflectTool();
}

function buildSliders() {
  const bind = (id, valId, get, set, toPct) => {
    const el = $(id), lbl = $(valId);
    if (!el) return;
    el.value = toPct ? Math.round(get() * 100) : get();
    el.oninput = () => { set(toPct ? +el.value / 100 : +el.value); };
    onStateChange(() => {
      if (lbl) lbl.textContent = toPct ? Math.round(get() * 100) : get();
    });
    if (lbl) lbl.textContent = toPct ? Math.round(get() * 100) : get();
  };
  bind('peSize', 'peSizeVal', () => state.size, setSize, false);
  bind('peHardness', 'peHardnessVal', () => state.hardness, setHardness, true);
  bind('peOpacity', 'peOpacityVal', () => state.opacity, setOpacity, true);
  bind('peSpacing', 'peSpacingVal', () => state.spacing, setSpacing, true);
  onStateChange(() => refreshCursor());
}

function buildPartsList() {
  const wrap = $('pePartsList');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const p of PARTS) {
    const b = document.createElement('button');
    b.className = 'pe-part-btn';
    b.textContent = p.label;
    b.onclick = () => {
      setMode('2d');
      document.dispatchEvent(new CustomEvent('pe-focus-part', { detail: p.id }));
    };
    wrap.appendChild(b);
  }
}

function setViewMode(mode) {
  setMode(mode);
  const v3 = $('peViewport3d'), v2 = $('peViewport2d');
  const b3 = $('peView3d'), b2 = $('peView2d');
  if (mode === '3d') {
    v3.style.display = ''; v2.style.display = 'none';
    b3 && b3.classList.add('active'); b2 && b2.classList.remove('active');
    stopViewport2d(); resizeViewport3d(); startViewport3d();
  } else {
    v3.style.display = 'none'; v2.style.display = '';
    b3 && b3.classList.remove('active'); b2 && b2.classList.add('active');
    stopViewport3d(); resetViewport2d(); resizeViewport2d(); startViewport2d();
  }
  const hint = $('peHint');
  if (hint) hint.textContent = mode === '3d'
    ? 'Clic izquierdo: pintar · Clic derecho: girar · Rueda: zoom · Botón central: pan'
    : 'Clic izquierdo: pintar · Rueda: zoom · Botón central: pan';
}

function buildFileMenu() {
  const bind = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  bind('peNew', async () => { if (window.confirm('¿Empezar un diseño nuevo? Se perderán los cambios sin guardar.')) await designManager.newDesign(); });
  bind('peOpen', () => designManager.openDesign());
  bind('peSave', () => designManager.saveDesign());
  bind('peSaveAs', () => designManager.saveDesignAs());
  bind('peExport', () => designManager.exportDesign());
  bind('peImport', () => designManager.importDesign());
  bind('peApply', () => {
    designManager.autosave();
    if (onApplyCb) {
      const map = {};
      for (const p of getAllParts()) map[p.id] = p.canvas;
      onApplyCb(map);
    }
  });
  bind('peClose', () => closePainter());
}

function init() {
  initStore();
  buildToolRail();
  buildSliders();
  buildPartsList();
  buildFileMenu();

  const cp = $('peColorPicker');
  if (cp) initColorPicker(cp);

  initViewport3d($('peViewport3d'));
  initViewport2d($('peViewport2d'));

  const b3 = $('peView3d'), b2 = $('peView2d');
  if (b3) b3.onclick = () => setViewMode('3d');
  if (b2) b2.onclick = () => setViewMode('2d');

  window.addEventListener('resize', () => {
    if (state.mode === '3d') resizeViewport3d(); else resizeViewport2d();
  });
}

export function ensurePainter(opts) {
  onApplyCb = (opts && opts.onApply) || null;
  if (inited) return;
  inited = true;
  init();
  designManager.restoreAutosave();
}

export function openPainter() {
  const ov = $('paintEditor');
  if (ov) ov.classList.add('open');
  setViewMode(state.mode || '3d');
}

export function closePainter() {
  const ov = $('paintEditor');
  if (ov) ov.classList.remove('open');
  stopViewport3d();
  stopViewport2d();
}
