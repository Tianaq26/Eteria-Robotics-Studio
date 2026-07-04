// ======================================================
// dockManager.js — Motor de docking por zonas + pestañas (estilo Unity,
// simplificado). 4 zonas fijas: left, center, right, bottom. Cada zona
// contiene N paneles como pestañas; drag entre pestañas reordena, drag hacia
// otra zona reacopla. Sin división infinita — esa es la simplificación
// deliberada frente a un docking libre real.
//
// Los paneles nunca se destruyen: mount() corre UNA vez por panel (adopta un
// nodo existente o crea el stub), y mostrar/ocultar es solo display:none/flex
// sobre el nodo ya montado — así Monaco/Three.js/Blockly no pierden su estado
// al cambiar de pestaña o de zona.
// ======================================================

import { PANELS, getPanel } from './panels.js';

const LAYOUT_KEY = 'sumobot_layout_v1';
const ZONE_IDS = ['left', 'center', 'right', 'bottom'];

function defaultLayout() {
  const zones = { left: [], center: [], right: [], bottom: [] };
  for (const p of PANELS) zones[p.defaultZone].push(p.id);
  return {
    version: 1,
    zones: {
      left:   { panelIds: zones.left,   activeId: zones.left[0]   || null, size: 42 },
      center: { panelIds: zones.center, activeId: zones.center[0] || null, size: null },
      right:  { panelIds: zones.right,  activeId: zones.right[0]  || null, size: 250 },
      bottom: { panelIds: zones.bottom, activeId: zones.bottom[0] || null, size: 160, hidden: true },
    },
    hiddenPanels: [],
  };
}

function loadLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return defaultLayout();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !parsed.zones) return defaultLayout();
    return parsed;
  } catch (_) {
    return defaultLayout();
  }
}

let state = null;
let zoneEls = {};        // { left: { root, tabstrip, content } , ... }
let mountedIds = new Set();
let saveTimer = null;

function saveLayoutDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(state)); } catch (_) {}
  }, 300);
}

function findZoneOf(panelId) {
  for (const z of ZONE_IDS) if (state.zones[z].panelIds.includes(panelId)) return z;
  return null;
}

function ensureMounted(panelId) {
  if (mountedIds.has(panelId)) return;
  const def = getPanel(panelId);
  if (!def) return;
  const wrap = document.createElement('div');
  wrap.className = 'dock-panel-body';
  wrap.dataset.panelId = panelId;
  def.mount(wrap);
  const zone = findZoneOf(panelId) || def.defaultZone;
  zoneEls[zone].content.appendChild(wrap);
  mountedIds.add(panelId);
}

function panelBodyEl(panelId) {
  return document.querySelector('.dock-panel-body[data-panel-id="' + panelId + '"]');
}

// ── Render ───────────────────────────────────────────────────────────────

function renderZone(zoneId) {
  const z = state.zones[zoneId];
  const { tabstrip, content, root } = zoneEls[zoneId];

  if (zoneId === 'bottom') root.classList.toggle('dock-zone-hidden', !!z.hidden || z.panelIds.length === 0);

  tabstrip.innerHTML = '';
  for (const id of z.panelIds) {
    const def = getPanel(id);
    if (!def) continue;
    const tab = document.createElement('div');
    tab.className = 'dock-tab' + (id === z.activeId ? ' active' : '');
    tab.dataset.panelId = id;
    tab.dataset.zone = zoneId;
    tab.innerHTML =
      '<span class="dock-tab-icon">' + (def.icon || '') + '</span>' +
      '<span class="dock-tab-title">' + def.title + '</span>' +
      '<span class="dock-tab-close" title="Cerrar">✕</span>';
    tab.addEventListener('click', (ev) => {
      if (ev.target.closest('.dock-tab-close')) return;
      setActive(zoneId, id);
    });
    tab.querySelector('.dock-tab-close').addEventListener('click', (ev) => {
      ev.stopPropagation();
      hidePanel(id);
    });
    attachTabDrag(tab);
    tabstrip.appendChild(tab);
  }

  // Mostrar solo el panel activo de esta zona
  for (const id of z.panelIds) {
    ensureMounted(id);
    const body = panelBodyEl(id);
    if (body) body.classList.toggle('dock-panel-active', id === z.activeId);
  }

  content.querySelectorAll('.dock-empty').forEach((e) => e.remove());
  if (!z.panelIds.length) {
    const empty = document.createElement('div');
    empty.className = 'dock-empty';
    empty.textContent = 'Sin paneles — ábrelos desde el menú Ventanas.';
    content.appendChild(empty);
  }
}

function renderAll() {
  for (const z of ZONE_IDS) renderZone(z);
  applySizes();
}

function setActive(zoneId, panelId) {
  state.zones[zoneId].activeId = panelId;
  renderZone(zoneId);
  saveLayoutDebounced();
}

// ── Mostrar/ocultar paneles (usado por el menú Ventanas) ────────────────

export function isVisible(panelId) {
  return findZoneOf(panelId) !== null && !(findZoneOf(panelId) === 'bottom' && state.zones.bottom.hidden);
}

export function hidePanel(panelId) {
  const zoneId = findZoneOf(panelId);
  if (!zoneId) return;
  const z = state.zones[zoneId];
  z.panelIds = z.panelIds.filter((id) => id !== panelId);
  if (z.activeId === panelId) z.activeId = z.panelIds[0] || null;
  if (!state.hiddenPanels.includes(panelId)) state.hiddenPanels.push(panelId);
  if (zoneId === 'bottom' && !z.panelIds.length) z.hidden = true;
  renderZone(zoneId);
  saveLayoutDebounced();
}

export function showPanel(panelId) {
  const def = getPanel(panelId);
  if (!def) return;
  state.hiddenPanels = state.hiddenPanels.filter((id) => id !== panelId);
  let zoneId = findZoneOf(panelId);
  if (!zoneId) {
    zoneId = def.defaultZone;
    state.zones[zoneId].panelIds.push(panelId);
  }
  state.zones[zoneId].activeId = panelId;
  if (zoneId === 'bottom') state.zones.bottom.hidden = false;
  renderZone(zoneId);
  saveLayoutDebounced();
}

export function togglePanel(panelId) {
  if (isVisible(panelId)) hidePanel(panelId); else showPanel(panelId);
}

export function restoreDefaultLayout() {
  state = defaultLayout();
  renderAll();
  saveLayoutDebounced();
}

export function getPanelList() {
  return PANELS.map((p) => ({ id: p.id, title: p.title, icon: p.icon, visible: isVisible(p.id) }));
}

// ── Tamaños de zona (ancho left/right, alto bottom) ─────────────────────

function applySizes() {
  const left = zoneEls.left.root, right = zoneEls.right.root, bottom = zoneEls.bottom.root;
  left.style.width  = (state.zones.left.size  || 42) + '%';
  right.style.width = (state.zones.right.size || 250) + 'px';
  bottom.style.height = (state.zones.bottom.size || 160) + 'px';
}

function makeResizer(handleEl, onDrag, axis) {
  let startPos = 0, dragging = false;
  handleEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    startPos = axis === 'x' ? e.clientX : e.clientY;
    dragging = true;
    handleEl.classList.add('dragging');
    handleEl.setPointerCapture(e.pointerId);
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  });
  handleEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const pos = axis === 'x' ? e.clientX : e.clientY;
    onDrag(pos - startPos);
    startPos = pos;
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    handleEl.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    saveLayoutDebounced();
  };
  handleEl.addEventListener('pointerup', end);
  handleEl.addEventListener('pointercancel', end);
}

function wireResizers(root) {
  const dockRow = root.querySelector('.dock-row');
  const rLeft  = root.querySelector('[data-resizer="left"]');
  const rRight = root.querySelector('[data-resizer="right"]');
  const rBottom = root.querySelector('[data-resizer="bottom"]');

  makeResizer(rLeft, (dx) => {
    const totalW = dockRow.offsetWidth;
    const curPx = zoneEls.left.root.offsetWidth;
    const minCenter = 200, minRight = zoneEls.right.root.offsetWidth;
    const maxPx = totalW - minCenter - minRight - 10;
    const newPx = Math.max(220, Math.min(curPx + dx, maxPx));
    state.zones.left.size = (newPx / totalW) * 100;
    applySizes();
  }, 'x');

  makeResizer(rRight, (dx) => {
    const totalW = dockRow.offsetWidth;
    const curPx = zoneEls.right.root.offsetWidth;
    const maxPx = totalW - zoneEls.left.root.offsetWidth - 200 - 10;
    const newPx = Math.max(170, Math.min(curPx - dx, maxPx));
    state.zones.right.size = newPx;
    applySizes();
  }, 'x');

  makeResizer(rBottom, (dy) => {
    const curH = zoneEls.bottom.root.offsetHeight;
    const maxH = window.innerHeight * 0.7;
    const newH = Math.max(80, Math.min(curH - dy, maxH));
    state.zones.bottom.size = newH;
    applySizes();
  }, 'y');
}

// ── Arrastrar pestañas: reordenar dentro de la zona o mover a otra zona ──

let dragGhost = null;
let dragState = null; // { panelId, fromZone, startX, startY, moved }

function attachTabDrag(tabEl) {
  tabEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragState = {
      panelId: tabEl.dataset.panelId, fromZone: tabEl.dataset.zone,
      startX: e.clientX, startY: e.clientY, moved: false, pointerId: e.pointerId,
    };
    tabEl.setPointerCapture(e.pointerId);
  });
  tabEl.addEventListener('pointermove', (e) => onTabPointerMove(e, tabEl));
  tabEl.addEventListener('pointerup', (e) => onTabPointerUp(e, tabEl));
  tabEl.addEventListener('pointercancel', () => { dragState = null; removeGhost(); clearDropTargets(); });
}

function removeGhost() { if (dragGhost) { dragGhost.remove(); dragGhost = null; } }
function clearDropTargets() {
  document.querySelectorAll('.dock-zone.drop-target').forEach((z) => z.classList.remove('drop-target'));
}

function onTabPointerMove(e, tabEl) {
  if (!dragState || dragState.pointerId !== e.pointerId) return;
  const dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
  if (!dragState.moved && Math.hypot(dx, dy) < 6) return;
  dragState.moved = true;
  tabEl.classList.add('dragging');

  if (!dragGhost) {
    dragGhost = document.createElement('div');
    dragGhost.className = 'dock-drag-ghost';
    const def = getPanel(dragState.panelId);
    dragGhost.textContent = (def.icon || '') + ' ' + def.title;
    document.body.appendChild(dragGhost);
  }
  dragGhost.style.left = e.clientX + 'px';
  dragGhost.style.top  = e.clientY + 'px';

  clearDropTargets();
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const zoneEl = el && el.closest('.dock-zone');
  if (zoneEl) zoneEl.classList.add('drop-target');

  // Reordenar en vivo si seguimos sobre la misma tira de pestañas
  const stripEl = el && el.closest('.dock-tabstrip');
  if (stripEl && stripEl === tabEl.parentElement) {
    const siblings = [...stripEl.querySelectorAll('.dock-tab')].filter((t) => t !== tabEl);
    for (const sib of siblings) {
      const r = sib.getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) { stripEl.insertBefore(tabEl, sib); break; }
      if (sib === siblings[siblings.length - 1]) stripEl.appendChild(tabEl);
    }
  }
}

function onTabPointerUp(e, tabEl) {
  if (!dragState || dragState.pointerId !== e.pointerId) { dragState = null; return; }
  const { panelId, fromZone, moved } = dragState;
  tabEl.classList.remove('dragging');
  removeGhost();
  clearDropTargets();

  if (!moved) { dragState = null; return; }

  const el = document.elementFromPoint(e.clientX, e.clientY);
  const zoneEl = el && el.closest('.dock-zone');
  const toZone = zoneEl ? zoneEl.dataset.zone : null;

  if (toZone && toZone !== fromZone) {
    // Mover el panel a otra zona
    state.zones[fromZone].panelIds = state.zones[fromZone].panelIds.filter((id) => id !== panelId);
    if (state.zones[fromZone].activeId === panelId) {
      state.zones[fromZone].activeId = state.zones[fromZone].panelIds[0] || null;
    }
    state.zones[toZone].panelIds.push(panelId);
    state.zones[toZone].activeId = panelId;
    if (toZone === 'bottom') state.zones.bottom.hidden = false;
    renderZone(fromZone);
    renderZone(toZone);
  } else {
    // Se quedó en la misma zona: persistir el nuevo orden reflejado en el DOM
    const strip = zoneEls[fromZone].tabstrip;
    state.zones[fromZone].panelIds = [...strip.querySelectorAll('.dock-tab')].map((t) => t.dataset.panelId);
    renderZone(fromZone);
  }
  saveLayoutDebounced();
  dragState = null;
}

// ── Arranque ─────────────────────────────────────────────────────────────

export function initDock(rootEl) {
  state = loadLayout();
  zoneEls = {};
  for (const z of ZONE_IDS) {
    const root = rootEl.querySelector('[data-zone="' + z + '"]');
    zoneEls[z] = {
      root,
      tabstrip: root.querySelector('.dock-tabstrip'),
      content: root.querySelector('.dock-content'),
    };
  }
  renderAll();
  wireResizers(rootEl);
  window.addEventListener('resize', applySizes);
}
