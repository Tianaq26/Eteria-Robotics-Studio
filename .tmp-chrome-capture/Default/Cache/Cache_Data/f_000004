  (function () {
    // Evitar que Monaco intente cargar workers desde CDN (pueden bloquearse por COEP).
    // Usamos un worker vacío inline; Monaco degrada a modo sin worker sin errores.
    window.MonacoEnvironment = {
      getWorkerUrl: function () {
        return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(
          'self.onmessage = function() {};'
        );
      }
    };

    require.config({
      paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }
    });

    require(['vs/editor/editor.main'], async function () {

      // ── Tema personalizado (fondo oscuro del IDE) ─────────────────────────
      monaco.editor.defineTheme('sumobot-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background':              '#0d0d12',
          'editor.lineHighlightBackground': '#16161f',
          'editor.selectionBackground':     '#3c82f055',
          'editorLineNumber.foreground':    '#454560',
          'editorLineNumber.activeForeground': '#9a9ab8',
          'editor.inactiveSelectionBackground': '#3c82f030',
          'editorIndentGuide.background':   '#2c2c3a',
          'editorIndentGuide.activeBackground': '#3c82f066',
          'editorBracketMatch.background':  '#3c82f044',
          'editorBracketMatch.border':      '#3c82f0',
        }
      });

      // ── Documentación de la API sumobot ──────────────────────────────────
      const PY_HOVER = {
        'ib.motor_1': '**Motor izquierdo**\n\n`ib.motor_1.throttle = valor`  (-1 a 1)\n\n- `1` = avance máximo\n- `-1` = retroceso\n- `0` = parado',
        'ib.motor_2': '**Motor derecho**\n\n`ib.motor_2.throttle = valor`  (-1 a 1)',
        'sonar': '**Sensor ultrasónico HC-SR04**\n\n`sonar.dist_cm()` → distancia en cm, o `-1` si no detecta nada',
        'en_borde': '**Detector de borde**\n\n`en_borde()` → `True` si algún IR frontal/trasero ve la línea blanca',
        'sleep': '**Pausa cooperativa**\n\n`sleep(segundos)` — avanza el reloj de simulación el tiempo indicado.\n\nUsa `sleep(0.02)` para ciclos de 20 ms (50 Hz), igual que en el robot real.',
        'ib.pixel': '**LED RGB**\n\n`ib.pixel = (R, G, B)` — valores 0-255\n\n- Rojo: `(255, 0, 0)`\n- Verde: `(0, 255, 0)`\n- Azul: `(0, 0, 255)`',
        'fl.value': '**IR frontal-izquierdo** (IO36)\n\nValor bajo (< 3000) → línea blanca (borde del dojo)',
        'fr.value': '**IR frontal-derecho** (IO39)\n\nValor bajo (< 3000) → línea blanca',
        'bl.value': '**IR trasero-izquierdo** (IO34)',
        'br.value': '**IR trasero-derecho** (IO35)',
      };

      const JS_HOVER = {
        's.enemy.detected':  '`boolean` — El rival está dentro del cono ultrasónico (~30°, 0-80 cm)',
        's.enemy.distance':  '`number | null` — Distancia al rival en cm, o `null` si no detecta',
        's.enemy.bearing':   '`number` — Ángulo al rival: -1 = derecha · 0 = frente · +1 = izquierda',
        's.border.front':    '`boolean` — Línea blanca detectada al frente',
        's.border.any':      '`boolean` — Línea blanca en cualquier sensor IR',
        's.border.frontLeft':'`boolean` — Línea blanca, IR frontal-izquierdo',
        's.border.frontRight':'`boolean` — Línea blanca, IR frontal-derecho',
        's.border.backLeft': '`boolean` — Línea blanca, IR trasero-izquierdo',
        's.border.backRight':'`boolean` — Línea blanca, IR trasero-derecho',
        's.contact':         '`boolean` — Colisión física directa con el rival',
      };

      // ── Documentación C++ / Arduino (enlaces a la documentación oficial) ──
      const CPP_HOVER = {
        'setup()':      '**setup()** — Se ejecuta una vez al encender el robot.\n\n[Documentación oficial](https://docs.arduino.cc/language-reference/en/structure/sketch/setup/)',
        'loop()':       '**loop()** — Se ejecuta en bucle infinito después de `setup()`.\n\n[Documentación oficial](https://docs.arduino.cc/language-reference/en/structure/sketch/loop/)',
        'millis()':     '**millis()** → `unsigned long` — Milisegundos desde el encendido.\n\nÚsalo para temporizar sin bloquear: `if (millis() - t0 < 500) { ... }`\n\n[Documentación oficial](https://docs.arduino.cc/language-reference/en/functions/time/millis/)',
        'delay(':       '**delay(ms)** — Pausa bloqueante en milisegundos. Prefiere `millis()` para no congelar la lógica.\n\n[Documentación oficial](https://docs.arduino.cc/language-reference/en/functions/time/delay/)',
        'analogWrite':  '**analogWrite(pin, valor)** — PWM 0-255 en el pin. Controla la velocidad de los motores.\n\n[Documentación oficial](https://docs.arduino.cc/language-reference/en/functions/analog-io/analogWrite/)',
        'analogRead':   '**analogRead(pin)** → 0-4095 (ESP32) — Lee un sensor analógico. Los IR devuelven valor bajo sobre la línea blanca.\n\n[Documentación oficial](https://docs.arduino.cc/language-reference/en/functions/analog-io/analogRead/)',
        'digitalRead':  '**digitalRead(pin)** → `HIGH` / `LOW` — Lee un pin digital (ej. botón BOOT, activo LOW).\n\n[Documentación oficial](https://docs.arduino.cc/language-reference/en/functions/digital-io/digitalRead/)',
        'pinMode':      '**pinMode(pin, modo)** — Configura un pin: `OUTPUT`, `INPUT`, `INPUT_PULLUP`.\n\n[Documentación oficial](https://docs.arduino.cc/language-reference/en/functions/digital-io/pinMode/)',
        'constrain':    '**constrain(x, min, max)** — Limita `x` al rango [min, max].\n\n[Documentación oficial](https://docs.arduino.cc/language-reference/en/functions/math/constrain/)',
        'random(':      '**random(min, max)** — Entero pseudoaleatorio en [min, max).\n\n[Documentación oficial](https://docs.arduino.cc/language-reference/en/functions/random-numbers/random/)',
        'Serial.begin': '**Serial.begin(baudios)** — Inicia el puerto serie (115200 para el ESP32).\n\n[Documentación oficial](https://docs.arduino.cc/language-reference/en/functions/communication/serial/begin/)',
        'yield()':      '**yield()** — Cede CPU al sistema (WiFi/watchdog del ESP32). Llámalo dentro de bucles largos.\n\n[Referencia ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/)',
        'Adafruit_NeoPixel': '**Adafruit_NeoPixel** — Librería del LED RGB.\n\n`strip.setPixelColor(0, strip.Color(r,g,b)); strip.show();`\n\n[Documentación oficial](https://adafruit.github.io/Adafruit_NeoPixel/html/class_adafruit___neo_pixel.html)',
        'sonar.read':   '**sonar.read()** → distancia en cm (librería Ultrasonic, HC-SR04).\n\n`<= 0` = punto ciego (muy cerca) · `> 400` = nada a la vista',
        'motores(':     '**motores(izq, der)** — Velocidades lógicas de rueda en rango -1..1 (helper del sketch del robot).',
        'unsigned long':'**unsigned long** — Entero de 32 bits sin signo (0 a 4 294 967 295). Úsalo siempre con `millis()`.\n\n[Documentación oficial](https://docs.arduino.cc/language-reference/en/variables/data-types/unsignedLong/)',
        '#pragma region':'**#pragma region** — Marca una sección plegable del código (organización, no afecta al programa).',
      };

      // ── Snippets Python ───────────────────────────────────────────────────
      const PY_SNIPPETS = [
        {
          label: 'while True (bucle principal)',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'while True:\n    ${1:# tu código aquí}\n    sleep(${2:0.02})',
          documentation: 'Bucle principal del sumobot con sleep cooperativo'
        },
        {
          label: 'sleep',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: 'sleep(${1:0.02})',
          documentation: 'Pausa en segundos de tiempo de simulación'
        },
        {
          label: 'if',
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: 'if ${1:condicion}:\n    ${0}',
          documentation: 'Condición'
        },
        {
          label: 'elif',
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: 'elif ${1:condicion}:\n    ${0}',
        },
        {
          label: 'else',
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: 'else:\n    ${0}',
        },
        {
          label: 'def',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'def ${1:nombre}(${2}):\n    ${0}',
          documentation: 'Definir una función'
        },
        {
          label: 'for',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'for ${1:i} in ${2:range(10)}:\n    ${0}',
        },
        {
          label: 'ib.motor_1.throttle',
          kind: monaco.languages.CompletionItemKind.Property,
          insertText: 'ib.motor_1.throttle = ${1:1}',
          documentation: 'Motor izquierdo (-1 a 1)'
        },
        {
          label: 'ib.motor_2.throttle',
          kind: monaco.languages.CompletionItemKind.Property,
          insertText: 'ib.motor_2.throttle = ${1:1}',
          documentation: 'Motor derecho (-1 a 1)'
        },
        {
          label: 'ib.pixel',
          kind: monaco.languages.CompletionItemKind.Property,
          insertText: 'ib.pixel = (${1:255}, ${2:0}, ${3:0})',
          documentation: 'LED RGB (R, G, B) — valores 0-255'
        },
        {
          label: 'sonar.dist_cm()',
          kind: monaco.languages.CompletionItemKind.Method,
          insertText: 'sonar.dist_cm()',
          documentation: 'Distancia en cm; -1 si no detecta nada'
        },
        {
          label: 'en_borde()',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: 'en_borde()',
          documentation: 'True si algún IR detecta la línea blanca del borde'
        },
        {
          label: 'fl.value',
          kind: monaco.languages.CompletionItemKind.Property,
          insertText: 'fl.value',
          documentation: 'IR frontal-izquierdo (IO36) — bajo = borde'
        },
        {
          label: 'fr.value',
          kind: monaco.languages.CompletionItemKind.Property,
          insertText: 'fr.value',
          documentation: 'IR frontal-derecho (IO39)'
        },
        {
          label: 'bl.value',
          kind: monaco.languages.CompletionItemKind.Property,
          insertText: 'bl.value',
          documentation: 'IR trasero-izquierdo (IO34)'
        },
        {
          label: 'br.value',
          kind: monaco.languages.CompletionItemKind.Property,
          insertText: 'br.value',
          documentation: 'IR trasero-derecho (IO35)'
        },
        {
          label: 'import board',
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: 'import board',
        },
        {
          label: 'from ideaboard import IdeaBoard',
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: 'from ideaboard import IdeaBoard\n',
        },
        {
          label: 'from hcsr04 import HCSR04',
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: 'from hcsr04 import HCSR04\n',
        },
        {
          label: 'from time import sleep',
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: 'from time import sleep\n',
        },
        {
          label: 'Plantilla completa CircuitPython',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: [
            'import board',
            'from ideaboard import IdeaBoard',
            'from time import sleep',
            'from hcsr04 import HCSR04',
            '',
            'ib = IdeaBoard()',
            'sonar = HCSR04(board.IO25, board.IO26)',
            'fl = ib.AnalogIn(board.IO36)',
            'fr = ib.AnalogIn(board.IO39)',
            'bl = ib.AnalogIn(board.IO34)',
            'br = ib.AnalogIn(board.IO35)',
            'BLANCO = 3000',
            '',
            'def en_borde():',
            '    return fl.value < BLANCO or fr.value < BLANCO or bl.value < BLANCO or br.value < BLANCO',
            '',
            'while True:',
            '    if en_borde():',
            '        ib.motor_1.throttle = -1',
            '        ib.motor_2.throttle = -1',
            '        sleep(0.2)',
            '    elif 0 < sonar.dist_cm() < 50:',
            '        ib.motor_1.throttle = 1',
            '        ib.motor_2.throttle = 1',
            '    else:',
            '        ib.motor_1.throttle = 1',
            '        ib.motor_2.throttle = 0.3',
            '    sleep(0.02)',
          ].join('\n'),
          documentation: 'Código de inicio completo para un sumobot CircuitPython'
        },
      ];

      // ── Snippets JavaScript ───────────────────────────────────────────────
      const JS_SNIPPETS = [
        {
          label: 'function update(s)',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'function update(s) {\n  ${0}\n  return { left: 1, right: 1 };\n}',
          documentation: 'Función principal del bot JS'
        },
        {
          label: 'return { left, right }',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'return { left: ${1:1}, right: ${2:1} };',
          documentation: 'Devolver velocidades de rueda (-1 a 1)'
        },
        {
          label: 'if s.enemy.detected',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'if (s.enemy.detected) {\n  ${0}\n}',
        },
        {
          label: 'if s.border.front',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'if (s.border.front) {\n  return { left: -1, right: -1 };\n}',
        },
        {
          label: 'if s.border.any',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'if (s.border.any) {\n  ${0}\n}',
        },
        {
          label: 's.enemy.detected',  kind: monaco.languages.CompletionItemKind.Property,
          insertText: 's.enemy.detected', documentation: JS_HOVER['s.enemy.detected']
        },
        {
          label: 's.enemy.distance',  kind: monaco.languages.CompletionItemKind.Property,
          insertText: 's.enemy.distance', documentation: JS_HOVER['s.enemy.distance']
        },
        {
          label: 's.enemy.bearing',   kind: monaco.languages.CompletionItemKind.Property,
          insertText: 's.enemy.bearing',  documentation: JS_HOVER['s.enemy.bearing']
        },
        {
          label: 's.border.front',    kind: monaco.languages.CompletionItemKind.Property,
          insertText: 's.border.front',   documentation: JS_HOVER['s.border.front']
        },
        {
          label: 's.border.any',      kind: monaco.languages.CompletionItemKind.Property,
          insertText: 's.border.any',     documentation: JS_HOVER['s.border.any']
        },
        {
          label: 's.contact',         kind: monaco.languages.CompletionItemKind.Property,
          insertText: 's.contact',        documentation: JS_HOVER['s.contact']
        },
      ];

      // ── Snippets C++ (Arduino) ────────────────────────────────────────────
      const CPP_SNIPPETS = [
        {
          label: 'setup + loop (esqueleto Arduino)',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'void setup() {\n    ${1:// se ejecuta una vez}\n}\n\nvoid loop() {\n    ${0:// se repite por siempre}\n}',
          documentation: 'Estructura básica de todo sketch Arduino'
        },
        {
          label: 'temporizador con millis()',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'unsigned long t0 = millis();\nwhile (millis() - t0 < ${1:500}) {\n    ${0}\n    delay(10);\n    yield();\n}',
          documentation: 'Bucle temporizado no bloqueante (patrón del sketch oficial)'
        },
        {
          label: 'motores(izq, der)',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: 'motores(${1:1.0f}, ${2:1.0f});',
          documentation: 'Velocidades de rueda -1..1'
        },
        {
          label: 'setColor(r, g, b)',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: 'setColor(${1:255}, ${2:0}, ${3:0});',
          documentation: 'LED RGB NeoPixel, valores 0-255'
        },
        {
          label: 'leerDistancia()',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: 'leerDistancia()',
          documentation: 'Distancia del ultrasónico en cm (2 = punto ciego, 999 = perdido)'
        },
        {
          label: 'hayBorde()',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: 'hayBorde()',
          documentation: 'true si algún IR detecta la línea blanca'
        },
        {
          label: 'if',
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: 'if (${1:condicion})\n{\n    ${0}\n}',
        },
        {
          label: 'for',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:4}; ${1:i}++)\n{\n    ${0}\n}',
        },
        {
          label: 'const unsigned long (constante de tiempo)',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'const unsigned long ${1:TIEMPO_X} = ${2:500};',
          documentation: 'Constante de tiempo en ms, tipo correcto para millis()'
        },
      ];

      // ── Registrar completion providers ────────────────────────────────────
      function makeProvider(snippets) {
        return {
          triggerCharacters: ['.', ' '],
          provideCompletionItems: function (model, position) {
            const word = model.getWordUntilPosition(position);
            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber:   position.lineNumber,
              startColumn:     word.startColumn,
              endColumn:       word.endColumn,
            };
            return {
              suggestions: snippets.map(s => ({
                ...s,
                range,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              }))
            };
          }
        };
      }

      monaco.languages.registerCompletionItemProvider('python',     makeProvider(PY_SNIPPETS));
      monaco.languages.registerCompletionItemProvider('javascript', makeProvider(JS_SNIPPETS));
      monaco.languages.registerCompletionItemProvider('cpp',        makeProvider(CPP_SNIPPETS));

      // ── Hover providers ───────────────────────────────────────────────────
      function makeHoverProvider(hoverMap) {
        return {
          provideHover: function (model, position) {
            const line = model.getLineContent(position.lineNumber);
            for (const [key, doc] of Object.entries(hoverMap)) {
              const idx = line.indexOf(key);
              if (idx !== -1 && position.column >= idx + 1 && position.column <= idx + key.length + 1) {
                return {
                  contents: [{ value: doc }],
                  range: {
                    startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
                    startColumn: idx + 1, endColumn: idx + key.length + 1,
                  }
                };
              }
            }
          }
        };
      }

      monaco.languages.registerHoverProvider('python',     makeHoverProvider(PY_HOVER));
      monaco.languages.registerHoverProvider('javascript', makeHoverProvider(JS_HOVER));
      monaco.languages.registerHoverProvider('cpp',        makeHoverProvider(CPP_HOVER));

      // ── Validación en tiempo real ─────────────────────────────────────────
      function validatePython(model) {
        const markers = [];
        const lines   = model.getLinesContent();
        let parenD = 0, brackD = 0, braceD = 0;
        let openLine = -1;

        const CTRL = /^(if|elif|else|while|for|def|class|try|except|finally|with|async\s+def|async\s+for|async\s+with)\b/;

        lines.forEach(function (raw, i) {
          const ln      = i + 1;
          const trimmed = raw.trim();
          if (!trimmed || trimmed.startsWith('#')) return;

          // Rastrear paréntesis / corchetes / llaves
          for (var ci = 0; ci < raw.length; ci++) {
            var ch = raw[ci];
            if (ch === '#') break;          // ignorar comentarios
            if (ch === '(') { if (parenD === 0) openLine = ln; parenD++; }
            else if (ch === ')') { parenD = Math.max(0, parenD - 1); }
            else if (ch === '[') { if (brackD === 0) openLine = ln; brackD++; }
            else if (ch === ']') { brackD = Math.max(0, brackD - 1); }
            else if (ch === '{') { if (braceD === 0) openLine = ln; braceD++; }
            else if (ch === '}') { braceD = Math.max(0, braceD - 1); }
          }

          // Sólo validar cuando no estamos dentro de un paréntesis multilínea
          if (parenD > 0 || brackD > 0) return;

          // Falta de ":" al final de estructura de control
          if (CTRL.test(trimmed)) {
            const noComment = raw.replace(/#.*$/, '').trimEnd();
            if (!noComment.endsWith(':') && !noComment.endsWith('\\')) {
              markers.push({
                severity: monaco.MarkerSeverity.Error,
                message:  'Falta ":" al final de la declaración',
                startLineNumber: ln, endLineNumber: ln,
                startColumn: 1, endColumn: raw.length + 1,
              });
            }
          }

          // API typos comunes
          if (/\bmotor1\b/.test(trimmed)) {
            markers.push({ severity: monaco.MarkerSeverity.Warning,
              message: '¿Quisiste decir "motor_1"?',
              startLineNumber: ln, endLineNumber: ln,
              startColumn: 1, endColumn: raw.length + 1 });
          }
          if (/\bmotor2\b/.test(trimmed)) {
            markers.push({ severity: monaco.MarkerSeverity.Warning,
              message: '¿Quisiste decir "motor_2"?',
              startLineNumber: ln, endLineNumber: ln,
              startColumn: 1, endColumn: raw.length + 1 });
          }
        });

        // Paréntesis sin cerrar
        if (parenD > 0) {
          markers.push({ severity: monaco.MarkerSeverity.Error,
            message: parenD + ' paréntesis sin cerrar',
            startLineNumber: openLine, endLineNumber: openLine,
            startColumn: 1, endColumn: 2 });
        }
        if (brackD > 0) {
          markers.push({ severity: monaco.MarkerSeverity.Error,
            message: brackD + ' corchete(s) sin cerrar',
            startLineNumber: openLine, endLineNumber: openLine,
            startColumn: 1, endColumn: 2 });
        }

        monaco.editor.setModelMarkers(model, 'sumobot-py', markers);
      }

      function validateJS(model) {
        const markers = [];
        const code    = model.getValue();
        try {
          // Envolver en función para detectar SyntaxError
          new Function(code);   // eslint-disable-line no-new-func
        } catch (e) {
          if (e instanceof SyntaxError) {
            // Extraer línea del stack (varía por navegador)
            var lineMatch = (e.stack || '').match(/(?:<anonymous>|Function):(\d+)/);
            var line = lineMatch ? Math.max(1, parseInt(lineMatch[1]) - 1) : 1;
            var colMatch  = (e.stack || '').match(/(?:<anonymous>|Function):\d+:(\d+)/);
            var col  = colMatch  ? parseInt(colMatch[1]) : 1;
            var content   = model.getLineContent(line) || '';
            markers.push({
              severity: monaco.MarkerSeverity.Error,
              message:  e.message,
              startLineNumber: line, endLineNumber: line,
              startColumn: col, endColumn: Math.max(col + 1, content.length + 1),
            });
          }
        }
        monaco.editor.setModelMarkers(model, 'sumobot-js', markers);
      }

      function validate(model) {
        var lang = model.getLanguageId();
        if (lang === 'python')     validatePython(model);
        else if (lang === 'javascript') validateJS(model);
      }

      // ── Crear el editor ───────────────────────────────────────────────────
      var initialCode = '';
      try { initialCode = await (await fetch('./content/starter.py')).text(); }
      catch (e) { initialCode = '# Error: no se pudo cargar content/starter.py'; }

      var editor = monaco.editor.create(document.getElementById('monaco-container'), {
        value:    initialCode,
        language: 'python',
        theme:    'sumobot-dark',
        automaticLayout:   true,
        fontSize:          13,
        fontFamily:        '"Cascadia Code", "Fira Code", ui-monospace, monospace',
        fontLigatures:     true,
        lineHeight:        20,
        letterSpacing:     0.3,
        tabSize:           4,
        insertSpaces:      true,
        detectIndentation: false,
        wordWrap:          'off',
        minimap:           { enabled: false },
        scrollBeyondLastLine: false,
        renderLineHighlight:  'line',
        cursorBlinking:       'smooth',
        cursorSmoothCaretAnimation: 'on',
        smoothScrolling:      true,
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        suggest: {
          showSnippets:    true,
          showKeywords:    true,
          showProperties:  true,
          showMethods:     true,
          snippetsPreventQuickSuggestions: false,
        },
        quickSuggestions:       { other: true, comments: false, strings: false },
        acceptSuggestionOnEnter: 'smart',
        formatOnType:   true,
        autoIndent:     'full',
        renderWhitespace: 'selection',
        padding:  { top: 10, bottom: 10 },
        scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
      });

      // Validar al cambiar el código (debounced 400 ms)
      var _valTimer;
      editor.onDidChangeModelContent(function () {
        clearTimeout(_valTimer);
        _valTimer = setTimeout(function () { validate(editor.getModel()); }, 400);
      });
      validate(editor.getModel());

      // ── Abstracción window.SumoEditor ─────────────────────────────────────
      window.SumoEditor = {
        getValue: function () { return editor.getValue(); },
        setValue: function (v) {
          editor.setValue(v);
          editor.setScrollPosition({ scrollTop: 0 });
        },
        setLanguage: function (lang) {
          var ml = lang === 'py' ? 'python' : lang === 'cpp' ? 'cpp' : 'javascript';
          monaco.editor.setModelLanguage(editor.getModel(), ml);
          editor.updateOptions({ tabSize: ml === 'javascript' ? 2 : 4 });
          // Limpiar marcadores del lenguaje anterior
          monaco.editor.setModelMarkers(editor.getModel(), 'sumobot-py', []);
          monaco.editor.setModelMarkers(editor.getModel(), 'sumobot-js', []);
          validate(editor.getModel());
        },
      };

      // Ctrl/Cmd + Enter dentro del editor = Ejecutar mi bot
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, function () {
        var btn = document.getElementById('btnRun');
        if (btn) btn.click();
      });
    }); // fin require
  })();
