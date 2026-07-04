// ======================================================
// ideaBoard.js — Driver del dispositivo físico IdeaBoard (ESP32 + CircuitPython,
// la placa real del Sumobot). Todo pasa por un único canal: el puerto serie
// USB (Web Serial API) — nada de software ni dependencias externas (nada de
// Thonny).
//
// Corrección importante tras probar con hardware real: esta IdeaBoard usa un
// chip puente USB-serie (CH340) y no tiene USB nativo, así que su ESP32 NUNCA
// expone una unidad de almacenamiento "CIRCUITPY" — no hay disco que montar
// con la File System Access API (por eso nunca aparecía en el explorador de
// archivos de Windows). Así es como IdeaCode también lo resuelve: subir, leer,
// listar y borrar archivos se hace hablándole al mismo puerto serie con el
// protocolo estándar "raw REPL" de MicroPython/CircuitPython — el mismo que
// usan Thonny, ampy y mpremote para placas sin almacenamiento USB
// (ver src/device/microPythonRawRepl.js).
//
// Consecuencia inevitable del protocolo (no es un bug): cada operación de
// archivos interrumpe brevemente el programa en ejecución del robot. Por eso
// upload/listFiles/readFile/deleteFile terminan siempre con un soft-reload
// (Ctrl-D) que retoma code.py — el robot "parpadea" un instante y sigue.
//
// Arquitectura pensada para más dispositivos a futuro: cualquier otro driver
// puede implementar la misma forma pública (state, connect, disconnect,
// upload, listFiles, onStateChange, onSerialData) sin tocar este archivo.
// ======================================================

import * as SerialTransport from './webSerialTransport.js';
import { createRawReplClient } from './microPythonRawRepl.js';

export const STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  UPLOADING: 'uploading',
  ERROR: 'error',
};

const CANCEL_ERROR_NAMES = new Set(['NotFoundError', 'AbortError']);

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64) {
  const binary = atob(b64.trim());
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

class IdeaBoardDevice {
  id = 'ideaboard';
  name = 'IdeaBoard';
  state = STATES.DISCONNECTED;
  error = null;

  #serial = null;
  #repl = null;
  #silent = false;
  #chain = Promise.resolve(); // serializa las operaciones de archivos: dos a la vez corromperían el intercambio raw REPL
  #stateListeners = new Set();
  #dataListeners = new Set();

  get isSupported() {
    return SerialTransport.isSupported();
  }

  onStateChange(cb) { this.#stateListeners.add(cb); return () => this.#stateListeners.delete(cb); }
  onSerialData(cb) { this.#dataListeners.add(cb); return () => this.#dataListeners.delete(cb); }

  #setState(state, error) {
    this.state = state;
    this.error = error || null;
    for (const cb of this.#stateListeners) cb(this.state, this.error);
  }

  async connect() {
    if (this.state === STATES.CONNECTING || this.state === STATES.CONNECTED) return;
    if (!this.isSupported) {
      this.#setState(STATES.ERROR, 'Este navegador no soporta Web Serial. Usa Chrome o Edge de escritorio.');
      return;
    }
    this.#setState(STATES.CONNECTING);
    try {
      this.#serial = await SerialTransport.requestAndOpen({ baudRate: 115200 });
      this.#serial.onData((chunk) => { if (!this.#silent) for (const cb of this.#dataListeners) cb(chunk); });
      this.#serial.onDisconnect(() => this.disconnect('La IdeaBoard se desconectó.'));
      this.#repl = createRawReplClient(this.#serial);
      this.#setState(STATES.CONNECTED);
    } catch (e) {
      const cancelled = e && CANCEL_ERROR_NAMES.has(e.name);
      await this.#cleanup();
      if (cancelled) this.#setState(STATES.DISCONNECTED);
      else this.#setState(STATES.ERROR, (e && e.message) || String(e));
    }
  }

  async disconnect(reason) {
    await this.#cleanup();
    this.#setState(STATES.DISCONNECTED, reason || null);
  }

  async #cleanup() {
    if (this.#repl) { this.#repl.destroy(); this.#repl = null; }
    if (this.#serial) { try { await this.#serial.close(); } catch (_) {} this.#serial = null; }
  }

  /**
   * Corre `code` en raw REPL sin ensuciar el Monitor Serie, y retoma code.py al terminar.
   * Serializado con #chain: si dos operaciones se disparan a la vez (p. ej. un refresh
   * de la lista de archivos justo cuando se está subiendo código), la segunda espera a
   * que termine la primera en vez de entrelazar bytes en el mismo puerto serie.
   */
  #runManagementCode(code, timeoutMs) {
    if (!this.#repl) throw new Error('Conecta la IdeaBoard primero.');
    const run = async () => {
      this.#silent = true;
      try {
        return await this.#repl.run(code, timeoutMs);
      } finally {
        this.#silent = false;
        try { await this.sendSoftReload(); } catch (_) {}
      }
    };
    const result = this.#chain.then(run, run);
    this.#chain = result.catch(() => {});
    return result;
  }

  /** Escribe `code` como code.py en la IdeaBoard y retoma su ejecución (soft-reload). */
  async upload(code, filename = 'code.py') {
    if (this.state !== STATES.CONNECTED) throw new Error('Conecta la IdeaBoard primero.');
    this.#setState(STATES.UPLOADING);
    const py = `import binascii\nwith open(${JSON.stringify(filename)}, "wb") as _f:\n    _f.write(binascii.a2b_base64(${JSON.stringify(toBase64(code))}))\n`;
    try {
      await this.#runManagementCode(py, 15000);
      this.#setState(STATES.CONNECTED);
    } catch (e) {
      this.#setState(STATES.CONNECTED);
      throw e;
    }
  }

  /** Lista los archivos/carpetas en la raíz del sistema de archivos: [{ name, kind, size }]. */
  async listFiles() {
    if (this.state !== STATES.CONNECTED) return [];
    const py = 'import os, json\n' +
      '_r = []\n' +
      'for _n in os.listdir():\n' +
      '    try:\n' +
      '        _s = os.stat(_n)\n' +
      '        _r.append([_n, bool(_s[0] & 0x4000), _s[6]])\n' +
      '    except Exception:\n' +
      '        _r.append([_n, False, None])\n' +
      'print(json.dumps(_r))\n';
    const out = await this.#runManagementCode(py, 8000);
    let arr;
    try { arr = JSON.parse(out.trim()); }
    catch (_) { throw new Error('Respuesta inesperada de la IdeaBoard al listar archivos.'); }
    return arr.map(([name, isDir, size]) => ({ name, kind: isDir ? 'directory' : 'file', size }));
  }

  async readFile(name) {
    const py = `import binascii\nwith open(${JSON.stringify(name)}, "rb") as _f:\n    print(binascii.b2a_base64(_f.read()).decode())\n`;
    const out = await this.#runManagementCode(py, 8000);
    return fromBase64(out);
  }

  async deleteFile(name) {
    const py = `import os\nos.remove(${JSON.stringify(name)})\n`;
    await this.#runManagementCode(py, 8000);
  }

  /** Ctrl+C — interrumpe el programa en ejecución y vuelve al prompt REPL. */
  async sendInterrupt() { if (this.#serial) await this.#serial.write('\x03'); }
  /** Ctrl+D — soft-reload: vuelve a ejecutar code.py. */
  async sendSoftReload() { if (this.#serial) await this.#serial.write('\x04'); }
  /** Texto libre hacia el REPL (por ejemplo, respuestas a un input()). */
  async sendText(text) { if (this.#serial) await this.#serial.write(text); }
}

export const ideaBoard = new IdeaBoardDevice();
