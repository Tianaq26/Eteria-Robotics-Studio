// ======================================================
// menubar.js — Barra de menú superior: Ventanas / Configuración / Tutoriales.
// Dropdowns simples (click para abrir, click afuera o Escape para cerrar).
// ======================================================

import { getPanelList, togglePanel, restoreDefaultLayout } from './dockManager.js';
import { getSettings, setTheme, setAccent, setSfxMuted } from '../settings.js';
import { startTour, TOUR_INTERFAZ, TOUR_PRIMERA_MISION, TOUR_PYBLOCK, TOUR_PINTAR_BOT } from '../tour.js';
import { t, onLangChange } from '../i18n.js';

const ACCENTS = [
  { id: 'azul',    key: 'menu.accent.azul',    color: '#3c82f0' },
  { id: 'violeta', key: 'menu.accent.violeta', color: '#a855f7' },
  { id: 'verde',   key: 'menu.accent.verde',   color: '#22c55e' },
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
    '<button class="menu-action-row" data-fm="new">' + t('menu.file.new') + '</button>' +
    '<button class="menu-action-row" data-fm="open">' + t('menu.file.open') + ' <span style="margin-left:auto;color:var(--muted)">Ctrl+O</span></button>' +
    '<button class="menu-action-row" data-fm="save">' + t('menu.file.save') + '<span style="margin-left:auto;color:var(--muted)">' + shortcut + '</span></button>' +
    '<button class="menu-action-row" data-fm="saveAs">' + t('menu.file.saveAs') + '</button>' +
    '<div class="menu-divider"></div>' +
    '<button class="menu-action-row" data-fm="import">' + t('menu.file.import') + '</button>' +
    '<button class="menu-action-row" data-fm="export">' + t('menu.file.export') + '</button>' +
    (!p.supportsFS
      ? '<div class="menu-divider"></div><div class="menu-section-label">' + t('menu.file.localNote') + '</div>'
      : '');

  const notify = (_fileCtx && _fileCtx.notify) || (() => {});
  const run = (fn, okMsg) => {
    closeAll();
    Promise.resolve(fn()).then((r) => {
      if (r && r.ok) notify(okMsg(r), 'ok');
      else if (r && r.error) notify('✗ ' + r.error, 'error');
    }).catch((e) => notify('✗ ' + (e && e.message ? e.message : e), 'error'));
  };
  dropdown.querySelector('[data-fm="new"]').onclick    = () => run(p.newProject,    () => t('menu.file.newDone'));
  dropdown.querySelector('[data-fm="open"]').onclick   = () => run(p.openProject,   (r) => t('menu.file.opened',   { name: r.name }));
  dropdown.querySelector('[data-fm="save"]').onclick   = () => run(p.saveProject,   (r) => t('menu.file.saved',    { name: r.name }));
  dropdown.querySelector('[data-fm="saveAs"]').onclick = () => run(p.saveProjectAs, (r) => t('menu.file.saved',    { name: r.name }));
  dropdown.querySelector('[data-fm="import"]').onclick = () => run(p.importProject, (r) => t('menu.file.imported', { name: r.name }));
  dropdown.querySelector('[data-fm="export"]').onclick = () => run(p.exportProject, (r) => t('menu.file.exported', { name: r.name }));
}

function renderVentanas(dropdown) {
  const rows = getPanelList().map((p) =>
    '<label class="menu-check-row"><input type="checkbox" data-panel="' + p.id + '"' +
    (p.visible ? ' checked' : '') + '> ' + (p.icon || '') + ' ' + p.title + '</label>'
  ).join('');
  dropdown.innerHTML =
    rows +
    '<div class="menu-divider"></div>' +
    '<button class="menu-action-row" id="btnRestoreLayout">' + t('menu.windows.restore') + '</button>';
  dropdown.querySelectorAll('input[data-panel]').forEach((cb) => {
    cb.addEventListener('change', () => togglePanel(cb.dataset.panel));
  });
  dropdown.querySelector('#btnRestoreLayout').onclick = () => { restoreDefaultLayout(); closeAll(); };
}

function renderConfiguracion(dropdown) {
  const s = getSettings();
  dropdown.innerHTML =
    '<div class="menu-section-label">' + t('menu.config.theme') + '</div>' +
    '<div class="menu-toggle-row">' +
      '<span>' + t('menu.config.light') + '</span>' +
      '<label class="menu-switch"><input type="checkbox" id="cfgThemeSwitch"' + (s.theme === 'light' ? ' checked' : '') + '>' +
        '<span class="menu-switch-track"></span></label>' +
    '</div>' +
    '<div class="menu-section-label">' + t('menu.config.accent') + '</div>' +
    '<div class="menu-accent-row">' +
      ACCENTS.map((a) =>
        '<button class="menu-accent-swatch' + (s.accent === a.id ? ' sel' : '') + '" data-accent="' + a.id +
        '" title="' + t(a.key) + '" style="background:' + a.color + '"></button>'
      ).join('') +
    '</div>' +
    '<div class="menu-divider"></div>' +
    '<div class="menu-toggle-row">' +
      '<span>' + t('menu.config.mute') + '</span>' +
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
    { title: t('tour.item.pyblock.title'), desc: t('tour.item.pyblock.desc'), steps: TOUR_PYBLOCK,
      prepare: async () => {
        const sel = document.getElementById('selLang');
        if (sel && sel.value !== 'blocks') {
          sel.value = 'blocks';
          sel.dispatchEvent(new Event('change'));
          await new Promise(r => setTimeout(r, 450));
        }
      } },
    { title: t('tour.item.paint.title'), desc: t('tour.item.paint.desc'), steps: TOUR_PINTAR_BOT,
      prepare: async () => {
        const editor = document.getElementById('paintEditor');
        if (!editor || !editor.classList.contains('open')) {
          document.getElementById('btnPaint')?.click();
          await new Promise(r => setTimeout(r, 550));
        }
      } },
    { title: t('tour.item.interfaz.title'), desc: t('tour.item.interfaz.desc'), steps: TOUR_INTERFAZ },
    { title: t('tour.item.primera.title'), desc: t('tour.item.primera.desc'), steps: TOUR_PRIMERA_MISION },
  ];
  dropdown.innerHTML = tours.map((tour, i) =>
    '<div class="menu-tour-item">' +
      '<div class="menu-tour-title">' + tour.title + '</div>' +
      '<div class="menu-tour-desc">' + tour.desc + '</div>' +
      '<button class="menu-tour-start" data-tour="' + i + '">' + t('menu.tour.start') + '</button>' +
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
    { name: 'archivo', key: 'menu.file', render: renderArchivo },
    { name: 'ventanas', key: 'menu.windows', render: renderVentanas },
    { name: 'config', key: 'menu.config', render: renderConfiguracion },
    { name: 'tutoriales', key: 'menu.tutorials', render: renderTutoriales },
  ];

  for (const entry of entries) {
    const btn = document.createElement('button');
    btn.className = 'menubar-btn';
    btn.textContent = t(entry.key);
    btn.dataset.menu = entry.name;
    btn.dataset.i18nKey = entry.key;

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

  // Re-etiqueta los botones del menú al cambiar de idioma (los dropdowns se
  // re-renderizan solos al abrirse, así que basta con cerrarlos).
  onLangChange(() => {
    closeAll();
    bar.querySelectorAll('.menubar-btn').forEach((b) => {
      if (b.dataset.i18nKey) b.textContent = t(b.dataset.i18nKey);
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menubar')) closeAll();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
}
