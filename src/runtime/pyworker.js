// ======================================================
// pyworker.js — Worker que corre CPython (Pyodide) con la API oficial del
// Sumobot. El código del usuario (estilo `while True:` + sleep) corre
// aquí; los sleeps y lecturas de sensores se sincronizan con el simulador del
// hilo principal vía SharedArrayBuffer + Atomics (bloqueo cooperativo).
// ======================================================
/* global importScripts, loadPyodide */
importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');

let pyodide = null, running = false, runGen = 0;
let ctrl, intb, data;
const CLOCK = 0, STOP = 1;

// API expuesta a Python (from js import _sumo)
function installSumoApi() {
  self._sumo = {
    getIR: (i) => data[2 + i],
    getUltra: () => data[6],
    setMotor: (i, v) => { data[i] = v; },
    setPixel: (r, g, b) => { data[7] = r; data[8] = g; data[9] = b; },
    // sleep cooperativo: bloquea hasta que el reloj de simulación avance t segundos
    sleep: (t) => {
      let clock = Atomics.load(ctrl, CLOCK);
      const target = clock + Math.round(t * 1000);
      while (clock < target) {
        if (Atomics.load(ctrl, STOP)) throw new Error('__stop__');
        Atomics.wait(ctrl, CLOCK, clock, 100); // despierta al cambiar el reloj o a los 100ms
        clock = Atomics.load(ctrl, CLOCK);
      }
    },
  };
}

const SHIM_PY = `
import sys, types
from js import _sumo

# --- board ---
board = types.ModuleType('board')
for _n, _i in {'IO36':0,'IO39':1,'IO34':2,'IO35':3,'IO25':100,'IO26':101}.items():
    setattr(board, _n, _i)
sys.modules['board'] = board

# --- ideaboard ---
ideaboard = types.ModuleType('ideaboard')
class _Motor:
    def __init__(self, idx): self._i = idx; self._t = 0.0
    @property
    def throttle(self): return self._t
    @throttle.setter
    def throttle(self, v):
        self._t = v; _sumo.setMotor(self._i, float(v))
class _AnalogIn:
    def __init__(self, pin): self._pin = int(pin)
    @property
    def value(self): return int(_sumo.getIR(self._pin))
class IdeaBoard:
    def __init__(self):
        self.motor_1 = _Motor(0)   # rueda izquierda
        self.motor_2 = _Motor(1)   # rueda derecha
        self._pixel = (0, 0, 0)
    def AnalogIn(self, pin): return _AnalogIn(pin)
    @property
    def pixel(self): return self._pixel
    @pixel.setter
    def pixel(self, c):
        self._pixel = c
        try: _sumo.setPixel(int(c[0]), int(c[1]), int(c[2]))
        except Exception: pass
    # sonar por nombre — no existe en el real, pero es un alias pedagógico útil
    @property
    def sonar(self): return float(_sumo.getUltra())
ideaboard.IdeaBoard = IdeaBoard
sys.modules['ideaboard'] = ideaboard

# --- hcsr04 ---
hcsr04 = types.ModuleType('hcsr04')
class HCSR04:
    def __init__(self, trig, echo): pass
    def dist_cm(self): return float(_sumo.getUltra())
hcsr04.HCSR04 = HCSR04
sys.modules['hcsr04'] = hcsr04

# --- time.sleep cooperativo ---
import time as _t
_t.sleep = lambda s: _sumo.sleep(float(s))
`;

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    ctrl = new Int32Array(m.sab, 0, 8);
    intb = new Uint8Array(m.sab, 32, 8);
    data = new Float64Array(m.sab, 64, 16);
    installSumoApi();
    try {
      pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/' });
      pyodide.setInterruptBuffer(intb);
      pyodide.setStdout({ batched: (s) => postMessage({ type: 'log', text: s }) });
      pyodide.setStderr({ batched: (s) => postMessage({ type: 'log', text: s, err: true }) });
      pyodide.runPython(SHIM_PY);
      postMessage({ type: 'ready' });
    } catch (err) {
      postMessage({ type: 'error', text: 'No se pudo cargar Pyodide: ' + (err && err.message ? err.message : err) });
    }
  } else if (m.type === 'run') {
    runUser(m.code);
  } else if (m.type === 'stop') {
    // STOP e intb ya fueron escritos directamente desde el hilo principal vía SAB.
    // Aquí sólo nos aseguramos por si acaso el worker no estaba en Atomics.wait.
    if (ctrl) Atomics.store(ctrl, STOP, 1);
    if (intb) intb[0] = 2;
  }
};

async function runUser(code) {
  if (!pyodide) return;
  // Capturar la generación de este run. Si llega un run más nuevo mientras
  // esperamos, su runUser incrementará runGen y nosotros nos cancelamos.
  const myGen = ++runGen;

  // Esperar a que el código anterior termine antes de limpiar los flags.
  // (Si limpiamos STOP mientras el viejo está en Atomics.wait, al despertar
  //  ya no ve STOP=1 y sigue ejecutándose junto al nuevo código.)
  const deadline = Date.now() + 2000;
  while (running && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 30));
  }

  // Si llegó un run más reciente mientras esperábamos, este ya es obsoleto.
  if (myGen !== runGen) return;

  Atomics.store(ctrl, STOP, 0);
  intb[0] = 0;
  running = true;
  postMessage({ type: 'started' });
  try {
    await pyodide.runPythonAsync(code);
    postMessage({ type: 'log', text: '[el programa terminó]' });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (msg.includes('__stop__') || msg.includes('KeyboardInterrupt')) {
      // detenido a propósito (nuevo Run o stop)
    } else {
      postMessage({ type: 'error', text: msg.split('\n').slice(-6).join('\n') });
    }
  }
  running = false;
}
