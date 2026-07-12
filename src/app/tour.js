// ======================================================
// tour.js — Recorrido interactivo (spotlight): resalta elementos reales de
// la interfaz uno por uno con un recuadro + burbuja de texto. Motor genérico
// reutilizable para cualquier lista de pasos.
//
// Cada paso: { selector, title, text, placement }. Si un selector no resuelve
// en el momento (panel cerrado, etc.), el paso se salta solo sin romper el
// recorrido.
// ======================================================

import { t } from './i18n.js';

let overlayEl = null;
let steps = [];
let stepIndex = 0;
let stepCleanup = null;

function buildOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement('div');
  overlayEl.id = 'tourOverlay';
  overlayEl.innerHTML =
    '<div class="tour-mask tour-mask-top"></div>' +
    '<div class="tour-mask tour-mask-bottom"></div>' +
    '<div class="tour-mask tour-mask-left"></div>' +
    '<div class="tour-mask tour-mask-right"></div>' +
    '<div class="tour-highlight"></div>' +
    '<div class="tour-tooltip">' +
      '<div class="tour-tooltip-title"></div>' +
      '<div class="tour-tooltip-text"></div>' +
      '<div class="tour-tooltip-foot">' +
        '<span class="tour-tooltip-count"></span>' +
        '<div class="tour-tooltip-actions">' +
          '<button class="tour-skip">' + t('tour.skip') + '</button>' +
          '<button class="tour-prev">' + t('tour.prev') + '</button>' +
          '<button class="tour-next">' + t('tour.next') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlayEl);
  overlayEl.querySelector('.tour-skip').onclick = endTour;
  overlayEl.querySelector('.tour-prev').onclick = () => goTo(stepIndex - 1);
  overlayEl.querySelector('.tour-next').onclick = () => goTo(stepIndex + 1);
  return overlayEl;
}

function positionMasks(rect) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const pad = 6;
  const top = Math.max(0, rect.top - pad), bottom = Math.min(vh, rect.bottom + pad);
  const left = Math.max(0, rect.left - pad), right = Math.min(vw, rect.right + pad);
  const set = (el, x1, y1, x2, y2) => {
    el.style.left = x1 + 'px'; el.style.top = y1 + 'px';
    el.style.width = Math.max(0, x2 - x1) + 'px'; el.style.height = Math.max(0, y2 - y1) + 'px';
  };
  set(overlayEl.querySelector('.tour-mask-top'),    0,     0,   vw,    top);
  set(overlayEl.querySelector('.tour-mask-bottom'), 0,     bottom, vw, vh);
  set(overlayEl.querySelector('.tour-mask-left'),   0,     top,  left, bottom);
  set(overlayEl.querySelector('.tour-mask-right'),  right, top,  vw,   bottom);

  const hl = overlayEl.querySelector('.tour-highlight');
  hl.style.left = left + 'px'; hl.style.top = top + 'px';
  hl.style.width = (right - left) + 'px'; hl.style.height = (bottom - top) + 'px';
}

function positionTooltip(rect, placement) {
  const tip = overlayEl.querySelector('.tour-tooltip');
  tip.style.left = tip.style.top = tip.style.right = tip.style.bottom = 'auto';
  const gap = 14;
  const tw = tip.offsetWidth || 280, th = tip.offsetHeight || 120;
  let placements = [placement, 'bottom', 'top', 'right', 'left'];
  for (const p of placements) {
    let x, y;
    if (p === 'bottom') { x = rect.left; y = rect.bottom + gap; }
    else if (p === 'top') { x = rect.left; y = rect.top - th - gap; }
    else if (p === 'right') { x = rect.right + gap; y = rect.top; }
    else { x = rect.left - tw - gap; y = rect.top; }
    x = Math.max(10, Math.min(x, window.innerWidth - tw - 10));
    y = Math.max(10, Math.min(y, window.innerHeight - th - 10));
    // Si esta colocación cabe razonablemente en la ventana, úsala.
    if (y >= 0 && y + th <= window.innerHeight) { tip.style.left = x + 'px'; tip.style.top = y + 'px'; return; }
  }
  tip.style.left = '50%'; tip.style.top = '50%'; tip.style.transform = 'translate(-50%,-50%)';
}

function renderStep() {
  if (stepCleanup) { stepCleanup(); stepCleanup = null; }
  const step = steps[stepIndex];
  if (!step) { endTour(); return; }
  const target = document.querySelector(step.selector);
  if (!target) { goTo(stepIndex + 1); return; } // el elemento no existe ahora mismo: saltar
  const rect = target.getBoundingClientRect();
  positionMasks(rect);
  overlayEl.querySelector('.tour-tooltip-title').textContent = step.titleKey ? t(step.titleKey) : step.title;
  overlayEl.querySelector('.tour-tooltip-text').textContent = step.textKey ? t(step.textKey) : step.text;
  overlayEl.querySelector('.tour-tooltip-count').textContent = (stepIndex + 1) + ' / ' + steps.length;
  overlayEl.querySelector('.tour-prev').style.visibility = stepIndex === 0 ? 'hidden' : 'visible';
  overlayEl.querySelector('.tour-next').textContent = stepIndex === steps.length - 1 ? t('tour.finish') : t('tour.next');
  positionTooltip(rect, step.placement || 'bottom');
  target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const advanceOn = step.advanceOn || (step.selector === '#btnLearn' || step.selector === '#mmBody' ? 'click' : null);
  if (advanceOn) {
    const handler = () => {
      const delay = step.advanceDelay == null ? (step.selector === '#btnLearn' || step.selector === '#mmBody' ? 900 : 250) : step.advanceDelay;
      setTimeout(() => goTo(stepIndex + 1), delay);
    };
    target.addEventListener(advanceOn, handler, { once: true });
    stepCleanup = () => target.removeEventListener(advanceOn, handler);
  }
}

function goTo(i) {
  if (i < 0) return;
  if (i >= steps.length) { endTour(); return; }
  stepIndex = i;
  renderStep();
}

function onKeydown(e) {
  if (e.key === 'Escape') endTour();
  else if (e.key === 'ArrowRight') goTo(stepIndex + 1);
  else if (e.key === 'ArrowLeft') goTo(stepIndex - 1);
}

function onResize() { if (overlayEl && overlayEl.classList.contains('show')) renderStep(); }

export function startTour(tourSteps) {
  if (!tourSteps || !tourSteps.length) return;
  buildOverlay();
  steps = tourSteps;
  stepIndex = 0;
  overlayEl.classList.add('show');
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', onResize);
  renderStep();
}

export function endTour() {
  if (!overlayEl) return;
  if (stepCleanup) { stepCleanup(); stepCleanup = null; }
  overlayEl.classList.remove('show');
  document.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', onResize);
}

// ── Contenido de los tutoriales v1 ──────────────────────────────────────

export const TOUR_INTERFAZ = [
  { selector: '.menubar', titleKey: 'tour.interfaz.1.title', textKey: 'tour.interfaz.1.text', placement: 'bottom' },
  { selector: '#btnPaint', titleKey: 'tour.interfaz.2.title', textKey: 'tour.interfaz.2.text', placement: 'bottom' },
  { selector: '#btnLearn', titleKey: 'tour.interfaz.3.title', textKey: 'tour.interfaz.3.text', placement: 'bottom' },
  { selector: '.dock-zone[data-zone="left"] .dock-tabstrip', titleKey: 'tour.interfaz.4.title', textKey: 'tour.interfaz.4.text', placement: 'right' },
  { selector: '.dock-zone[data-zone="center"]', titleKey: 'tour.interfaz.5.title', textKey: 'tour.interfaz.5.text', placement: 'left' },
  { selector: '.dock-zone[data-zone="right"]', titleKey: 'tour.interfaz.6.title', textKey: 'tour.interfaz.6.text', placement: 'left' },
];

export const TOUR_PYBLOCK = [
  { selector: '#selLang', titleKey: 'tour.pyblock.1.title', textKey: 'tour.pyblock.1.text', placement: 'bottom' },
  { selector: '#blocksEditor', titleKey: 'tour.pyblock.2.title', textKey: 'tour.pyblock.2.text', placement: 'right' },
  { selector: '#blocksEditor .blocklyToolboxDiv', titleKey: 'tour.pyblock.3.title', textKey: 'tour.pyblock.3.text', placement: 'right' },
  { selector: '#blocksEditor .blocklyTreeRow', titleKey: 'tour.pyblock.4.title', textKey: 'tour.pyblock.4.text', placement: 'right' },
  { selector: '#blocksEditor .blocklyFlyout', titleKey: 'tour.pyblock.5.title', textKey: 'tour.pyblock.5.text', placement: 'right' },
  { selector: '#sbGuide', titleKey: 'tour.pyblock.6.title', textKey: 'tour.pyblock.6.text', placement: 'left' },
  { selector: '#sbPreviewBtn', titleKey: 'tour.pyblock.7.title', textKey: 'tour.pyblock.7.text', placement: 'top' },
];

export const TOUR_PINTAR_BOT = [
  { selector: '#paintEditor .pe-title', titleKey: 'tour.paint.1.title', textKey: 'tour.paint.1.text', placement: 'bottom' },
  { selector: '#peView3d', titleKey: 'tour.paint.2.title', textKey: 'tour.paint.2.text', placement: 'bottom' },
  { selector: '#peViewport3d', titleKey: 'tour.paint.3.title', textKey: 'tour.paint.3.text', placement: 'left' },
  { selector: '#peRail', titleKey: 'tour.paint.4.title', textKey: 'tour.paint.4.text', placement: 'right' },
  { selector: '#peBrush', titleKey: 'tour.paint.5.title', textKey: 'tour.paint.5.text', placement: 'right' },
  { selector: '#peColorPicker', titleKey: 'tour.paint.6.title', textKey: 'tour.paint.6.text', placement: 'left' },
  { selector: '#peSize', titleKey: 'tour.paint.7.title', textKey: 'tour.paint.7.text', placement: 'left' },
  { selector: '#peMirror', titleKey: 'tour.paint.8.title', textKey: 'tour.paint.8.text', placement: 'right' },
  { selector: '#peView2d', titleKey: 'tour.paint.9.title', textKey: 'tour.paint.9.text', placement: 'bottom' },
  { selector: '#pePartsList', titleKey: 'tour.paint.10.title', textKey: 'tour.paint.10.text', placement: 'left' },
  { selector: '#peApply', titleKey: 'tour.paint.11.title', textKey: 'tour.paint.11.text', placement: 'bottom' },
  { selector: '#peClose', titleKey: 'tour.paint.12.title', textKey: 'tour.paint.12.text', placement: 'left' },
];

export const TOUR_PRIMERA_MISION = [
  { selector: '#btnLearn', titleKey: 'tour.primera.1.title', textKey: 'tour.primera.1.text', placement: 'bottom' },
  { selector: '#mmBody', titleKey: 'tour.primera.2.title', textKey: 'tour.primera.2.text', placement: 'top' },
  { selector: '#mpRunBtn', titleKey: 'tour.primera.3.title', textKey: 'tour.primera.3.text', placement: 'left' },
  { selector: '#roStar1', titleKey: 'tour.primera.4.title', textKey: 'tour.primera.4.text', placement: 'top' },
];
