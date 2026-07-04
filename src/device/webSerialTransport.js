// ======================================================
// webSerialTransport.js — Envoltorio genérico sobre la Web Serial API.
// No sabe nada de IdeaBoard ni CircuitPython: cualquier dispositivo que hable
// por USB-serial puede reutilizar esto (por eso vive en src/device/, separado
// de src/runtime/pybridge.js que es el puente hacia el Worker de Pyodide).
// ======================================================

export function isSupported() {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/**
 * Pide al usuario un puerto serie, lo abre y arranca el bucle de lectura.
 * @returns {Promise<object>} transporte con write/writeControl/onData/onDisconnect/close
 */
export async function requestAndOpen({ baudRate = 115200 } = {}) {
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate });

  const dataListeners = new Set();
  const disconnectListeners = new Set();

  const textDecoder = new TextDecoderStream();
  const readableStreamClosed = port.readable.pipeTo(textDecoder.writable).catch(() => {});
  const reader = textDecoder.readable.getReader();

  const textEncoder = new TextEncoderStream();
  const writableStreamClosed = textEncoder.readable.pipeTo(port.writable).catch(() => {});
  const writer = textEncoder.writable.getWriter();

  let closed = false;

  (async function readLoop() {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) for (const cb of dataListeners) cb(value);
      }
    } catch (_) {
      // El puerto se cerró o el dispositivo se desconectó físicamente.
    } finally {
      if (!closed) for (const cb of disconnectListeners) cb();
    }
  })();

  navigator.serial.addEventListener('disconnect', function onUnplug(e) {
    if (e.target !== port) return;
    navigator.serial.removeEventListener('disconnect', onUnplug);
    if (!closed) for (const cb of disconnectListeners) cb();
  });

  async function close() {
    if (closed) return;
    closed = true;
    try { await reader.cancel(); } catch (_) {}
    try { await readableStreamClosed; } catch (_) {}
    try { await writer.close(); } catch (_) {}
    try { await writableStreamClosed; } catch (_) {}
    try { await port.close(); } catch (_) {}
  }

  return {
    write: (text) => writer.write(text),
    onData: (cb) => { dataListeners.add(cb); return () => dataListeners.delete(cb); },
    onDisconnect: (cb) => disconnectListeners.add(cb),
    close,
  };
}
