# Eteria Robotics Studio — Contexto del proyecto

> Archivo de referencia para retomar el desarrollo sin perder contexto.
> Última actualización: 2026-07-04 (rebranding + lanzamiento en GitHub Pages, SEO, analítica)

---

## ¿Qué es esto?

Plataforma web educativa para programar y combatir sumobots virtuales que siguen las reglas
oficiales de CENFOTEC. El usuario escribe código JS o Python (CircuitPython real) en el editor
del navegador, lo compila al instante y observa el combate en 3D. Nombre de marca: **Eteria
Robotics Studio** (antes "Sumobot Arena IDE" — renombrado en 2026-07-04; "sumobot" sigue
usándose como término genérico del robot/dominio, no como marca).

**Ubicación local:** `D:\Datos\Proyectos Web\SumobotArenaIDE`
**Repo GitHub:** https://github.com/Tianaq26/Eteria-Robotics-Studio (rama `main`)
**En producción (GitHub Pages):** https://tianaq26.github.io/Eteria-Robotics-Studio/
**Correr local:** `npm run serve` → <http://localhost:8080>
**Tests headless:** `npm test`
**Sin build:** puro ESM, sin bundler ni transpilación — se sube el repo tal cual a GitHub Pages.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Servidor de desarrollo | Live Server (VS Code) con `.vscode/settings.json` para COOP/COEP |
| Render 3D | Three.js 0.160.0 via importmap (unpkg CDN) + GLTFLoader |
| Editor de código | Monaco Editor 0.45.0 (AMD CDN) + abstracción `window.SumoEditor` |
| Sandbox JS | `new Function()` en sandbox.js |
| Python | Pyodide v0.26.4 en Worker, shims CircuitPython |
| Cabeceras | COOP: same-origin + COEP: credentialless (SharedArrayBuffer) |

---

## Estructura de archivos

```
SumobotArenaIDE/
├── index.html                    # layout 3 paneles + dock móvil (2 franjas) + importmap Three.js + SEO/GTM
├── package.json                  # type:module, scripts test/serve
├── tools/serve.js                # servidor estático con cabeceras COOP/COEP
├── tests/headless.js             # prueba determinismo + batallas batch
├── coi-serviceworker.js          # habilita crossOriginIsolated en GitHub Pages (ver sección Deploy)
├── favicon.svg                   # ícono generado a partir del logo inline del header
├── robots.txt / sitemap.xml      # SEO — indexación en Google Search Console
├── .gitignore                    # excluye .claude/ (config local) y autoguardados de Blender
├── modelos3D/
│   ├── sumobot.glb               # modelo 3D del robot (PENDIENTE de usar en scene.js)
│   └── sumobot.blend             # fuente Blender
└── src/
    ├── shared/config.js          # RULES, ROBOT, SIM, START (unidades cm/s)
    ├── engine/
    │   ├── vec2.js               # funciones puras de vectores 2D
    │   ├── rng.js                # mulberry32 (PRNG seeded determinista)
    │   ├── sensors.js            # sampleSensors(self, enemy, t) → objeto s
    │   ├── physics.js            # integrate(), resolveCollision(), isOut()
    │   └── engine.js             # clase Round + runRound + runMatch
    ├── bots/
    │   ├── straight.js           # siempre {1,1}
    │   ├── spinner.js            # gira + embiste al detectar
    │   ├── center.js             # defiende el centro
    │   └── reactive.js           # busca, embiste, evita borde
    ├── runtime/
    │   ├── sandbox.js            # compileBot(code) → {ok, bot, error}
    │   ├── pyworker.js           # Worker Pyodide: shims board/ideaboard/hcsr04 + sleep
    │   └── pybridge.js           # hilo principal ↔ Worker (SharedArrayBuffer)
    ├── .vscode/settings.json     # cabeceras COOP/COEP para Live Server (SharedArrayBuffer)
    ├── render/
    │   └── scene.js              # Three.js: dojo + anillo + 2 robots GLB con disco de equipo
    ├── device/
    │   ├── webSerialTransport.js # envoltorio genérico Web Serial API (puerto, read loop, write)
    │   ├── circuitPyDrive.js     # envoltorio genérico File System Access API (unidad CIRCUITPY)
    │   └── ideaBoard.js          # driver IdeaBoard: conecta ambos, expone connect/upload/monitor
    └── app/
        ├── main.js               # orquestador: engine + render + editor + sandbox
        ├── projectManager.js     # Guardar/Abrir/Importar/Exportar .sumo (100% cliente)
        └── deviceUI.js           # conecta ideaBoard.js con el DOM (botón, panel Monitor Serie)
```

---

## Persistencia de proyectos (100% cliente, sin backend)

`src/app/projectManager.js` implementa Guardar / Guardar como / Abrir / Nuevo / Importar / Exportar
como un IDE de escritorio, sin servidor ni base de datos:

- **Con File System Access API** (Chrome/Edge): `showSaveFilePicker` / `showOpenFilePicker` escriben
  y leen archivos `.sumo` reales en el disco del usuario.
- **Sin esa API** (Firefox/Safari): IndexedDB hace de "disco local" para Guardar/Guardar como/Abrir
  (diálogo propio `.proj-modal` con la lista de proyectos guardados en el navegador).
- **Importar/Exportar** siempre funcionan igual en cualquier navegador vía `<a download>` / `<input type=file>`.
- El módulo no conoce Monaco/Blockly/`M`: `main.js` expone `getProjectState()` / `applyProjectState()` /
  `resetProjectState()` como el "adaptador" de estado (lang, code o blocksWorkspace, mode, botBName).
- Menú **Archivo** en `src/app/dock/menubar.js` (atajos: Ctrl+S guardar, Ctrl+Shift+S guardar como, Ctrl+O abrir).
- Formato `.sumo` = JSON plano (`{ format, version, name, updatedAt, state }`).

## Robot físico: conexión directa a la IdeaBoard (sin Thonny)

**Hallazgo clave probado con hardware real (Administrador de dispositivos → "USB-SERIAL CH340 (COM6)"):**
esta IdeaBoard usa un chip puente USB-serie (CH340) y su ESP32 NO tiene USB nativo, así que CircuitPython
**nunca expone una unidad "CIRCUITPY"** como disco — no hay nada que montar con File System Access API,
por eso tampoco aparece nunca en el explorador de archivos de Windows. (Intento inicial equivocado: se
asumió que sí existía esa unidad, como en placas con USB nativo — SAMD51/RP2040/ESP32-S2/S3 — e
`src/device/circuitPyDrive.js` llegó a implementarse y luego se **eliminó** al descubrir esto.)

Así resuelve esto **IdeaCode** (ideacode.crcibernetica.com) en la práctica: todo — listar, leer, escribir,
borrar archivos — se habla por el **mismo y único puerto serie**, con el protocolo estándar **"raw REPL"**
de MicroPython/CircuitPython (el mismo que usan Thonny, `ampy` y `mpremote` para placas sin
almacenamiento USB): Ctrl-C interrumpe, Ctrl-A entra a raw REPL, `<código>` + Ctrl-D lo ejecuta y devuelve
`OK<stdout>\x04<stderr>\x04`, Ctrl-B sale. Implementado en `src/device/microPythonRawRepl.js` (genérico,
no sabe nada de IdeaBoard). Los archivos se escriben/leen en base64 vía `binascii.a2b_base64` /
`b2a_base64` para evitar problemas de escapado; listar usa `os.listdir()` + `os.stat()` + `json.dumps()`.

**Consecuencia inevitable del protocolo, no un bug:** cada operación de archivos interrumpe brevemente
el programa del robot (por eso existe raw REPL: solo hay un canal y el REPL necesita el control). Por
eso `upload()`/`listFiles()`/`readFile()`/`deleteFile()` en `ideaBoard.js` siempre terminan con un
soft-reload (Ctrl-D) que retoma `code.py` — el robot "parpadea" un instante y sigue. Las operaciones
están serializadas (`#chain`) porque dos a la vez corromperían el intercambio de bytes del mismo puerto.

`src/device/webSerialTransport.js` es el envoltorio **genérico** de Web Serial (no sabe nada de
IdeaBoard); `src/device/ideaBoard.js` es el "driver" que lo combina con el cliente raw-REPL y expone
`{ state, connect(), disconnect(), upload(code), listFiles(), readFile(name), deleteFile(name),
sendInterrupt(), sendSoftReload(), sendText(), onStateChange(cb), onSerialData(cb) }`. Un dispositivo
futuro solo necesita implementar esa misma forma. `isSupported` ahora depende solo de `navigator.serial`
(ya no de File System Access).

`src/app/deviceUI.js` conecta ese driver con el DOM — **un solo laboratorio** (SumoLab), no un "lab físico"
separado: el dock system ya deja mostrar/ocultar paneles (p. ej. ocultar Visualización 3D al trabajar con
hardware desde el menú Ventanas), así que no hace falta duplicar la experiencia de edición.

- Botón **"Conectar IdeaBoard"** en el header (un solo click, un solo picker: el puerto serie).
- Botón **"Subir al robot"** en la toolbar del editor (usa `getUploadCode()` en `main.js` — el MISMO
  código que se simula: `py` tal cual, `blocks` vía `generarPython()`; `js`/`cpp` no son CircuitPython
  válido y quedan deshabilitados).
- Panel dockable **"Monitor Serie"** (ya existía como stub en `panels.js`): log línea por línea, tracebacks
  de CircuitPython resaltados en rojo (detecta `Traceback`/`Error:`/`Exception`) e indicador de
  "última actividad hace N s" — así se ve de un vistazo si el bot sigue vivo, igual que en IdeaCode.
- Panel dockable **"Archivos del robot"** (nuevo, como el panel Device de IdeaCode): lista la raíz del
  sistema de archivos de la IdeaBoard vía raw REPL (no baja a subcarpetas como `lib/` todavía), con
  abrir-en-el-editor / descargar / eliminar. Ambos paneles se auto-muestran y refrescan al conectar y
  después de cada "Subir al robot".

**Nota de verificación:** todo esto se probó contra un cliente raw-REPL simulado en el navegador
(no hay forma de correr una IdeaBoard real desde este entorno) — la lógica del protocolo, la
serialización y la UI están verificadas, pero conviene confirmar contra el hardware real que los
textos exactos que devuelve el firmware (banner de raw REPL, formato de errores) calzan; si algo no
responde, revisar primero los mensajes que llegan al Monitor Serie con la placa conectada.

**Requiere Chrome/Edge de escritorio** (Web Serial + File System Access no existen en Firefox/Safari
ni en móvil) — sin fallback posible, a diferencia de projectManager.js, porque no hay forma de hablar
con hardware serie real sin estas APIs. `deviceUI.js` deshabilita el botón con un tooltip explicativo
cuando no están disponibles.

## Deploy en producción: GitHub Pages

**Estado: en vivo** en https://tianaq26.github.io/Eteria-Robotics-Studio/ (repo público
`Tianaq26/Eteria-Robotics-Studio`, rama `main`, Pages configurado como "Deploy from a branch" →
`main` / root — sin workflow de Actions propio, GitHub genera automáticamente el check
"pages build and deployment" en cada push). `tools/serve.js` sigue siendo solo para desarrollo local.

`_headers` (Netlify/Cloudflare Pages) y `vercel.json` (Vercel) quedan en la raíz por si algún día se
migra a otro host, pero **no se usan en GitHub Pages** (no soporta cabeceras personalizadas).

Al migrar de local/Vercel a GitHub Pages hubo que corregir dos cosas que de otro modo rompen el sitio
en producción (silenciosamente, porque en local no se nota):

1. **Rutas absolutas → relativas.** El sitio vive bajo un subpath (`/Eteria-Robotics-Studio/`), no en
   la raíz del dominio. `scene.js`, `viewport3d.js`, `CurriculumLoader.js` y `AchievementEngine.js`
   cargaban `/modelos3D/...` y `/content/...` con slash inicial → se resolvían contra la raíz del
   dominio (`tianaq26.github.io/modelos3D/...`, 404). Cambiadas a `./modelos3D/...` y `./content/...`.
   **Si se agrega un fetch/import nuevo de un asset propio, usar siempre ruta relativa (`./...`), nunca
   con `/` inicial** — no hay routing client-side (sin `pushState`) así que esto es seguro en toda la app.

2. **`crossOriginIsolated` sin cabeceras propias.** GitHub Pages no permite configurar
   COOP/COEP, y Python/pyblock (Pyodide + `SharedArrayBuffer`, ver sección más abajo) los necesita.
   Se agregó `coi-serviceworker.js` (MIT, gzuidhof/coi-serviceworker) registrado como el primer
   `<script>` del `<head>` de `index.html` — intercepta las respuestas del Service Worker y les añade
   las cabeceras COOP/COEP en el cliente. En local (`tools/serve.js` ya las manda) el script detecta
   que `crossOriginIsolated` ya es `true` y no hace nada. **Ya NO es cierto que Python esté bloqueado
   en GitHub Pages** — funciona igual que en local/Vercel gracias a este service worker.

---

## SEO

`index.html` tiene meta description, `robots`, `canonical`, Open Graph/Twitter, JSON-LD
(`WebApplication`) y favicon (`favicon.svg`, generado del ícono del header — no hay imagen `og:image`
todavía, solo texto/JSON-LD). `robots.txt` y `sitemap.xml` en la raíz (single-page, una sola URL).
Propiedad verificada en Google Search Console (prefijo de URL, método meta-tag) y sitemap enviado.
Al ser una SPA de una sola página, no hay más superficie que optimizar sin agregar contenido/rutas nuevas.

## Analítica: Google Tag Manager + GA4

- Contenedor GTM: `GTM-WCKPGQTS` (snippet instalado en `index.html`: script al inicio del `<head>`,
  `<noscript>` justo después de `<body>`).
- Dentro del contenedor GTM (tagmanager.google.com) hay **una sola etiqueta**: tipo **"Etiqueta de
  Google"** (Google Tag, reemplazo actual de la vieja "Configuración de GA4"), ID de medición
  `G-RC4SRSRXP6`, activador "All Pages". **No** se usó el snippet directo de `gtag.js` que ofrece GA4
  (se habría duplicado con GTM) — todo pasa por el contenedor de Tag Manager.
- Para agregar tracking de eventos personalizados a futuro (clics, "Ejecutar mi bot", etc.), crear
  tags tipo "Google Analytics: evento de GA4" en el mismo contenedor — esas sí requieren que la
  "Etiqueta de Google" ya exista (ya existe), más el nombre del evento y su propio activador.
- Cualquier cambio en GTM (nueva etiqueta, activador) necesita **Enviar → Publicar** en el contenedor
  para que tenga efecto — no basta con guardarlo.

## Modo celular: 2 ventanas apiladas (`dockManager.js`)

Bajo `@media (max-width:820px)` el dock de escritorio (`#dockRoot`, 4 zonas left/center/right/bottom)
se oculta y se muestra `#dockRootMobile` en su lugar: 2 franjas apiladas (`data-mzone="a"` arriba,
`"b"` abajo) separadas por un resizer vertical arrastrable. A diferencia de las zonas de desktop
(donde cada panel pertenece a una zona fija), en móvil **las 2 franjas comparten la lista completa
de los 8 paneles** — cada franja tiene su propia barra de pestañas y puede mostrar cualquiera. Tocar
una pestaña que ya está visible en la otra franja las intercambia (nunca queda una franja vacía).
Por defecto: Editor arriba (para que el teclado virtual no lo tape al escribir), Arena 3D abajo.

El truco que hace esto seguro: los nodos de cada panel (`.dock-panel-body`) nunca se destruyen, solo
se mueven con `appendChild` entre el contenedor de su zona de desktop y el de su franja móvil —
`renderZone()` (desktop) y `renderMobileZone()` (móvil) re-anclan el nodo a su contenedor lógico en
cada render, así que cruzar el breakpoint (rotar el celular, redimensionar la ventana) nunca deja un
panel huérfano. Persistencia en `localStorage` separada de la de desktop (`sumobot_mobile_layout_v1`
vs `sumobot_layout_v1`), y el menú "Ventanas" (que oculta/muestra paneles por zona) se esconde en
móvil porque ese concepto no aplica al selector de pestañas de las 2 franjas.

El aviso previo de "mejor en computadora" (`#mobileNotice`) se eliminó junto con este cambio — ya no
hace falta desalentar el uso en celular.

### Otros paneles adaptados a `@media (max-width:820px)`

- **Toolbar del editor y de consola/serie/archivos** (`.toolbar`, `.console-toolbar`): en vez de
  envolver el texto de los botones en varias filas, se vuelven una sola fila con scroll horizontal
  (`overflow-x:auto` + `flex-shrink:0` en los botones).
- **Editor de pintura** (`#paintEditor`): este era el más roto de todos — `.pe-props` (panel de
  color/tamaño/piezas) tiene `flex-shrink:0` y su `.pe-main` es una columna con altura fija; en
  pantallas angostas su contenido natural (869px) superaba el alto disponible y **`.pe-canvaswrap`
  (el lienzo) colapsaba a 0px de alto** — quedaba invisible e inusable. Arreglado con: `.pe-top` en
  una sola fila desplazable (en vez de envolver en 3-4 filas de 200px), `.pe-rail` con scroll
  horizontal en vez de encoger sus botones a ~2px, y `.pe-props` con `max-height:34vh` + scroll
  interno para que el lienzo siempre se quede con espacio real (`min-height:180px`). El texto de
  ayuda para mouse (`.pe-hint`, clic derecho/rueda/botón central) se oculta en touch.
- **Diálogos centrados** (`.sol-box`, `.ro-box`, `.lu-box` — confirmar solución, resultado de
  misión, subir de nivel): no tenían padding en su contenedor `position:fixed`, así que la tarjeta
  tocaba los bordes de la pantalla exactamente en 0px. Se agregó `padding:16px` al contenedor y
  `max-width:100%; box-sizing:border-box` a la tarjeta.
- **Mapa de misiones** (`.mm-box`), **panel de control** (`.stat-grid`, con `1fr 1fr`) y **toast de
  logro** (`#achievementToast`, `min-width:240px`) ya eran responsive de antes (usan `%`/`vw`/`fr` o
  min-width que cabe en 320px+) — no necesitaron cambios.
- **pyblock (Blockly)**: el workspace SVG es más ancho que el viewport a propósito — es un lienzo
  pannable/zoomable con soporte táctil nativo de Blockly, no un bug de layout.

---

## Motor de simulación (engine.js)

### Clase `Round`
```js
new Round(botA, botB, startPos, seed)
// botB = null → modo solo (sin rival)
round.step()       // → { done, winner?, reason? }
round.getState()   // → { A, B, sA, sB, solo, t, tLeft }
```

- **Determinista:** mismo seed + mismos bots = mismo resultado siempre.
- **Paso fijo:** `SIM.DT = 1/60 s`.
- **Modo solo:** `botB = null`; B se coloca en (1e6, 1e6) y nunca se detecta.
- `runRound(botA, botB, startPos, seed)` — batch (para tests).
- `runMatch(botA, botB, seed)` — best-of-3 batch.

### Objeto sensores `s` (API pública del bot)
```
s.enemy.detected   → boolean (rival en el cono ultrasónico)
s.enemy.distance   → cm o null
s.enemy.bearing    → -1 (der) … 0 (frente) … +1 (izq)
s.border.front     → boolean
s.border.frontLeft / frontRight / backLeft / backRight
s.border.any       → boolean
s.contact          → boolean (colisión física)
```

### Posiciones de inicio
```js
START.ESPALDAS = 1   // A y B de espaldas
START.DE_LADO  = 2   // lado a lado
START.DE_FRENTE = 3  // frente a frente
```
Los combates rotan: ESPALDAS → DE_LADO → DE_FRENTE → ESPALDAS…

---

## Render (scene.js)

- Coordenadas: mundo `(+x, +y)` → Three `(x, z=-y)`, Y = altura.
- **Dojo:** cilindro negro Ø 90 cm + anillo blanco 80–90 cm.
- **Robots:** `sumobot.glb` cargado con `GLTFLoader`. Colores originales del GLB intactos.
  - Diferenciación por **disco circular** en el suelo: azul (A) / rojo (B). Se vuelve gris al salir.
  - Si el GLB mide < 1 unidad (exportado en metros desde Blender), se escala × 100 automáticamente.
  - El radio de colisión real se mide del bounding box XZ y actualiza `ROBOT.COL_R` al cargar.
  - Fallback: `BoxGeometry` mientras el GLB carga.
- **Importmap:** mapea `"three"` y `"three/addons/"` (ambos en unpkg).

---

## Editor y sandbox

### window.SumoEditor (abstracción)
```js
window.SumoEditor.getValue()   // → string con el código del usuario
window.SumoEditor.setValue(v)  // → carga nuevo código
```
Implementado actualmente con `<textarea id="code">`. Monaco puede sustituirlo después
sin tocar `main.js` ni `sandbox.js`.

### compileBot(code, opts) → {ok, bot, error}
- Sandbox `new Function()` con globals bloqueados (window, document, fetch, etc.).
- `eval` NO puede estar en la lista de bloqueados (nombre ilegal en strict mode).
- El bot compilado expone `{ name, update(s) → {left, right}, init?(ctx) }`.

---

## Soporte Python (CircuitPython real)

- `src/runtime/pyworker.js` — Worker con Pyodide 0.26.4.
  - Shims: `board`, `ideaboard.IdeaBoard`, `hcsr04.HCSR04`, `time.sleep` cooperativo.
  - `ib.motor_1.throttle` / `ib.motor_2.throttle` (−1..1).
  - `ib.AnalogIn(board.IOxx).value` — IR: FL=IO36, FR=IO39, BL=IO34, BR=IO35.
  - `sonar.dist_cm()` — −1 si nada, valor real si detecta.
- `src/runtime/pybridge.js` — hilo principal: `SharedArrayBuffer`, publica sensores, lee motores.
- Requiere `crossOriginIsolated` (las cabeceras en serve.js ya lo habilitan).
- El código `while True: … sleep(0.02)` corre tal cual, exactamente como en el robot real.

---

## UI / Control panel

| Elemento | ID | Descripción |
|---|---|---|
| Selector lenguaje | `selLang` | js / py |
| Botón ejecutar | `btnRun` | compila y lanza newMatch() |
| Selector modo | `selMode` | rival / solo |
| Selector bot A | `selA` | Tu código + 4 bots de ejemplo |
| Selector bot B | `selB` | 4 bots de ejemplo |
| Pausar | `btnPause` | toggle M.paused |
| Reiniciar | `btnReset` | newMatch() |
| Velocidad | `speed` | 0.25–6× |
| Marcadores | round, score, time, startpos, stateA, stateB, result | HUD |

---

## Estado actual (milestones completados)

| # | Milestone | Estado |
|---|---|---|
| 1 | Núcleo headless determinista + tests | ✅ |
| 2 | Render 3D + partida mejor-de-3 + HUD | ✅ |
| 3 | Editor + sandbox JS + consola | ✅ |
| 3b | Modo solo (sin rival) | ✅ |
| 3c | Soporte Python CircuitPython (Pyodide) | ✅ |
| 4 | Modelo 3D GLB (sumobot.glb) + colisión OBB + Monaco IDE | ✅ |
| 5 | Niveles guiados 0→5 (Milestone 4 del diseño) | ⏳ PENDIENTE |

---

## Física (config.js + physics.js)

| Parámetro | Valor | Fuente |
|---|---|---|
| `ROBOT.SIZE` | 11 cm | IdeaBoard + ruedas ~11 cm |
| `ROBOT.WHEEL_VMAX` | 40 cm/s | 200 RPM × π × 3.8 cm / 60 |
| `ROBOT.WHEEL_BASE` | 9 cm | estimado chasis |
| `ROBOT.MASS` | 0.315 kg | límite CENFOTEC |
| `DOJO_R_EXT` | 45 cm | Ø 90 cm exterior |
| `DOJO_R_INT` | 40 cm | Ø 80 cm interior |
| `RINGOUT_R` | 42.5 cm | mitad de la banda blanca |
| Colisión | **OBB SAT** | 4 ejes, sin penetración frontal |

---

## Reglas CENFOTEC (resumen)

- Dojo: 90 cm Ø exterior, borde blanco de 5 cm (radio interior 40 cm).
- Robot sale si su centro supera `RINGOUT_R = 42.5 cm` (mitad del borde).
- Masa máxima: 315 g. Combate: 90 s. Partida: mejor de 3.
- Gana el que empuje al rival fuera; en tiempo, gana el más centrado.
- Fuente oficial: https://github.com/Universidad-Cenfotec/Sumobot

---

## UI / Control panel

| Elemento | ID | Descripción |
|---|---|---|
| Selector lenguaje | `selLang` | py / js (en el tab del editor) |
| Botón ejecutar | `btnRun` | verde=ejecutando, naranja=pausa, azul=listo |
| Botón pausar | `btnPause` | toggle M.paused, naranja cuando activo |
| Botón reiniciar | `btnReset` | newMatch() |
| Selector modo | `selMode` | rival / solo |
| Selector bot A | `selA` | Tu código + 4 bots de ejemplo |
| Selector bot B | `selB` | 4 bots de ejemplo |
| Velocidad | `speed` | 0.25–6× |
| Marcadores | round, score, time, startpos, stateA, stateB, result, result-panel | HUD |
| Paneles | arrastrables | divisor entre Editor / Arena / Control (drag handle) |

---

## Gotchas / decisiones no obvias

1. **Monaco via AMD**: No usar `import` ESM para Monaco. Cargar con `<script src="...loader.js">` + `require()`. Worker inline vacío en `MonacoEnvironment.getWorkerUrl` para evitar bloqueos COEP.
2. **SharedArrayBuffer en Live Server**: requiere `.vscode/settings.json` con `liveServer.settings.headers` COOP/COEP. El panel embebido de Claude Code NO lo soporta — usar Chrome directo en `http://127.0.0.1:5500`.
3. **Stop de Python**: `Atomics.wait` bloquea el worker → postMessage no llega. Escribir `STOP` e `intb[0]` directamente en el SAB desde el hilo principal (`pybridge.stop()`).
4. **Race condition runUser**: múltiples `run` messages pueden quedar en cola. Usar `runGen` counter; el runUser más reciente cancela los anteriores.
5. **`eval` no puede ser parámetro** en strict mode → eliminado de BLOCKED en sandbox.js.
6. **COEP `credentialless`** (no `require-corp`) → permite cargar Pyodide desde CDN externo.
7. **Modo solo:** B se pone en (1e6, 1e6) y `B.out = true` desde el inicio.
8. **GLB en metros vs cm**: si el modelo mide < 1 unidad Three.js, se escala × 100 en scene.js.
