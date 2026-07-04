// ======================================================
// microPythonRawRepl.js — Cliente del protocolo "raw REPL" de MicroPython/
// CircuitPython, hablado directamente sobre un transporte serie ya abierto.
//
// Es el mismo protocolo que usan mpremote/ampy/Thonny para leer, escribir y
// borrar archivos en placas que SOLO exponen un puerto serie, sin unidad
// CIRCUITPY de almacenamiento USB — el caso de esta IdeaBoard: usa un chip
// puente USB-serie (CH340) que no tiene forma de exponer un disco, así que
// no hay otra manera de tocar su sistema de archivos que hablarle por aquí.
//
// Genérico: no sabe nada de IdeaBoard. Cualquier placa MicroPython/
// CircuitPython puede reutilizarlo con un transporte tipo Web Serial
// ({ write(text), onData(cb) => unsubscribe }).
//
// Protocolo (ver pyboard.py de MicroPython, la referencia que usan ampy/
// mpremote/Thonny):
//   Ctrl-C  interrumpe el programa en ejecución
//   Ctrl-A  entra en modo raw REPL → responde "raw REPL; CTRL-B to exit"
//   <código> + Ctrl-D   ejecuta el bloque → responde "OK" + stdout + \x04 + stderr + \x04
//   Ctrl-B  sale de raw REPL, vuelve al REPL normal (no reinicia el programa)
// ======================================================

const CTRL_A = '\x01';
const CTRL_B = '\x02';
const CTRL_C = '\x03';
const CTRL_D = '\x04';

const RAW_REPL_BANNER = 'raw REPL; CTRL-B to exit';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** @param {{ write(text: string): Promise<void>, onData(cb: (chunk: string) => void): () => void }} transport */
export function createRawReplClient(transport) {
  let buffer = '';
  let waiter = null; // { marker, resolve, timer }

  const unsubscribe = transport.onData((chunk) => {
    buffer += chunk;
    if (!waiter) return;
    const idx = buffer.indexOf(waiter.marker);
    if (idx === -1) return;
    const before = buffer.slice(0, idx);
    buffer = buffer.slice(idx + waiter.marker.length);
    clearTimeout(waiter.timer);
    const { resolve } = waiter;
    waiter = null;
    resolve(before);
  });

  function waitFor(marker, timeoutMs) {
    return new Promise((resolve, reject) => {
      const idx = buffer.indexOf(marker);
      if (idx !== -1) {
        const before = buffer.slice(0, idx);
        buffer = buffer.slice(idx + marker.length);
        resolve(before);
        return;
      }
      waiter = {
        marker,
        resolve,
        timer: setTimeout(() => {
          waiter = null;
          reject(new Error('La IdeaBoard no respondió a tiempo. ¿Sigue conectada y con CircuitPython corriendo?'));
        }, timeoutMs),
      };
    });
  }

  /** Interrumpe lo que esté corriendo y entra en modo raw REPL. */
  async function enterRawRepl(timeoutMs = 5000) {
    buffer = '';
    await transport.write('\r' + CTRL_C + CTRL_C);
    await sleep(150);
    buffer = ''; // descarta el traceback/eco de la interrupción, no interesa
    await transport.write('\r' + CTRL_A);
    await waitFor(RAW_REPL_BANNER, timeoutMs);
  }

  /** Sale de raw REPL y vuelve al REPL normal (NO reinicia el programa por sí solo). */
  async function exitRawRepl() {
    await transport.write(CTRL_B);
  }

  /** Ejecuta `code` (ya en raw REPL) y devuelve su stdout; lanza si el programa tira una excepción. */
  async function execRaw(code, timeoutMs = 8000) {
    await transport.write(code + CTRL_D);
    await waitFor('OK', timeoutMs);
    const stdout = await waitFor('\x04', timeoutMs);
    const stderr = await waitFor('\x04', timeoutMs);
    if (stderr.trim()) throw new Error(stderr.trim());
    return stdout;
  }

  /** Atajo: entra a raw REPL, ejecuta `code`, sale, y devuelve stdout. */
  async function run(code, timeoutMs = 8000) {
    await enterRawRepl(timeoutMs);
    try {
      return await execRaw(code, timeoutMs);
    } finally {
      await exitRawRepl();
    }
  }

  return { enterRawRepl, exitRawRepl, execRaw, run, destroy: unsubscribe };
}
