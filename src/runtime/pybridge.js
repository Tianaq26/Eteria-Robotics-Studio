// ======================================================
// pybridge.js — Puente (hilo principal) hacia el Worker de Python.
// Reparte memoria compartida: publica sensores, lee motores y avanza el reloj
// de simulación para que el `sleep` de Python progrese en tiempo de simulación.
// ======================================================
const clamp = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);

export class PyBridge {
  constructor() {
    this.sab = new SharedArrayBuffer(256);
    this.ctrl = new Int32Array(this.sab, 0, 8);   // [0]=reloj ms, [1]=stop
    this.intb = new Uint8Array(this.sab, 32, 8);  // buffer de interrupción Pyodide
    this.data = new Float64Array(this.sab, 64, 16); // [0]m1 [1]m2 [2..5]IR [6]ultra [7..9]pixel
    this.worker = null;
    this.ready = false;
    this.clock = 0;
    this.onLog = null;
  }

  available() { return typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated; }

  /** Crea el worker y espera a que Pyodide esté listo. */
  async init(onLog) {
    if (this.worker) return;
    this.onLog = onLog;
    this.worker = new Worker(new URL('./pyworker.js', import.meta.url));
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'ready') this.ready = true;
      else if (m.type === 'log') onLog && onLog('py> ' + m.text, m.err ? 'error' : 'log');
      else if (m.type === 'error') onLog && onLog('✗ ' + m.text, 'error');
    };
    this.worker.postMessage({ type: 'init', sab: this.sab });
    onLog && onLog('Cargando Python (Pyodide)… puede tardar unos segundos la primera vez.', 'warn');
    await new Promise((res) => {
      const t = setInterval(() => { if (this.ready) { clearInterval(t); res(); } }, 50);
    });
    onLog && onLog('✓ Python listo.', 'ok');
  }

  /** (Re)ejecuta el código del usuario. Detiene el anterior primero. */
  start(code) {
    if (!this.worker) return;
    this.stop();                    // detiene el código anterior y pone motores a 0
    setTimeout(() => this.worker.postMessage({ type: 'run', code }), 250);
  }

  stop() {
    // Escribir STOP e SIGINT directamente en el SharedArrayBuffer desde el hilo
    // principal. No se puede usar postMessage porque el worker puede estar
    // bloqueado en Atomics.wait (dentro de sleep) y nunca procesaría el mensaje.
    Atomics.store(this.ctrl, 1, 1);   // ctrl[STOP] = 1
    this.intb[0] = 2;                  // SIGINT para cortes fuera de sleep
    this.data[0] = 0;                  // motores a 0
    this.data[1] = 0;
    // El postMessage es sólo para limpiar estado interno del worker cuando pueda
    if (this.worker) this.worker.postMessage({ type: 'stop' });
  }

  /** Escribe los sensores del robot A en memoria compartida (blanco=valor bajo). */
  publishSensors(s) {
    const WHITE = 500, BLACK = 60000;
    this.data[2] = s.border.frontLeft ? WHITE : BLACK;
    this.data[3] = s.border.frontRight ? WHITE : BLACK;
    this.data[4] = s.border.backLeft ? WHITE : BLACK;
    this.data[5] = s.border.backRight ? WHITE : BLACK;
    this.data[6] = s.enemy.detected ? s.enemy.distance : -1; // -1 = nada (como el robot real)
  }

  /** Lee los motores que Python fijó. motor_1=izquierda, motor_2=derecha. */
  readMotors() {
    return { left: clamp(this.data[0] || 0), right: clamp(this.data[1] || 0) };
  }

  /** Avanza el reloj de simulación (ms) y despierta al sleep del worker. */
  advance(ms) {
    this.clock += ms;
    Atomics.store(this.ctrl, 0, this.clock | 0);
    Atomics.notify(this.ctrl, 0);
  }
}
