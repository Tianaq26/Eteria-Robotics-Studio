// ======================================================
// tour.js — Recorrido interactivo (spotlight): resalta elementos reales de
// la interfaz uno por uno con un recuadro + burbuja de texto. Motor genérico
// reutilizable para cualquier lista de pasos.
//
// Cada paso: { selector, title, text, placement }. Si un selector no resuelve
// en el momento (panel cerrado, etc.), el paso se salta solo sin romper el
// recorrido.
// ======================================================

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
          '<button class="tour-skip">Saltar</button>' +
          '<button class="tour-prev">Anterior</button>' +
          '<button class="tour-next">Siguiente</button>' +
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
  overlayEl.querySelector('.tour-tooltip-title').textContent = step.title;
  overlayEl.querySelector('.tour-tooltip-text').textContent = step.text;
  overlayEl.querySelector('.tour-tooltip-count').textContent = (stepIndex + 1) + ' / ' + steps.length;
  overlayEl.querySelector('.tour-prev').style.visibility = stepIndex === 0 ? 'hidden' : 'visible';
  overlayEl.querySelector('.tour-next').textContent = stepIndex === steps.length - 1 ? 'Finalizar' : 'Siguiente';
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
  { selector: '.menubar', title: 'Barra de menú', text: 'Desde aquí controlas qué ventanas se ven, la apariencia de la app y los tutoriales.', placement: 'bottom' },
  { selector: '#btnPaint', title: 'Pintar tu sumobot', text: 'Personaliza el diseño de la tapa de tu robot.', placement: 'bottom' },
  { selector: '#btnLearn', title: 'Modo Aprender', text: 'Cambia entre SumoLab libre y misiones guiadas paso a paso.', placement: 'bottom' },
  { selector: '.dock-zone[data-zone="left"] .dock-tabstrip', title: 'Editor y consola', text: 'Aquí escribes tu código (Python, pyblock, JS o C++) y ves lo que imprime tu programa.', placement: 'right' },
  { selector: '.dock-zone[data-zone="center"]', title: 'Arena 3D', text: 'Observa la simulación de combate en tiempo real.', placement: 'left' },
  { selector: '.dock-zone[data-zone="right"]', title: 'Panel de control', text: 'Ajusta bots rivales, velocidad y modo de juego.', placement: 'left' },
];

export const TOUR_PYBLOCK = [
  { selector: '#selLang', title: 'Elige pyblock', text: 'Abre este selector y cambia el lenguaje a pyblock para usar bloques en vez de escribir Python.', placement: 'bottom' },
  { selector: '#blocksEditor', title: 'Editor pyblock', text: 'Este es el espacio donde armas tu programa arrastrando bloques.', placement: 'right' },
  { selector: '#blocksEditor .blocklyToolboxDiv', title: 'Categorias', text: 'Las categorias agrupan bloques: Motores, LED y tiempo, Sensores, Control, Logica y Numeros.', placement: 'right' },
  { selector: '#blocksEditor .blocklyTreeRow', title: 'Abrir una categoria', text: 'Haz clic en una categoria para ver sus bloques disponibles.', placement: 'right' },
  { selector: '#blocksEditor .blocklyFlyout', title: 'Agregar un bloque', text: 'Arrastra un bloque desde esta bandeja hacia el area central y conectalo debajo de INICIO.', placement: 'right' },
  { selector: '#sbGuide', title: 'Guia de mision', text: 'En Aprender, esta guia te muestra bloques nuevos, para que sirven y los pasos de la mision. Puedes minimizarla.', placement: 'left' },
  { selector: '#sbPreviewBtn', title: 'Ver codigo', text: 'Este boton muestra el CircuitPython generado por tus bloques.', placement: 'top' },
];

export const TOUR_PRIMERA_MISION = [
  { selector: '#btnLearn', title: 'Entra a Aprender', text: 'Haz clic aquí para ver el mapa de misiones a pantalla completa.', placement: 'bottom' },
  { selector: '#mmBody', title: 'Elige una misión', text: 'Toca el primer círculo desbloqueado del mapa para empezar.', placement: 'top' },
  { selector: '#mpRunBtn', title: 'Prueba tu código', text: 'Cuando tengas tu misión abierta, este botón compila y corre tu robot.', placement: 'left' },
  { selector: '#roStar1', title: 'Resultado', text: 'Al terminar la prueba verás cuántas estrellas ganaste y el XP/gemas.', placement: 'top' },
];
