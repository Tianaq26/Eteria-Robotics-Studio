// ======================================================
// deviceUI.js — Conecta ideaBoard.js (src/device/) con el DOM: botón
// "Conectar IdeaBoard", botón "Subir al robot", el panel "Monitor Serie"
// (con detección de tracebacks e indicador de actividad) y el panel
// "Archivos del robot" (lista el sistema de archivos de la IdeaBoard vía el
// puerto serie — no hay unidad de disco que montar en esta placa — como el
// panel Device de IdeaCode: abrir en el editor, descargar, eliminar).
//
// No conoce Monaco/Blockly/M: recibe getUploadCode()/openDeviceFile() como
// hooks (igual que projectManager.js recibe getState/applyState desde main.js).
// ======================================================

import { ideaBoard, STATES } from '../device/ideaBoard.js';
import { showPanel } from './dock/dockManager.js';

const $ = (id) => document.getElementById(id);

// Texto del botón (una acción) vs. el estado de los paneles (un estado).
const BTN_LABEL = {
  [STATES.DISCONNECTED]: 'Conectar IdeaBoard',
  [STATES.CONNECTING]: 'Conectando…',
  [STATES.CONNECTED]: 'Desconectar IdeaBoard',
  [STATES.UPLOADING]: 'Subiendo…',
  [STATES.ERROR]: 'Reintentar conexión',
};
const STATUS_LABEL = {
  [STATES.DISCONNECTED]: 'Desconectado',
  [STATES.CONNECTING]: 'Conectando…',
  [STATES.CONNECTED]: 'Conectado',
  [STATES.UPLOADING]: 'Subiendo…',
  [STATES.ERROR]: 'Error de conexión',
};

const ERROR_LINE_RE = /traceback|error:|exception/i;

function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toFixed(1) + ' KB';
}

function timeAgo(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 2) return 'justo ahora';
  if (s < 60) return 'hace ' + s + ' s';
  return 'hace ' + Math.round(s / 60) + ' min';
}

export function initDeviceUI({ getUploadCode, openDeviceFile, notify }) {
  const btn = $('btnConnectDevice');
  const uploadBtn = $('btnUpload');
  const statusEl = $('serialStatus');
  const activityEl = $('serialActivity');
  const logEl = $('serialLog');
  const inputForm = $('serialInputRow');
  const input = $('serialInput');
  const filesStatusEl = $('deviceFilesStatus');
  const filesListEl = $('deviceFilesList');
  const filesRefreshBtn = $('btnDeviceFilesRefresh');
  if (!btn) return; // el markup del panel no está en esta página

  if (!ideaBoard.isSupported) {
    btn.disabled = true;
    btn.title = 'Tu navegador no soporta Web Serial. Usa Chrome o Edge de escritorio para conectar la IdeaBoard.';
    if (statusEl) statusEl.textContent = 'No disponible en este navegador (usa Chrome/Edge de escritorio).';
    if (filesStatusEl) filesStatusEl.textContent = 'No disponible en este navegador.';
    if (uploadBtn) uploadBtn.disabled = true;
    return;
  }

  let lastActivityAt = null;

  function render() {
    const labelEl = $('btnConnectLabel');
    if (labelEl) labelEl.textContent = BTN_LABEL[ideaBoard.state] || ideaBoard.state;
    btn.classList.toggle('running', ideaBoard.state === STATES.CONNECTED);
    btn.classList.toggle('paused', ideaBoard.state === STATES.CONNECTING || ideaBoard.state === STATES.UPLOADING);
    btn.classList.toggle('device-error', ideaBoard.state === STATES.ERROR);
    if (uploadBtn) uploadBtn.disabled = ideaBoard.state !== STATES.CONNECTED;

    const status = STATUS_LABEL[ideaBoard.state] || ideaBoard.state;
    const full = status + (ideaBoard.error ? ' — ' + ideaBoard.error : '');
    if (statusEl) statusEl.textContent = full;
    if (filesStatusEl) filesStatusEl.textContent = full;
    if (filesRefreshBtn) filesRefreshBtn.disabled = ideaBoard.state !== STATES.CONNECTED;
  }

  // ── Monitor Serie: log línea por línea, con tracebacks resaltados en rojo ──
  let lineBuffer = '';
  function flushLine(rawLine) {
    const line = rawLine.replace(/\r$/, ''); // CircuitPython termina cada línea en \r\n
    const div = document.createElement('div');
    div.className = 'serial-line' + (ERROR_LINE_RE.test(line) ? ' serial-error' : '');
    div.textContent = line;
    logEl.appendChild(div);
    while (logEl.childElementCount > 3000) logEl.removeChild(logEl.firstChild);
  }
  function appendSerial(text) {
    if (!logEl) return;
    lastActivityAt = Date.now();
    const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 24;
    lineBuffer += text;
    const parts = lineBuffer.split('\n');
    lineBuffer = parts.pop(); // resto sin salto de línea todavía
    for (const part of parts) flushLine(part);
    if (atBottom) logEl.scrollTop = logEl.scrollHeight;
  }
  setInterval(() => {
    if (!activityEl) return;
    activityEl.textContent = (ideaBoard.state === STATES.CONNECTED && lastActivityAt)
      ? '· última actividad ' + timeAgo(lastActivityAt) : '';
  }, 1000);

  // ── Archivos del robot ──
  async function refreshFiles() {
    if (!filesListEl) return;
    if (ideaBoard.state !== STATES.CONNECTED) {
      filesListEl.innerHTML = '<div class="proj-empty">Conecta la IdeaBoard para ver sus archivos.</div>';
      return;
    }
    let entries;
    try { entries = await ideaBoard.listFiles(); }
    catch (e) { filesListEl.innerHTML = '<div class="proj-empty">Error al listar archivos: ' + ((e && e.message) || e) + '</div>'; return; }

    filesListEl.innerHTML = entries.length ? '' : '<div class="proj-empty">No hay archivos en la IdeaBoard.</div>';
    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'proj-item device-file-item' + (entry.kind === 'directory' ? ' directory' : '');
      row.innerHTML =
        '<div class="proj-item-main">' +
          '<div class="proj-item-name">' + entry.name + '</div>' +
          '<div class="proj-item-date">' + (entry.kind === 'directory' ? 'Carpeta' : formatSize(entry.size)) + '</div>' +
        '</div>' +
        (entry.kind === 'file'
          ? '<button class="proj-item-del" data-act="download" title="Descargar">⬇</button>' +
            '<button class="proj-item-del" data-act="delete" title="Eliminar">✕</button>'
          : '');
      if (entry.kind === 'file') {
        row.querySelector('.proj-item-main').onclick = async () => {
          try {
            const content = await ideaBoard.readFile(entry.name);
            if (openDeviceFile) openDeviceFile(entry.name, content);
            notify('📄 ' + entry.name + ' cargado en el editor.', 'ok');
          } catch (e) { notify('✗ No se pudo abrir ' + entry.name + ': ' + ((e && e.message) || e), 'error'); }
        };
        row.querySelector('[data-act="download"]').onclick = async (ev) => {
          ev.stopPropagation();
          try {
            const content = await ideaBoard.readFile(entry.name);
            const blob = new Blob([content], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = entry.name;
            a.click(); URL.revokeObjectURL(a.href);
          } catch (e) { notify('✗ No se pudo descargar ' + entry.name + ': ' + ((e && e.message) || e), 'error'); }
        };
        row.querySelector('[data-act="delete"]').onclick = async (ev) => {
          ev.stopPropagation();
          if (!window.confirm('¿Eliminar "' + entry.name + '" de la IdeaBoard? Esta acción no se puede deshacer.')) return;
          try { await ideaBoard.deleteFile(entry.name); await refreshFiles(); notify('🗑 ' + entry.name + ' eliminado de la IdeaBoard.', 'ok'); }
          catch (e) { notify('✗ No se pudo eliminar ' + entry.name + ': ' + ((e && e.message) || e), 'error'); }
        };
      }
      filesListEl.appendChild(row);
    }
  }
  if (filesRefreshBtn) filesRefreshBtn.onclick = refreshFiles;

  ideaBoard.onStateChange((state, error) => {
    render();
    if (state === STATES.ERROR && error) notify('✗ IdeaBoard: ' + error, 'error');
    else if (state === STATES.CONNECTED) {
      notify('🔌 IdeaBoard conectada.', 'ok');
      showPanel('serial');
      showPanel('deviceFiles');
      refreshFiles();
    } else if (state === STATES.DISCONNECTED) {
      if (error) notify('🔌 ' + error, 'warn');
      refreshFiles();
    }
  });
  ideaBoard.onSerialData(appendSerial);

  btn.onclick = () => {
    if (ideaBoard.state === STATES.CONNECTED || ideaBoard.state === STATES.ERROR) ideaBoard.disconnect();
    else if (ideaBoard.state === STATES.DISCONNECTED) ideaBoard.connect();
  };

  if (uploadBtn) {
    uploadBtn.onclick = async () => {
      const code = getUploadCode();
      if (code == null) { notify('✗ El lenguaje actual no genera CircuitPython. Cambia a 🐍 Python o 🧩 pyblock para subir al robot.', 'error'); return; }
      try {
        await ideaBoard.upload(code);
        notify('⬆ Código subido a la IdeaBoard (code.py). Ejecutando…', 'ok');
        refreshFiles();
      } catch (e) {
        notify('✗ Error al subir: ' + ((e && e.message) || e), 'error');
      }
    };
  }

  $('btnSerialInterrupt') && ($('btnSerialInterrupt').onclick = () => ideaBoard.sendInterrupt());
  $('btnSerialReload')    && ($('btnSerialReload').onclick    = () => ideaBoard.sendSoftReload());
  $('btnSerialClear')     && ($('btnSerialClear').onclick     = () => { logEl.innerHTML = ''; });

  if (inputForm) {
    inputForm.onsubmit = (e) => {
      e.preventDefault();
      const text = input.value;
      if (!text) return;
      ideaBoard.sendText(text + '\r\n');
      input.value = '';
    };
  }

  render();
  refreshFiles();
}
