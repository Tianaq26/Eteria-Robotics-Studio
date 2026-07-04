// ======================================================
// menubar.js — Barra de menú superior: Ventanas / Configuración / Tutoriales.
// Dropdowns simples (click para abrir, click afuera o Escape para cerrar).
// ======================================================

import { getPanelList, togglePanel, restoreDefaultLayout } from './dockManager.js';
import { getSettings, setTheme, setAccent, setSfxMuted } from '../settings.js';
import { startTour, TOUR_INTERFAZ, TOUR_PRIMERA_MISION, TOUR_PYBLOCK } from '../tour.js';

const ACCENTS = [
  { id: 'azul',    label: 'Azul',    color: '#3c82f0' },
  { id: 'violeta', label: 'Violeta', color: '#a855f7' },
  { id: 'verde',   label: 'Verde',   color: '#22c55e' },
];

let openMenu = null;
let _fileCtx = null; // { project, notify } — inyectado por main.js en initMenubar()

function closeAll() {
  document.querySelectorAll('.menubar-dropdown').forEach((d) => { d.hidden = true; });
  document.querySelectorAll('.menubar-btn').forEach((b) => b.classList.remove('open'));
  openMenu = null;
}

function toggleMenu(name, btn, dropdown, onOpen) {
  if (openMenu === name) { closeAll(); return; }
  closeAll();
  if (onOpen) onOpen(dropdown);
  dropdown.hidden = false;
  btn.classList.add('open');
  openMenu = name;
}

function renderArchivo(dropdown) {
  const p = _fileCtx && _fileCtx.project;
  if (!p) { dropdown.innerHTML = ''; return; }
  const shortcut = p.supportsFS ? ' · Ctrl+S' : '';
  dropdown.innerHTML =
    '<div class="menu-section-label">' + p.getCurrentProjectName() + '</div>' +
    '<button class="menu-action-row" data-fm="new">🆕 Nuevo proyecto</button>' +
    '<button class="menu-action-row" data-fm="open">📂 Abrir proyecto… <span style="margin-left:auto;color:var(--muted)">Ctrl+O</span></button>' +
    '<button class="menu-action-row" data-fm="save">💾 Guardar<span style="margin-left:auto;color:var(--muted)">' + shortcut + '</span></button>' +
    '<button class="menu-action-row" data-fm="saveAs">💾 Guardar como…</button>' +
    '<div class="menu-divider"></div>' +
    '<button class="menu-action-row" data-fm="import">📥 Importar proyecto (.sumo)…</button>' +
    '<button class="menu-action-row" data-fm="export">📤 Exportar proyecto (.sumo)</button>' +
    (!p.supportsFS
      ? '<div class="menu-divider"></div><div class="menu-section-label">Guardado local en este navegador — usa Exportar para hacer una copia en tu equipo.</div>'
      : '');

  const notify = (_fileCtx && _fileCtx.notify) || (() => {});
  const run = (fn, okMsg) => {
    closeAll();
    Promise.resolve(fn()).then((r) => {
      if (r && r.ok) notify(okMsg(r), 'ok');
      else if (r && r.error) notify('✗ ' + r.error, 'error');
    }).catch((e) => notify('✗ ' + (e && e.message ? e.message : e), 'error'));
  };
  dropdown.querySelector('[data-fm="new"]').onclick    = () => run(p.newProject,    () => '🆕 Nuevo proyecto');
  dropdown.querySelector('[data-fm="open"]').onclick   = () => run(p.openProject,   (r) => `📂 Proyecto abierto: ${r.name}`);
  dropdown.querySelector('[data-fm="save"]').onclick   = () => run(p.saveProject,   (r) => `💾 Proyecto guardado: ${r.name}`);
  dropdown.querySelector('[data-fm="saveAs"]').onclick = () => run(p.saveProjectAs, (r) => `💾 Proyecto guardado: ${r.name}`);
  dropdown.querySelector('[data-fm="import"]').onclick = () => run(p.importProject, (r) => `📥 Proyecto importado: ${r.name}`);
  dropdown.querySelector('[data-fm="export"]').onclick = () => run(p.exportProject, (r) => `📤 Proyecto exportado: ${r.name}.sumo`);
}

function renderVentanas(dropdown) {
  const rows = getPanelList().map((p) =>
    '<label class="menu-check-row"><input type="checkbox" data-panel="' + p.id + '"' +
    (p.visible ? ' checked' : '') + '> ' + (p.icon || '') + ' ' + p.title + '</label>'
  ).join('');
  dropdown.innerHTML =
    rows +
    '<div class="menu-divider"></div>' +
    '<button class="menu-action-row" id="btnRestoreLayout">↺ Restaurar diseño predeterminado</button>';
  dropdown.querySelectorAll('input[data-panel]').forEach((cb) => {
    cb.addEventListener('change', () => togglePanel(cb.dataset.panel));
  });
  dropdown.querySelector('#btnRestoreLayout').onclick = () => { restoreDefaultLayout(); closeAll(); };
}

function renderConfiguracion(dropdown) {
  const s = getSettings();
  dropdown.innerHTML =
    '<div class="menu-section-label">Tema</div>' +
    '<div class="menu-toggle-row">' +
      '<span>Modo claro</span>' +
      '<label class="menu-switch"><input type="checkbox" id="cfgThemeSwitch"' + (s.theme === 'light' ? ' checked' : '') + '>' +
        '<span class="menu-switch-track"></span></label>' +
    '</div>' +
    '<div class="menu-section-label">Acento</div>' +
    '<div class="menu-accent-row">' +
      ACCENTS.map((a) =>
        '<button class="menu-accent-swatch' + (s.accent === a.id ? ' sel' : '') + '" data-accent="' + a.id +
        '" title="' + a.label + '" style="background:' + a.color + '"></button>'
      ).join('') +
    '</div>' +
    '<div class="menu-divider"></div>' +
    '<div class="menu-toggle-row">' +
      '<span>Silenciar sonido</span>' +
      '<label class="menu-switch"><input type="checkbox" id="cfgMuteSwitch"' + (s.sfxMuted ? ' checked' : '') + '>' +
        '<span class="menu-switch-track"></span></label>' +
    '</div>';
  dropdown.querySelector('#cfgThemeSwitch').addEventListener('change', (e) => setTheme(e.target.checked ? 'light' : 'dark'));
  dropdown.querySelector('#cfgMuteSwitch').addEventListener('change', (e) => setSfxMuted(e.target.checked));
  dropdown.querySelectorAll('.menu-accent-swatch').forEach((btn) => {
    btn.addEventListener('click', () => { setAccent(btn.dataset.accent); renderConfiguracion(dropdown); });
  });
}

function renderTutoriales(dropdown) {
  const tours = [
    { title: 'Aprender pyblock', desc: 'Categorias, abrir bloques, arrastrarlos al editor y usar la guia de bloques.', steps: TOUR_PYBLOCK,
      prepare: async () => {
        const sel = document.getElementById('selLang');
        if (sel && sel.value !== 'blocks') {
          sel.value = 'blocks';
          sel.dispatchEvent(new Event('change'));
          await new Promise(r => setTimeout(r, 450));
        }
      } },
    { title: 'Tour de la interfaz', desc: 'Conoce la barra de menú, el editor, la arena y el panel de control.', steps: TOUR_INTERFAZ },
    { title: 'Cómo completar tu primera misión', desc: 'Del mapa de misiones a tu primer resultado con estrellas.', steps: TOUR_PRIMERA_MISION },
  ];
  dropdown.innerHTML = tours.map((t, i) =>
    '<div class="menu-tour-item">' +
      '<div class="menu-tour-title">' + t.title + '</div>' +
      '<div class="menu-tour-desc">' + t.desc + '</div>' +
      '<button class="menu-tour-start" data-tour="' + i + '">▶ Iniciar</button>' +
    '</div>' + (i < tours.length - 1 ? '<div class="menu-divider"></div>' : '')
  ).join('');
  dropdown.querySelectorAll('.menu-tour-start').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tour = tours[+btn.dataset.tour];
      closeAll();
      Promise.resolve(tour.prepare && tour.prepare()).then(() => startTour(tour.steps));
    });
  });
}

export function initMenubar(fileCtx) {
  _fileCtx = fileCtx || null;
  const bar = document.querySelector('.menubar');
  if (!bar) return;

  const entries = [
    { name: 'archivo', label: 'Archivo', render: renderArchivo },
    { name: 'ventanas', label: 'Ventanas', render: renderVentanas },
    { name: 'config', label: 'Configuración', render: renderConfiguracion },
    { name: 'tutoriales', label: 'Tutoriales', render: renderTutoriales },
  ];

  for (const entry of entries) {
    const btn = document.createElement('button');
    btn.className = 'menubar-btn';
    btn.textContent = entry.label;
    btn.dataset.menu = entry.name;

    const dropdown = document.createElement('div');
    dropdown.className = 'menubar-dropdown';
    dropdown.hidden = true;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(entry.name, btn, dropdown, entry.render);
    });

    bar.appendChild(btn);
    bar.appendChild(dropdown);
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menubar')) closeAll();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
}
