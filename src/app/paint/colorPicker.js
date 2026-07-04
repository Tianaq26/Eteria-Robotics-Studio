// ======================================================
// colorPicker.js — Selector de color HSV (cuadrado S/V + barra de matiz),
// hex, paleta de preset, recientes y guardados. Sin dependencias externas:
// todo dibujado a mano en <canvas>, consistente con el resto del proyecto
// (ESM puro, sin bundler).
// ======================================================
import {
  state, setColor, PRESET_COLORS,
  getRecentColors, getSavedColors, saveColor, removeSavedColor, onStateChange,
} from './paintState.js';

const SV_W = 200, SV_H = 150, HUE_W = 22, HUE_H = 150;

function hsvToHex(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  let [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to255 = (n) => Math.round((n + m) * 255);
  return '#' + [to255(r), to255(g), to255(b)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

function hexToHsv(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

export function initColorPicker(container) {
  let { h, s, v } = hexToHsv(state.color);

  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'pe-colorpicker';

  const topRow = document.createElement('div');
  topRow.className = 'pe-cp-top';
  const preview = document.createElement('div');
  preview.className = 'pe-cp-preview';
  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'pe-cp-hex';
  hexInput.maxLength = 7;
  topRow.append(preview, hexInput);

  const svWrap = document.createElement('div');
  svWrap.className = 'pe-cp-svwrap';
  const svCanvas = document.createElement('canvas');
  svCanvas.width = SV_W; svCanvas.height = SV_H;
  const svCursor = document.createElement('div');
  svCursor.className = 'pe-cp-svcursor';
  svWrap.append(svCanvas, svCursor);

  const hueCanvas = document.createElement('canvas');
  hueCanvas.width = HUE_W; hueCanvas.height = HUE_H;
  hueCanvas.className = 'pe-cp-hue';
  const hueCursor = document.createElement('div');
  hueCursor.className = 'pe-cp-huecursor';
  const hueWrap = document.createElement('div');
  hueWrap.className = 'pe-cp-huewrap';
  hueWrap.append(hueCanvas, hueCursor);

  const pickerRow = document.createElement('div');
  pickerRow.className = 'pe-cp-pickerrow';
  pickerRow.append(svWrap, hueWrap);

  const presetsRow = makeSwatchRow('Paleta', PRESET_COLORS, false);
  const recentRow = makeSwatchRow('Recientes', getRecentColors(), false);
  const savedRow = makeSwatchRow('Guardados', getSavedColors(), true);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'pe-btn pe-cp-savebtn';
  saveBtn.textContent = '+ Guardar color actual';
  saveBtn.onclick = () => { saveColor(state.color); refreshSaved(); };

  root.append(topRow, pickerRow, presetsRow.row, recentRow.row, savedRow.row, saveBtn);
  container.appendChild(root);

  const svCtx = svCanvas.getContext('2d');
  const hueCtx = hueCanvas.getContext('2d');

  function drawSV() {
    svCtx.fillStyle = `hsl(${h}, 100%, 50%)`;
    svCtx.fillRect(0, 0, SV_W, SV_H);
    const white = svCtx.createLinearGradient(0, 0, SV_W, 0);
    white.addColorStop(0, '#fff'); white.addColorStop(1, 'rgba(255,255,255,0)');
    svCtx.fillStyle = white; svCtx.fillRect(0, 0, SV_W, SV_H);
    const black = svCtx.createLinearGradient(0, 0, 0, SV_H);
    black.addColorStop(0, 'rgba(0,0,0,0)'); black.addColorStop(1, '#000');
    svCtx.fillStyle = black; svCtx.fillRect(0, 0, SV_W, SV_H);
    svCursor.style.left = (s * SV_W) + 'px';
    svCursor.style.top = ((1 - v) * SV_H) + 'px';
  }
  function drawHue() {
    const grad = hueCtx.createLinearGradient(0, 0, 0, HUE_H);
    ['#f00', '#ff0', '#0f0', '#0ff', '#00f', '#f0f', '#f00'].forEach((c, i) => grad.addColorStop(i / 6, c));
    hueCtx.fillStyle = grad;
    hueCtx.fillRect(0, 0, HUE_W, HUE_H);
    hueCursor.style.top = ((h / 360) * HUE_H) + 'px';
  }
  function applyHsv(silent) {
    const hex = hsvToHex(h, s, v);
    preview.style.background = hex;
    hexInput.value = hex;
    if (!silent) setColor(hex);
  }
  function refreshFromHex(hex) {
    ({ h, s, v } = hexToHsv(hex));
    drawSV(); drawHue(); applyHsv(true);
  }
  function refreshSaved() {
    updateSwatchRow(savedRow, getSavedColors(), true);
  }

  svCanvas.addEventListener('pointerdown', (ev) => {
    svCanvas.setPointerCapture(ev.pointerId);
    const onMove = (e) => {
      const rect = svCanvas.getBoundingClientRect();
      s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
      drawSV(); applyHsv(false);
    };
    onMove(ev);
    svCanvas.addEventListener('pointermove', onMove);
    svCanvas.addEventListener('pointerup', () => svCanvas.removeEventListener('pointermove', onMove), { once: true });
  });

  hueCanvas.addEventListener('pointerdown', (ev) => {
    hueCanvas.setPointerCapture(ev.pointerId);
    const onMove = (e) => {
      const rect = hueCanvas.getBoundingClientRect();
      h = Math.max(0, Math.min(359.999, ((e.clientY - rect.top) / rect.height) * 360));
      drawHue(); drawSV(); applyHsv(false);
    };
    onMove(ev);
    hueCanvas.addEventListener('pointermove', onMove);
    hueCanvas.addEventListener('pointerup', () => hueCanvas.removeEventListener('pointermove', onMove), { once: true });
  });

  hexInput.addEventListener('change', () => {
    if (/^#?[0-9a-f]{6}$/i.test(hexInput.value)) {
      const hex = hexInput.value.startsWith('#') ? hexInput.value : '#' + hexInput.value;
      refreshFromHex(hex);
      setColor(hex);
    } else {
      hexInput.value = state.color;
    }
  });

  onStateChange((st) => {
    if (st.color.toLowerCase() !== hsvToHex(h, s, v).toLowerCase()) refreshFromHex(st.color);
    updateSwatchRow(recentRow, getRecentColors(), false);
  });

  drawSV(); drawHue(); applyHsv(true);
}

function makeSwatchRow(label, colors, removable) {
  const row = document.createElement('div');
  row.className = 'pe-cp-group';
  const title = document.createElement('div');
  title.className = 'pe-cp-label';
  title.textContent = label;
  const grid = document.createElement('div');
  grid.className = 'pe-cp-swatches';
  row.append(title, grid);
  const obj = { row, grid, removable };
  updateSwatchRow(obj, colors, removable);
  return obj;
}

function updateSwatchRow(obj, colors, removable) {
  obj.grid.innerHTML = '';
  colors.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'pe-cp-swatch';
    b.style.background = c;
    b.title = c;
    b.onclick = () => setColor(c);
    if (removable) {
      b.title += ' (clic derecho para quitar)';
      b.oncontextmenu = (e) => { e.preventDefault(); removeSavedColor(c); updateSwatchRow(obj, getSavedColors(), true); };
    }
    obj.grid.appendChild(b);
  });
}
