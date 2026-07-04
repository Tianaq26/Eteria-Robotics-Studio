// ======================================================
// blocks.js — pyblock 🧩 v2: editor de bloques drag & drop (Blockly +
// renderer Zelos, look Scratch moderno) que se traduce a CircuitPython real.
// El código generado usa la MISMA API que el robot (ib.motor_X.throttle,
// ib.pixel, sonar.dist_cm(), fl.value…) y se ejecuta en el worker de Python.
//
// Colores por categoría:
//   Motores #8b5cf6 · LED/Tiempo #ec4899 · Sensores #38bdf8 · Control #f97316
//   Lógica #14b8a6 · Números #22c55e · Variables #3c82f0 · Funciones #f59e0b
//
// Blockly se carga por <script> en index.html ANTES del loader AMD de Monaco
// (si no, su UMD se registraría como módulo AMD y no habría global Blockly).
// ======================================================

const STORAGE_KEY = 'sumobloques_workspace_v2';

const COL = {
  inicio:    '#eab308',
  motores:   '#8b5cf6',
  led:       '#ec4899',
  sensores:  '#38bdf8',
  control:   '#f97316',
  logica:    '#14b8a6',
  numeros:   '#22c55e',
  variables: '#3c82f0',
  funciones: '#f59e0b',
};

// Cabecera CircuitPython idéntica a la plantilla oficial: los bloques solo
// generan el cuerpo del programa.
const PREAMBULO = `# Sumobot — generado con pyblock 🧩 (CircuitPython — robot real)
import board
from ideaboard import IdeaBoard
from time import sleep
from hcsr04 import HCSR04

ib = IdeaBoard()
sonar = HCSR04(board.IO25, board.IO26)
fl = ib.AnalogIn(board.IO36)
fr = ib.AnalogIn(board.IO39)
bl = ib.AnalogIn(board.IO34)
br = ib.AnalogIn(board.IO35)
BLANCO = 3000

def en_borde():
    return fl.value < BLANCO or fr.value < BLANCO or bl.value < BLANCO or br.value < BLANCO

`;

let ws = null;          // workspace Blockly
let container = null;
let pyGen = null;       // generador Python de Blockly
let currentMission = null;
let guideCollapsed = false;
let OrderNone = 99;     // python.Order.NONE (fallback numérico)

// ── Definición de bloques personalizados ─────────────────────────────────────

function definirBloques(Blockly) {
  Blockly.defineBlocksWithJsonArray([
    // ── Inicio del programa: todo lo que NO esté conectado debajo de este
    // bloque se ignora al generar el código (evita que bloques sueltos o
    // desordenados se ejecuten sin que el estudiante se dé cuenta). ──
    {
      type: 'sumo_inicio',
      message0: '▶ INICIO',
      nextStatement: null,
      hat: 'cap',
      colour: COL.inicio,
      tooltip: 'Todo el programa se ejecuta conectando bloques debajo de este. ' +
        'Los bloques sueltos (no conectados a INICIO) se ignoran y no corren.',
    },

    // ── Motores (funciones predeterminadas con parámetros) ──
    {
      type: 'sumo_avanzar',
      message0: '🚗 ir %1 a velocidad %2',
      args0: [
        { type: 'field_dropdown', name: 'DIR', options: [['⬆ adelante', '1'], ['⬇ atrás', '-1']] },
        { type: 'input_value', name: 'VEL', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null, colour: COL.motores,
      tooltip: 'Pone ambos motores a la misma velocidad (0 a 1). Genera: ib.motor_1.throttle = v',
    },
    {
      type: 'sumo_girar',
      message0: '🔄 girar %1 a velocidad %2',
      args0: [
        { type: 'field_dropdown', name: 'DIR', options: [['⬅ izquierda', 'IZQ'], ['➡ derecha', 'DER']] },
        { type: 'input_value', name: 'VEL', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null, colour: COL.motores,
      tooltip: 'Gira sobre su eje: una rueda adelante y la otra atrás.',
    },
    {
      type: 'sumo_throttle',
      message0: '⚙ %1 .throttle = %2',
      args0: [
        { type: 'field_dropdown', name: 'MOTOR', options: [['motor_1 (izquierdo)', 'motor_1'], ['motor_2 (derecho)', 'motor_2']] },
        { type: 'input_value', name: 'VEL', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null, colour: COL.motores,
      tooltip: 'Control directo de un motor, igual que en CircuitPython: ib.motor_1.throttle = valor (-1 a 1)',
    },
    {
      type: 'sumo_detener',
      message0: '🛑 detener motores',
      previousStatement: null, nextStatement: null, colour: COL.motores,
      tooltip: 'Pone los dos motores en 0.',
    },

    // ── LED y tiempo ──
    {
      type: 'sumo_pixel',
      message0: '💡 ib.pixel = ( R %1 G %2 B %3 )',
      args0: [
        { type: 'input_value', name: 'R', check: 'Number' },
        { type: 'input_value', name: 'G', check: 'Number' },
        { type: 'input_value', name: 'B', check: 'Number' },
      ],
      inputsInline: true,
      previousStatement: null, nextStatement: null, colour: COL.led,
      tooltip: 'Color del LED RGB, valores 0-255.',
    },
    {
      type: 'sumo_sleep',
      message0: '⏱ esperar %1 segundos',
      args0: [{ type: 'input_value', name: 'T', check: 'Number' }],
      previousStatement: null, nextStatement: null, colour: COL.led,
      tooltip: 'sleep(segundos) — pausa cooperativa, igual que en el robot real.',
    },

    // ── Sensores ──
    {
      type: 'sumo_print',
      message0: 'print %1',
      args0: [{ type: 'input_value', name: 'MSG' }],
      previousStatement: null, nextStatement: null, colour: COL.led,
      tooltip: 'Muestra un mensaje en la consola. Genera: print("mensaje")',
    },

    {
      type: 'sumo_en_borde',
      message0: '⚠ ¿línea blanca? en_borde()',
      output: 'Boolean', colour: COL.sensores,
      tooltip: 'True si cualquier sensor IR ve la línea blanca del borde.',
    },
    {
      type: 'sumo_ir_sensor',
      message0: '¿línea blanca en %1 ?',
      args0: [{
        type: 'field_dropdown', name: 'SENSOR',
        options: [
          ['↖ frontal-izq (fl)', 'fl'], ['↗ frontal-der (fr)', 'fr'],
          ['↙ trasero-izq (bl)', 'bl'], ['↘ trasero-der (br)', 'br'],
        ],
      }],
      output: 'Boolean', colour: COL.sensores,
      tooltip: 'Un sensor IR concreto. Genera: fl.value < BLANCO',
    },
    {
      type: 'sumo_distancia',
      message0: '📡 distancia sonar.dist_cm()',
      output: 'Number', colour: COL.sensores,
      tooltip: 'Distancia al rival en cm (-1 si no ve nada).',
    },
    {
      type: 'sumo_veo_rival',
      message0: '👀 ¿rival a menos de %1 cm?',
      args0: [{ type: 'input_value', name: 'DIST', check: 'Number' }],
      output: 'Boolean', colour: COL.sensores,
      tooltip: 'True si el ultrasónico ve algo más cerca que esa distancia. Genera: 0 < sonar.dist_cm() < X',
    },

    // ── Control ──
    {
      type: 'sumo_por_siempre',
      message0: '🔁 por siempre %1 %2',
      args0: [
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'HACER' },
      ],
      previousStatement: null, colour: COL.control,
      tooltip: 'El bucle principal del robot: while True. Añade un pequeño sleep automático al final de cada vuelta.',
    },
  ]);
}

// ── Generadores CircuitPython ────────────────────────────────────────────────

function definirGeneradores(gen) {
  const val = (b, name, def) => gen.valueToCode(b, name, OrderNone) || def;

  // El bloque INICIO no genera código propio; blockToCode ya encadena lo que
  // esté conectado debajo vía "next" (ver generarPython()).
  gen.forBlock['sumo_inicio'] = () => '';

  gen.forBlock['sumo_avanzar'] = (b) => {
    const v = val(b, 'VEL', '1');
    const s = b.getFieldValue('DIR') === '-1' ? `-(${v})` : `(${v})`;
    return `ib.motor_1.throttle = ${s}\nib.motor_2.throttle = ${s}\n`;
  };
  gen.forBlock['sumo_girar'] = (b) => {
    const v = val(b, 'VEL', '0.5');
    const izq = b.getFieldValue('DIR') === 'IZQ';
    return `ib.motor_1.throttle = ${izq ? `-(${v})` : `(${v})`}\n` +
           `ib.motor_2.throttle = ${izq ? `(${v})` : `-(${v})`}\n`;
  };
  gen.forBlock['sumo_throttle'] = (b) =>
    `ib.${b.getFieldValue('MOTOR')}.throttle = ${val(b, 'VEL', '0')}\n`;
  gen.forBlock['sumo_detener'] = () =>
    'ib.motor_1.throttle = 0\nib.motor_2.throttle = 0\n';
  gen.forBlock['sumo_pixel'] = (b) =>
    `ib.pixel = (${val(b, 'R', '0')}, ${val(b, 'G', '0')}, ${val(b, 'B', '0')})\n`;
  gen.forBlock['sumo_sleep'] = (b) => `sleep(${val(b, 'T', '0.02')})\n`;
  gen.forBlock['sumo_print'] = (b) => `print(${val(b, 'MSG', '"Hola desde mi robot"')})\n`;
  gen.forBlock['sumo_en_borde'] = () => ['en_borde()', OrderNone];
  gen.forBlock['sumo_ir_sensor'] = (b) =>
    [`${b.getFieldValue('SENSOR')}.value < BLANCO`, OrderNone];
  gen.forBlock['sumo_distancia'] = () => ['sonar.dist_cm()', OrderNone];
  gen.forBlock['sumo_veo_rival'] = (b) =>
    [`(0 < sonar.dist_cm() < (${val(b, 'DIST', '50')}))`, OrderNone];
  gen.forBlock['sumo_por_siempre'] = (b) => {
    let body = gen.statementToCode(b, 'HACER');
    if (!body) body = gen.INDENT + 'pass\n';
    // sleep mínimo para ceder tiempo a la simulación (igual que el robot real)
    return 'while True:\n' + body + gen.INDENT + 'sleep(0.01)\n';
  };
}

// ── Toolbox (paleta por categorías de colores) ───────────────────────────────

const num = (n) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });
const txt = (s) => ({ shadow: { type: 'text', fields: { TEXT: s } } });

function toolbox() {
  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category', name: '🚗 Motores', colour: COL.motores,
        contents: [
          { kind: 'block', type: 'sumo_avanzar',  inputs: { VEL: num(1) } },
          { kind: 'block', type: 'sumo_girar',    inputs: { VEL: num(0.5) } },
          { kind: 'block', type: 'sumo_throttle', inputs: { VEL: num(1) } },
          { kind: 'block', type: 'sumo_detener' },
        ],
      },
      {
        kind: 'category', name: '💡 LED y tiempo', colour: COL.led,
        contents: [
          { kind: 'block', type: 'sumo_pixel', inputs: { R: num(255), G: num(0), B: num(0) } },
          { kind: 'block', type: 'sumo_sleep', inputs: { T: num(0.2) } },
          { kind: 'block', type: 'sumo_print', inputs: { MSG: txt('Hola desde mi robot') } },
        ],
      },
      {
        kind: 'category', name: '👀 Sensores', colour: COL.sensores,
        contents: [
          { kind: 'block', type: 'sumo_veo_rival', inputs: { DIST: num(50) } },
          { kind: 'block', type: 'sumo_en_borde' },
          { kind: 'block', type: 'sumo_ir_sensor' },
          { kind: 'block', type: 'sumo_distancia' },
        ],
      },
      {
        kind: 'category', name: '🔁 Control', colour: COL.control,
        contents: [
          { kind: 'block', type: 'sumo_inicio' },
          { kind: 'block', type: 'sumo_por_siempre' },
          { kind: 'block', type: 'controls_if' },
          { kind: 'block', type: 'controls_if', extraState: { hasElse: true } },
          { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: num(10) } },
          { kind: 'block', type: 'controls_whileUntil' },
        ],
      },
      {
        kind: 'category', name: '⚖ Lógica', colour: COL.logica,
        contents: [
          { kind: 'block', type: 'logic_compare' },
          { kind: 'block', type: 'logic_operation' },
          { kind: 'block', type: 'logic_negate' },
          { kind: 'block', type: 'logic_boolean' },
        ],
      },
      {
        kind: 'category', name: '🔢 Números', colour: COL.numeros,
        contents: [
          { kind: 'block', type: 'math_number' },
          { kind: 'block', type: 'math_arithmetic', inputs: { A: num(1), B: num(1) } },
          { kind: 'block', type: 'math_random_int', inputs: { FROM: num(1), TO: num(10) } },
        ],
      },
      { kind: 'category', name: '📦 Variables', colour: COL.variables, custom: 'VARIABLE' },
      { kind: 'category', name: '⭐ Funciones', colour: COL.funciones, custom: 'PROCEDURE' },
    ],
  };
}

// ── Programa inicial (mismo comportamiento que la plantilla Python) ─────────

function programaInicial() {
  const encadenar = (bloques) => {
    for (let i = bloques.length - 2; i >= 0; i--) bloques[i].next = { block: bloques[i + 1] };
    return bloques[0];
  };
  return {
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: 'sumo_inicio', x: 40, y: 40,
        next: {
          block: {
            type: 'sumo_por_siempre',
            inputs: {
              HACER: {
                block: {
                  type: 'controls_if',
                  extraState: { elseIfCount: 1, hasElse: true },
                  inputs: {
                    IF0: { block: { type: 'sumo_en_borde' } },
                    DO0: {
                      block: encadenar([
                        { type: 'sumo_pixel',   inputs: { R: num(255), G: num(0), B: num(0) } },
                        { type: 'sumo_avanzar', fields: { DIR: '-1' }, inputs: { VEL: num(1) } },
                        { type: 'sumo_sleep',   inputs: { T: num(0.2) } },
                      ]),
                    },
                    IF1: { block: { type: 'sumo_veo_rival', inputs: { DIST: num(50) } } },
                    DO1: {
                      block: encadenar([
                        { type: 'sumo_pixel',   inputs: { R: num(0), G: num(255), B: num(0) } },
                        { type: 'sumo_avanzar', fields: { DIR: '1' }, inputs: { VEL: num(1) } },
                      ]),
                    },
                    ELSE: {
                      block: encadenar([
                        { type: 'sumo_pixel', inputs: { R: num(0), G: num(0), B: num(255) } },
                        { type: 'sumo_girar', fields: { DIR: 'DER' }, inputs: { VEL: num(0.5) } },
                      ]),
                    },
                  },
                },
              },
            },
          },
        },
      }],
    },
  };
}

// ── Bloque INICIO: migración + aviso visual de bloques sueltos ──────────────

/** Espacios de trabajo guardados antes de que existiera el bloque INICIO: si no hay
 * ninguno, se crea uno y se conecta la primera pila de bloques sueltos debajo. */
function migrarBloqueInicio(workspace) {
  const tieneInicio = workspace.getAllBlocks(false).some(b => b.type === 'sumo_inicio');
  if (tieneInicio) return;
  const top = workspace.getTopBlocks(true)[0];
  const inicio = workspace.newBlock('sumo_inicio');
  inicio.initSvg();
  inicio.render();
  if (top) {
    const xy = top.getRelativeToSurfaceXY();
    inicio.moveBy(xy.x - 20, xy.y - 60);
    if (inicio.nextConnection && top.previousConnection) inicio.nextConnection.connect(top.previousConnection);
  } else {
    inicio.moveBy(40, 40);
  }
}

/** Marca con una advertencia visual cualquier bloque de nivel superior que NO sea
 * (ni esté conectado a) INICIO: esos bloques se dibujan pero no se ejecutan. */
function marcarBloquesSueltos(workspace) {
  for (const top of workspace.getTopBlocks(false)) {
    if (top.type === 'sumo_inicio') { top.setWarningText(null); continue; }
    top.setWarningText('⚠ Bloque suelto: no está conectado a INICIO, así que no se ejecuta.');
  }
}

// ── Tema oscuro ──────────────────────────────────────────────────────────────

function crearTema(Blockly) {
  return Blockly.Theme.defineTheme('sumo-dark', {
    base: Blockly.Themes.Classic,
    blockStyles: {
      logic_blocks:            { colourPrimary: COL.logica },
      loop_blocks:             { colourPrimary: COL.control },
      math_blocks:             { colourPrimary: COL.numeros },
      variable_blocks:         { colourPrimary: COL.variables },
      variable_dynamic_blocks: { colourPrimary: COL.variables },
      procedure_blocks:        { colourPrimary: COL.funciones },
    },
    categoryStyles: {},
    componentStyles: {
      workspaceBackgroundColour: '#101018',
      toolboxBackgroundColour:   '#15151e',
      toolboxForegroundColour:   '#dcdce8',
      flyoutBackgroundColour:    '#1a1a25',
      flyoutForegroundColour:    '#dcdce8',
      flyoutOpacity:             0.97,
      scrollbarColour:           '#2e2e3e',
      scrollbarOpacity:          0.6,
      insertionMarkerColour:     '#3c82f0',
      insertionMarkerOpacity:    0.5,
      markerColour:              '#3c82f0',
      cursorColour:              '#3c82f0',
    },
    fontStyle: { family: 'system-ui, sans-serif', size: 11 },
  });
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Crea (una sola vez) el workspace Blockly dentro de `el`.
 * Llamar cuando el contenedor ya sea visible (Blockly necesita medidas reales).
 * @returns {boolean} true si el editor quedó listo
 */
export function ensureBlocksEditor(el) {
  if (ws) { window.Blockly.svgResize(ws); return true; }
  container = el;

  const Blockly = window.Blockly;
  const pyNs = window.python; // python_compressed.js (UMD global)
  if (!Blockly || !pyNs || !pyNs.pythonGenerator) {
    el.innerHTML = '<div style="padding:24px;color:var(--err);font-size:12px;line-height:1.6">' +
      'No se pudo cargar Blockly desde el CDN.<br>Revisa tu conexión a internet y recarga la página.</div>';
    return false;
  }
  pyGen = pyNs.pythonGenerator;
  OrderNone = (pyNs.Order && pyNs.Order.NONE != null) ? pyNs.Order.NONE : 99;
  pyGen.INDENT = '    ';

  definirBloques(Blockly);
  definirGeneradores(pyGen);

  el.innerHTML =
    '<div id="sbWorkspace"></div>' +
    '<aside id="sbGuide" class="sb-guide"></aside>' +
    '<div id="sbPreview" class="sb-preview">' +
      '<div class="sb-preview-head">🐍 CircuitPython generado' +
        '<button id="sbPreviewClose" title="Cerrar">✕</button></div>' +
      '<pre id="sbPreviewCode"></pre>' +
    '</div>' +
    '<button id="sbPreviewBtn" class="sb-preview-btn" title="Ver el CircuitPython que generan tus bloques">🐍 Ver código</button>';

  ws = Blockly.inject(el.querySelector('#sbWorkspace'), {
    renderer: 'zelos',
    theme: crearTema(Blockly),
    toolbox: toolbox(),
    grid: { spacing: 24, length: 3, colour: '#1e1e2a', snap: true },
    zoom: { controls: true, wheel: true, startScale: 0.75, minScale: 0.4, maxScale: 1.6, pinch: true },
    move: { scrollbars: true, drag: true, wheel: false },
    trashcan: true,
    sounds: false,
  });

  // Cargar programa guardado o el inicial
  let cargado = false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { Blockly.serialization.workspaces.load(JSON.parse(raw), ws); cargado = true; }
  } catch (_) {}
  if (!cargado) Blockly.serialization.workspaces.load(programaInicial(), ws);
  migrarBloqueInicio(ws); // espacios guardados antes de v3: añade INICIO si falta
  marcarBloquesSueltos(ws);
  renderPyblockGuidePanel();

  // Guardar cambios + refrescar vista de código (debounce)
  let t = null;
  ws.addChangeListener((ev) => {
    if (ev.isUiEvent) return;
    marcarBloquesSueltos(ws);
    clearTimeout(t);
    t = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Blockly.serialization.workspaces.save(ws))); } catch (_) {}
      const pre = el.querySelector('#sbPreviewCode');
      if (pre && el.querySelector('#sbPreview').classList.contains('open')) pre.textContent = generarPython();
    }, 350);
  });

  // Panel de vista previa de código
  const panel = el.querySelector('#sbPreview');
  el.querySelector('#sbPreviewBtn').onclick = () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open'))
      el.querySelector('#sbPreviewCode').textContent = generarPython();
  };
  el.querySelector('#sbPreviewClose').onclick = () => panel.classList.remove('open');

  // Redimensionar Blockly cuando cambie el tamaño del panel (drag handles)
  new ResizeObserver(() => { if (ws) Blockly.svgResize(ws); }).observe(el);

  return true;
}

/** CircuitPython completo: cabecera oficial + SOLO el código conectado bajo el
 * bloque INICIO (cualquier otro bloque suelto en el lienzo se ignora). */
export function generarPython() {
  if (!ws || !pyGen) return null;
  const inicios = ws.getAllBlocks(false).filter(b => b.type === 'sumo_inicio');

  if (!inicios.length) {
    return PREAMBULO + '# ⚠ Falta el bloque "▶ INICIO" — arrástralo desde Control\n' +
      '# y conecta tu programa debajo. Mientras tanto, el robot no hace nada.\npass\n';
  }
  // Si hay más de uno (el estudiante duplicó el bloque), usamos el de más arriba
  // a la izquierda para que el resultado sea predecible.
  inicios.sort((a, b) => {
    const pa = a.getRelativeToSurfaceXY(), pb = b.getRelativeToSurfaceXY();
    return pa.y - pb.y || pa.x - pb.x;
  });

  let cuerpo = '';
  try {
    pyGen.init(ws); // requerido por Blockly antes de blockToCode (nombres de variables, etc.)
    cuerpo = pyGen.blockToCode(inicios[0]);
    if (Array.isArray(cuerpo)) cuerpo = cuerpo[0];
    cuerpo = pyGen.finish(cuerpo);
  } catch (e) {
    return PREAMBULO + '# Error generando código: ' + (e && e.message ? e.message : e) + '\n';
  }
  cuerpo = cuerpo.replace(/^\s*\n/, '').replace(/\n{3,}/g, '\n\n'); // limpieza que workspaceToCode hace normalmente
  if (!cuerpo.trim()) cuerpo = '# (conecta bloques debajo de INICIO)\npass\n';
  if (inicios.length > 1) {
    cuerpo = '# ⚠ Hay ' + inicios.length + ' bloques INICIO — solo se ejecuta el de más arriba.\n' + cuerpo;
  }
  return PREAMBULO + cuerpo;
}

/** Resumen corto para la consola. */
export function resumenBloques() {
  if (!ws) return '0 bloques';
  const n = ws.getAllBlocks(false).length;
  return n + ' bloque' + (n === 1 ? '' : 's');
}

/** Serializa el workspace actual (para guardarlo dentro de un proyecto .sumo). */
export function getWorkspaceJson() {
  if (!ws || !window.Blockly) return null;
  return window.Blockly.serialization.workspaces.save(ws);
}

/** Carga un workspace serializado (de un proyecto .sumo) reemplazando el actual. */
export function loadWorkspaceJson(json) {
  if (!ws || !window.Blockly || !json) return false;
  try {
    ws.clear();
    window.Blockly.serialization.workspaces.load(json, ws);
    migrarBloqueInicio(ws);
    marcarBloquesSueltos(ws);
    return true;
  } catch (_) {
    return false;
  }
}

// ── Guía educativa por misión ──────────────────────────────────────────────

const BLOCK_LABELS = {
  sumo_inicio: { name: '▶ INICIO', category: 'Control' },
  sumo_por_siempre: { name: 'por siempre', category: 'Control' },
  controls_if: { name: 'si / si no', category: 'Control' },
  sumo_avanzar: { name: 'ir adelante/atrás', category: 'Motores' },
  sumo_girar: { name: 'girar', category: 'Motores' },
  sumo_throttle: { name: 'motor .throttle', category: 'Motores' },
  sumo_detener: { name: 'detener motores', category: 'Motores' },
  sumo_pixel: { name: 'ib.pixel', category: 'LED y tiempo' },
  sumo_sleep: { name: 'esperar', category: 'LED y tiempo' },
  sumo_print: { name: 'print', category: 'LED y tiempo' },
  sumo_en_borde: { name: '¿línea blanca?', category: 'Sensores' },
  sumo_ir_sensor: { name: 'sensor IR individual', category: 'Sensores' },
  sumo_veo_rival: { name: '¿rival a menos de X cm?', category: 'Sensores' },
  sumo_distancia: { name: 'distancia sonar', category: 'Sensores' },
  logic_compare: { name: 'comparar números', category: 'Lógica' },
  logic_operation: { name: 'y / o', category: 'Lógica' },
  math_number: { name: 'número', category: 'Números' },
};

const unique = (items) => [...new Set(items.filter(Boolean))];
const blockInfo = (type) => BLOCK_LABELS[type] || { name: type, category: 'Bloques' };
const step = (title, detail, blocks = []) => ({ title, detail, blocks });

const BLOCK_HELP = {
  sumo_inicio: 'Marca el inicio. Solo lo conectado debajo se ejecuta.',
  sumo_por_siempre: 'Repite las instrucciones todo el tiempo, como while True.',
  controls_if: 'Permite decidir: si pasa algo, haz una cosa; si no, haz otra.',
  sumo_avanzar: 'Mueve los dos motores a la vez para avanzar o retroceder.',
  sumo_girar: 'Hace que una rueda empuje distinto para buscar o esquivar.',
  sumo_pixel: 'Cambia el color del LED RGB para mostrar el estado del robot.',
  sumo_sleep: 'Pausa un instante para que una accion dure tiempo suficiente.',
  sumo_print: 'Escribe mensajes en la consola para entender que esta haciendo tu robot.',
  sumo_en_borde: 'Detecta si algun sensor IR ve la linea blanca del borde.',
  sumo_ir_sensor: 'Lee un sensor IR especifico: frontal o trasero, izquierda o derecha.',
  sumo_veo_rival: 'Usa el sonar para saber si hay un rival cerca.',
  sumo_distancia: 'Devuelve la distancia medida por el sonar en centimetros.',
  math_number: 'Valor numerico para velocidades, colores, tiempos y distancias.',
  logic_compare: 'Compara valores, por ejemplo distancia menor que 40.',
  logic_operation: 'Une condiciones con y / o.',
};

const MISSION_SEQUENCE = ['0.1', '0.2', '0.3', '0.4', '1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '3.1', '3.2', '3.3', '4.1', '4.2', '4.3', '5.1', '5.2', '5.3', '6.1', '6.2', '6.3'];

function chainBlocks(bloques) {
  for (let i = bloques.length - 2; i >= 0; i--) bloques[i].next = { block: bloques[i + 1] };
  return bloques[0];
}

function startProgram(innerBlock) {
  return {
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: 'sumo_inicio', x: 40, y: 40,
        next: innerBlock ? { block: innerBlock } : undefined,
      }],
    },
  };
}

function simpleLoop(actions) {
  return startProgram({
    type: 'sumo_por_siempre',
    inputs: { HACER: { block: chainBlocks(actions) } },
  });
}

function borderAttackSearchTemplate() {
  return startProgram({
    type: 'sumo_por_siempre',
    inputs: {
      HACER: {
        block: {
          type: 'controls_if',
          extraState: { elseIfCount: 1, hasElse: true },
          inputs: {
            IF0: { block: { type: 'sumo_en_borde' } },
            DO0: { block: chainBlocks([
              { type: 'sumo_pixel', inputs: { R: num(255), G: num(0), B: num(0) } },
              { type: 'sumo_avanzar', fields: { DIR: '-1' }, inputs: { VEL: num(0.7) } },
              { type: 'sumo_sleep', inputs: { T: num(0.2) } },
            ]) },
            IF1: { block: { type: 'sumo_veo_rival', inputs: { DIST: num(40) } } },
            DO1: { block: chainBlocks([
              { type: 'sumo_pixel', inputs: { R: num(0), G: num(255), B: num(0) } },
              { type: 'sumo_avanzar', fields: { DIR: '1' }, inputs: { VEL: num(1) } },
            ]) },
            ELSE: { block: chainBlocks([
              { type: 'sumo_pixel', inputs: { R: num(0), G: num(0), B: num(255) } },
              { type: 'sumo_girar', fields: { DIR: 'DER' }, inputs: { VEL: num(0.5) } },
            ]) },
          },
        },
      },
    },
  });
}

function irEdgeTemplate() {
  return startProgram({
    type: 'sumo_por_siempre',
    inputs: {
      HACER: {
        block: {
          type: 'controls_if',
          extraState: { hasElse: true },
          inputs: {
            IF0: { block: { type: 'sumo_en_borde' } },
            DO0: { block: chainBlocks([
              { type: 'sumo_pixel', inputs: { R: num(255), G: num(0), B: num(0) } },
              { type: 'sumo_avanzar', fields: { DIR: '-1' }, inputs: { VEL: num(0.8) } },
              { type: 'sumo_sleep', inputs: { T: num(0.2) } },
            ]) },
            ELSE: { block: chainBlocks([
              { type: 'sumo_pixel', inputs: { R: num(0), G: num(255), B: num(0) } },
              { type: 'sumo_avanzar', fields: { DIR: '1' }, inputs: { VEL: num(0.5) } },
            ]) },
          },
        },
      },
    },
  });
}

function sonarTemplate() {
  return startProgram({
    type: 'sumo_por_siempre',
    inputs: {
      HACER: {
        block: {
          type: 'controls_if',
          extraState: { hasElse: true },
          inputs: {
            IF0: { block: { type: 'sumo_veo_rival', inputs: { DIST: num(40) } } },
            DO0: { block: chainBlocks([
              { type: 'sumo_pixel', inputs: { R: num(0), G: num(255), B: num(0) } },
              { type: 'sumo_avanzar', fields: { DIR: '1' }, inputs: { VEL: num(1) } },
            ]) },
            ELSE: { block: chainBlocks([
              { type: 'sumo_pixel', inputs: { R: num(0), G: num(0), B: num(255) } },
              { type: 'sumo_girar', fields: { DIR: 'DER' }, inputs: { VEL: num(0.6) } },
            ]) },
          },
        },
      },
    },
  });
}

function templateForMission(mission) {
  const id = mission && mission.id;
  if (id === '0.1') return simpleLoop([
    { type: 'sumo_avanzar', fields: { DIR: '1' }, inputs: { VEL: num(0.7) } },
  ]);
  if (id === '0.2') return simpleLoop([
    { type: 'sumo_girar', fields: { DIR: 'DER' }, inputs: { VEL: num(0.5) } },
  ]);
  if (id === '0.3') return simpleLoop([
    { type: 'sumo_pixel', inputs: { R: num(255), G: num(0), B: num(0) } },
    { type: 'sumo_sleep', inputs: { T: num(0.2) } },
  ]);
  if (id === '0.4') return simpleLoop([
    { type: 'sumo_print', inputs: { MSG: txt('Hola desde mi robot') } },
    { type: 'sumo_print', inputs: { MSG: txt('Estoy aprendiendo pyblock') } },
    { type: 'sumo_sleep', inputs: { T: num(1) } },
  ]);
  if (id === '1.1') return irEdgeTemplate();
  if (id === '1.2') return sonarTemplate();
  if (id && id.startsWith('1.')) return borderAttackSearchTemplate();
  if (id && id.startsWith('2.')) return borderAttackSearchTemplate();
  if (id && id.startsWith('3.')) return borderAttackSearchTemplate();
  if (id && id.startsWith('4.')) return borderAttackSearchTemplate();
  if (id && id.startsWith('5.')) return borderAttackSearchTemplate();
  if (id && id.startsWith('6.')) return borderAttackSearchTemplate();
  return programaInicial();
}

const GUIDE_BY_ID = {
  '0.1': {
    title: 'Primer movimiento con bloques',
    intro: 'Arma una pila pequeña: INICIO, un bucle por siempre y un bloque de motores.',
    steps: [
      step('Pon el bloque base', 'Arrastra ▶ INICIO desde Control. Todo lo conectado debajo será tu programa.', ['sumo_inicio']),
      step('Haz que se repita', 'Conecta por siempre debajo de INICIO. El robot revisa esa pila una y otra vez.', ['sumo_por_siempre']),
      step('Mueve ambos motores', 'Dentro de por siempre, coloca ir adelante a velocidad 0.7 o 1.', ['sumo_avanzar', 'math_number']),
      step('Prueba y observa', 'Pulsa Probar. Si el robot no se mueve, revisa que el bloque esté conectado bajo INICIO.', ['sumo_inicio', 'sumo_avanzar']),
    ],
  },
  '0.2': {
    title: 'Girar sin escribir código',
    intro: 'Para girar, un motor empuja hacia adelante y el otro hacia atrás. El bloque girar hace eso por ti.',
    steps: [
      step('Empieza desde INICIO', 'Usa ▶ INICIO y por siempre como estructura del programa.', ['sumo_inicio', 'sumo_por_siempre']),
      step('Agrega un giro', 'Dentro del bucle, usa girar derecha o izquierda a velocidad 0.5.', ['sumo_girar', 'math_number']),
      step('Ajusta la velocidad', 'Sube el número si gira poco, bájalo si gira demasiado rápido.', ['math_number']),
    ],
  },
  '0.3': {
    title: 'Encender el LED',
    intro: 'El LED usa tres números: rojo, verde y azul. 0 apaga un color; 255 lo enciende fuerte.',
    steps: [
      step('Crea la estructura', 'Coloca ▶ INICIO y por siempre.', ['sumo_inicio', 'sumo_por_siempre']),
      step('Pon un color', 'Arrastra ib.pixel y cambia R, G, B. Prueba 255, 0, 0 para rojo.', ['sumo_pixel', 'math_number']),
      step('Dale tiempo al ojo', 'Agrega esperar 0.2 segundos para que el color sea fácil de ver.', ['sumo_sleep']),
    ],
  },
};

GUIDE_BY_ID['0.4'] = {
  title: 'Mostrar mensajes con print',
  intro: 'Esta mision es de consola: el objetivo es que tu robot escriba mensajes para que puedas entenderlo.',
  steps: [
    step('Crea la estructura', 'Usa INICIO y por siempre si quieres que el mensaje se repita durante la prueba.', ['sumo_inicio', 'sumo_por_siempre']),
    step('Agrega print', 'Arrastra el bloque print desde LED y tiempo y cambia el texto.', ['sumo_print']),
    step('Imprime mas de una linea', 'Usa dos bloques print con mensajes distintos para ganar mas estrellas.', ['sumo_print']),
    step('Evita saturar la consola', 'Agrega esperar 1 segundo despues de imprimir para que los mensajes sean legibles.', ['sumo_sleep']),
  ],
};

GUIDE_BY_ID['1.1'] = {
  title: 'Detectar el borde con infrarrojo',
  intro: 'Esta mision se centra en sensores IR: si aparece linea blanca, retrocede; si no, avanza con cuidado.',
  steps: [
    step('Crea la estructura', 'Usa INICIO y por siempre para que el robot revise el piso todo el tiempo.', ['sumo_inicio', 'sumo_por_siempre']),
    step('Pregunta por la linea blanca', 'Pon un si / si no y usa el bloque ¿linea blanca? como condicion.', ['controls_if', 'sumo_en_borde']),
    step('Escapa cuando haya borde', 'En la parte si, pon LED rojo, retrocede y espera un momento.', ['sumo_pixel', 'sumo_avanzar', 'sumo_sleep']),
    step('Avanza si esta seguro', 'En si no, pon LED verde y avanza a velocidad media.', ['sumo_pixel', 'sumo_avanzar']),
  ],
};

GUIDE_BY_ID['1.2'] = {
  title: 'Atacar con sonar',
  intro: 'Esta mision es de sonar. No necesitas infrarrojo para resolver el objetivo: decide entre atacar o buscar.',
  steps: [
    step('Crea la estructura', 'Usa INICIO y por siempre para leer el sonar muchas veces por segundo.', ['sumo_inicio', 'sumo_por_siempre']),
    step('Pregunta si ve rival', 'Pon un si / si no y usa ¿rival a menos de 40 cm? como condicion.', ['controls_if', 'sumo_veo_rival', 'math_number']),
    step('Ataca cuando lo veas', 'En la parte si, LED verde e ir adelante a velocidad 1.', ['sumo_pixel', 'sumo_avanzar']),
    step('Busca cuando no lo veas', 'En si no, LED azul y girar para encontrar al rival.', ['sumo_pixel', 'sumo_girar']),
  ],
};

function genericGuide(mission) {
  const criterios = (mission && mission.estrellas || []).map(e => e.criterio && e.criterio.tipo);
  const text = ((mission && mission.objetivo) || '') + ' ' + ((mission && mission.concepto) || '') + ' ' + ((mission && mission.narrativa) || '');
  const lower = text.toLowerCase();
  const needsBorder = /borde|ir|infrarrojo|linea|lÃ­nea|blanco/.test(lower);
  const needsSonar = /sonar|ultras|rival|distancia/.test(lower);
  const needsDistance = criterios.includes('distancia_minima');
  const needsTurn = criterios.includes('angulo_minimo');
  const needsPixel = criterios.some(t => t && t.startsWith('pixel'));
  const needsConsole = criterios.some(t => t && t.startsWith('consola'));
  const blocks = ['sumo_inicio', 'sumo_por_siempre'];
  const steps = [
    step('Estructura primero', 'Todo programa pyblock empieza con ▶ INICIO y un por siempre conectado debajo.', ['sumo_inicio', 'sumo_por_siempre']),
  ];

  if (needsBorder) {
    blocks.push('controls_if', 'sumo_en_borde', 'sumo_avanzar', 'sumo_sleep');
    steps.push(step('Protege el borde', 'Usa si ¿línea blanca? para retroceder antes de atacar. Esta condición debe ir primero.', ['controls_if', 'sumo_en_borde', 'sumo_avanzar']));
  }
  if (needsSonar) {
    blocks.push('sumo_veo_rival', 'sumo_girar');
    steps.push(step('Busca al rival', 'Agrega otra condición: si ¿rival a menos de 40 cm?, avanza; si no, gira buscando.', ['sumo_veo_rival', 'sumo_avanzar', 'sumo_girar']));
  } else if (needsTurn) {
    blocks.push('sumo_girar', 'math_number');
    steps.push(step('Hazlo girar', 'Coloca girar dentro del bucle y ajusta el número de velocidad.', ['sumo_girar', 'math_number']));
  } else if (needsDistance) {
    blocks.push('sumo_avanzar', 'math_number');
    steps.push(step('Hazlo avanzar', 'Coloca ir adelante y usa una velocidad entre 0.5 y 1.', ['sumo_avanzar', 'math_number']));
  }
  if (needsPixel) {
    blocks.push('sumo_pixel');
    steps.push(step('Comunica con color', 'Usa ib.pixel para mostrar el estado: rojo para borde, verde para ataque, azul para búsqueda.', ['sumo_pixel']));
  }

  if (needsConsole) {
    blocks.push('sumo_print', 'sumo_sleep');
    steps.push(step('Muestra mensajes', 'Usa print para escribir en la consola y esperar para que no se llene demasiado rapido.', ['sumo_print', 'sumo_sleep']));
  }

  steps.push(step('Prueba una idea a la vez', 'Ejecuta la misión, mira qué estrella falta y cambia solo un bloque o número.', unique(blocks)));
  return {
    title: 'Bloques recomendados para esta misión',
    intro: 'Sigue esta receta de izquierda a derecha. No necesitas escribir Python para completar la misión.',
    steps,
  };
}

export function getPyblockGuide(mission) {
  const guide = (mission && GUIDE_BY_ID[mission.id]) || genericGuide(mission);
  const blockTypes = unique(guide.steps.flatMap(s => s.blocks || []));
  const blocks = blockTypes.map(type => ({ type, ...blockInfo(type) }));
  const missionIndex = mission ? MISSION_SEQUENCE.indexOf(mission.id) : -1;
  const previousTypes = missionIndex > 0
    ? unique(MISSION_SEQUENCE.slice(0, missionIndex).flatMap(id => {
        const g = GUIDE_BY_ID[id];
        return g ? g.steps.flatMap(s => s.blocks || []) : [];
      }))
    : [];
  const newBlocks = blocks
    .filter(b => !previousTypes.includes(b.type))
    .map(b => ({ ...b, help: BLOCK_HELP[b.type] || 'Bloque util para construir esta mision.' }));
  const categories = unique(blocks.map(b => b.category));
  return { ...guide, blocks, newBlocks, categories };
}

export function loadPyblockStarter(mission) {
  if (!ws || !window.Blockly) return false;
  try {
    ws.clear();
    window.Blockly.serialization.workspaces.load(templateForMission(mission), ws);
    migrarBloqueInicio(ws);
    marcarBloquesSueltos(ws);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(window.Blockly.serialization.workspaces.save(ws))); } catch (_) {}
    window.Blockly.svgResize(ws);
    renderPyblockGuidePanel();
    return true;
  } catch (_) {
    return false;
  }
}

export function setPyblockMission(mission) {
  currentMission = mission || null;
  renderPyblockGuidePanel();
}

function escHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPyblockGuidePanel() {
  if (!container) return;
  const el = container.querySelector('#sbGuide');
  if (!el) return;

  if (!currentMission) {
    el.classList.remove('open');
    el.innerHTML = '';
    return;
  }

  const guide = getPyblockGuide(currentMission);
  el.classList.add('open');
  el.classList.toggle('collapsed', guideCollapsed);

  const newBlocks = guide.newBlocks.length
    ? guide.newBlocks.map(b =>
        '<div class="sb-new-block">' +
          '<span class="sb-new-badge">Nuevo</span>' +
          '<b>' + escHtml(b.name) + '</b>' +
          '<em>' + escHtml(b.category) + '</em>' +
          '<p>' + escHtml(b.help) + '</p>' +
        '</div>'
      ).join('')
    : '<div class="sb-new-empty">En esta mision practicas bloques que ya conoces y los combinas mejor.</div>';
  const newBlockTitle = guide.newBlocks.length ? 'Bloques nuevos' : 'Bloques de repaso';

  const needed = guide.blocks.map(b =>
    '<span class="sb-block-chip">' + escHtml(b.name) + '<em>' + escHtml(b.category) + '</em></span>'
  ).join('');

  const steps = guide.steps.map((s, i) =>
    '<li>' +
      '<strong>' + (i + 1) + '. ' + escHtml(s.title) + '</strong>' +
      '<p>' + escHtml(s.detail) + '</p>' +
    '</li>'
  ).join('');

  if (guideCollapsed) {
    el.innerHTML =
      '<button class="sb-guide-toggle" id="sbGuideTab" type="button" title="Mostrar guia de bloques" aria-label="Mostrar guia de bloques">Mostrar guia</button>' +
      '<div class="sb-guide-head">' +
        '<div><span>Guia pyblock</span><h3>' + escHtml(currentMission.id + ' · ' + guide.title) + '</h3></div>' +
      '</div>';
    const toggle = el.querySelector('#sbGuideTab');
    if (toggle) toggle.onclick = () => { guideCollapsed = false; renderPyblockGuidePanel(); };
    return;
  }

  el.innerHTML =
    '<button class="sb-guide-toggle" id="sbGuideTab" type="button" title="Ocultar guia de bloques" aria-label="Ocultar guia de bloques">Ocultar guia</button>' +
    '<div class="sb-guide-head">' +
      '<div><span>Guia de bloques</span><h3>' + escHtml(currentMission.id + ' · ' + guide.title) + '</h3></div>' +
      '<button id="sbGuideStarter" type="button">Plantilla</button>' +
    '</div>' +
    '<div class="sb-guide-body">' +
    '<div class="sb-guide-hint">Usa el boton "Ocultar guia" para cerrar este panel. Volvera como "Mostrar guia".</div>' +
    '<p class="sb-guide-intro">' + escHtml(guide.intro) + '</p>' +
    '<section><h4>' + newBlockTitle + '</h4>' + newBlocks + '</section>' +
    '<section><h4>Bloques que vas a usar</h4><div class="sb-block-list">' + needed + '</div></section>' +
    '<section><h4>Paso a paso</h4><ol class="sb-guide-steps">' + steps + '</ol></section>' +
    '</div>';

  const btn = el.querySelector('#sbGuideStarter');
  if (btn) btn.onclick = () => loadPyblockStarter(currentMission);
  const toggle = el.querySelector('#sbGuideTab');
  if (toggle) toggle.onclick = () => { guideCollapsed = true; renderPyblockGuidePanel(); };
}
