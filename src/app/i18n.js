// ======================================================
// i18n.js — Internacionalización ligera (español / inglés).
//
// Sin dependencias ni build: un diccionario plano por idioma, una función t(),
// persistencia en localStorage y un aplicador que recorre el DOM buscando
// atributos data-i18n* para traducir el HTML estático. Los módulos que generan
// UI dinámica (menubar, tour, deviceUI, main) llaman a t() y se re-renderizan al
// escuchar el evento 'eteria:langchange'.
//
// Alcance: toda la interfaz de la app (chrome). El contenido autoral de las
// misiones (narrativa, objetivos) y los mensajes internos del motor quedan como
// datos y no se traducen aquí.
// ======================================================

const KEY = 'eteria_lang';
export const LANGS = ['es', 'en'];
const DEFAULT_LANG = 'es';

// ── Diccionario ─────────────────────────────────────────────────────────────
// Claves con puntos por área. Usa {x} para interpolación con t(key, { x }).
const MESSAGES = {
  es: {
    // Landing
    'landing.sub': 'Programa, entrena y combate sumobots virtuales. Elige por dónde quieres empezar.',
    'landing.lab.title': 'SumoLab',
    'landing.lab.desc': 'El laboratorio completo: editor de código, simulación 3D y control total. Programa tus bots y pruébalos con total libertad.',
    'landing.lab.cta': 'Entrar al laboratorio →',
    'landing.learn.title': 'Aprende',
    'landing.learn.desc': 'Misiones guiadas paso a paso. De cero a robot competitivo, con pistas, retos y logros por el camino.',
    'landing.learn.cta': 'Empezar a aprender →',
    'landing.battle.badge': 'Próximamente',
    'landing.battle.title': 'Batalla',
    'landing.battle.desc': 'Lleva tus bots a combates estilo juego, como las peleas reales: torneos, rivales y ranking. Aún en desarrollo.',
    'landing.battle.cta': 'En desarrollo 🚧',
    'landing.battle.soon': '¡Muy pronto! 🔒',
    'landing.foot': 'Desarrollado por <b>Sebastián Aguilar</b>',

    // Header
    'header.home': 'Inicio',
    'header.home.title': 'Volver al inicio',
    'header.logo.title': 'Volver al inicio',
    'header.connect.title': 'Conectar la IdeaBoard por USB (puerto serie). Requiere Chrome o Edge de escritorio.',
    'header.paint': 'Pintar',
    'header.paint.title': 'Personaliza y pinta la tapa de tu sumobot',
    'header.learn': 'Aprender',
    'header.learn.title': 'Modo Aprender — misiones guiadas',
    'header.lang.title': 'Idioma / Language',
    'header.section.sumolab': 'SumoLab',
    'header.section.learn': 'Aprende',

    // Toolbar del editor
    'toolbar.run.title': 'Compilar y ejecutar tu código (Ctrl+Enter)',
    'toolbar.run': 'Ejecutar mi bot',
    'toolbar.run.active': 'Ejecutando…',
    'toolbar.run.paused': 'En pausa',
    'toolbar.pause.title': 'Pausar / reanudar',
    'toolbar.pause': 'Pausa',
    'toolbar.reset.title': 'Reiniciar partida',
    'toolbar.reset': 'Reset',
    'toolbar.upload.title': 'Sube el código actual a la IdeaBoard conectada (escribe code.py y lo ejecuta)',
    'toolbar.upload': 'Subir al robot',
    'toolbar.lang.title': 'Lenguaje de programación',

    // Consola
    'console.clear': '🗑 Limpiar',
    'console.clear.title': 'Limpiar consola',

    // Monitor serie
    'serial.interrupt.title': 'Detener el programa en el robot (Ctrl+C)',
    'serial.reload.title': 'Reiniciar y ejecutar code.py (Ctrl+D)',
    'serial.clear.title': 'Limpiar',
    'serial.input.placeholder': 'Escribe y Enter para enviar al REPL de la IdeaBoard…',
    'serial.send': 'Enviar',

    // Archivos del robot
    'files.refresh': '↻ Actualizar',
    'files.refresh.title': 'Actualizar lista',
    'files.empty.connect': 'Conecta la IdeaBoard para ver sus archivos.',
    'files.empty.none': 'No hay archivos en la IdeaBoard.',
    'files.error.list': 'Error al listar archivos: ',
    'files.folder': 'Carpeta',

    // Arena
    'arena.overlays.title': 'Mostrar overlays de sensores',
    'arena.overlays': 'Sensores',

    // Panel de control
    'panel.mode': 'Modo de juego',
    'panel.mode.rival': '⚔️  Con rival',
    'panel.mode.solo': '🤖  Solo',
    'panel.combat': 'Combate',
    'panel.round': 'Ronda',
    'panel.time': 'Tiempo',
    'panel.score': 'Marcador',
    'panel.status': 'Estado',
    'panel.robots': 'Robots',
    'panel.speed': 'Velocidad de simulación',

    // HUD dinámico
    'hud.free': 'Libre',
    'hud.exits': 'Salidas: {n}',
    'hud.noRival': 'Sin rival',
    'hud.startPrefix': 'Inicio: {pos}',
    'hud.paused': '⏸ Pausado',
    'hud.fighting': '🥊 Combatiendo',
    'hud.userCode': 'Tu código',
    'pos.ESPALDAS': 'ESPALDAS',
    'pos.DE_LADO': 'DE LADO',
    'pos.DE_FRENTE': 'DE FRENTE',

    // Mensajes de resultado (motor → pantalla)
    'result.draw': 'Empate — {reason}',
    'result.win': '{name} gana el combate — {reason}',
    'result.matchWinA': '🏆 {name} (azul) gana la partida',
    'result.matchWinB': '🏆 {name} (rojo) gana la partida',
    'result.matchDraw': 'Partida empatada',
    'result.soloOut': 'Saliste del ring (salidas: {n})',
    'result.soloSurvive': 'Sobreviviste el límite de tiempo',
    'reason.saliste': 'saliste del ring',
    'reason.sobreviviste': 'sobreviviste el límite',
    'reason.dobleSalida': 'doble salida',
    'reason.empateTiempo': 'tiempo: empate',
    'reason.centrado': 'tiempo: gana el más centrado',

    // Panel de misión
    'mission.objective': 'Objetivo',
    'mission.context': 'Contexto',
    'mission.testLabel': 'Prueba',
    'mission.progress': 'Progreso de misión',
    'mission.stars.aria': 'Estrellas de la misión',
    'mission.progress.note': 'Pulsa Probar para medir tu avance.',
    'mission.progress.next': 'Siguiente: {desc}',
    'mission.progress.done': 'Misión completada. Puedes buscar 3 estrellas.',
    'mission.hint': 'Ver pista',
    'mission.hint.n': 'Ver pista ({n})',
    'mission.hint.none': 'No hay más pistas',
    'mission.level': 'Nivel',
    'mission.levelUp.max': '¡Nivel máximo!',
    'mission.level.progress': '{cur} / {next} XP para nivel {lvl}',
    'mission.run': '▶ Probar',
    'mission.solution.title': 'Ver solución',
    'mission.skip.title': 'Saltar misión',
    'mission.map': '🗺️ Mapa',
    'mission.worldLabel': 'Mundo {n} · {title}',

    // Mapa de misiones
    'map.tab.missions': 'Misiones',
    'map.tab.achievements': 'Logros',
    'map.world': 'Mundo {n}',
    'map.loading': 'Cargando…',
    'map.error': 'Error: {msg}',
    'map.locked': 'Bloqueada',
    'map.mission': 'Misión {id}',
    'map.missionStars': '{title} ({stars}★)',

    // Cargando (transición)
    'loader.text': 'Cargando…',

    // Confirmar solución
    'sol.title': '¿Ver la solución?',
    'sol.desc': 'Tu código actual será reemplazado por la solución completa. Úsala solo si ya lo intentaste de verdad.',
    'sol.cancel': 'Cancelar',
    'sol.yes': 'Sí, mostrar solución',

    // Toast de logro
    'ach.unlocked': 'Logro desbloqueado',

    // Level-up
    'levelup.title': '¡Subiste de nivel!',
    'levelup.msg.1': 'Buen comienzo',
    'levelup.msg.2': '¡Ya tienes ritmo!',
    'levelup.msg.3': 'Vas por buen camino',
    'levelup.msg.4': 'Casi un experto',
    'levelup.msg.5': 'Nivel máximo 🏆',
    'levelup.msg.more': '¡Increíble!',

    // Overlay de resultado (estrellas)
    'result.title.perfect': '¡Misión perfecta!',
    'result.title.done': 'Misión completada',
    'result.title.retry': 'Sigue intentando',
    'result.retry': 'Reintentar',
    'result.map': '🗺️ Mapa',
    'result.next': 'Siguiente →',

    // Editor de pintura
    'paint.title': '🎨 Editor de pintura',
    'paint.view3d': '🧊 3D',
    'paint.view2d': '🗺️ 2D (desplegado)',
    'paint.hint': 'Clic izquierdo: pintar · Clic derecho: girar · Rueda: zoom · Botón central: pan',
    'paint.undo.title': 'Deshacer',
    'paint.redo.title': 'Rehacer',
    'paint.new': '🆕 Nuevo',
    'paint.open': '📂 Abrir',
    'paint.save': '💾 Guardar',
    'paint.saveAs': '💾 Guardar como',
    'paint.export': '⬇ Exportar',
    'paint.import': '⬆ Importar',
    'paint.apply': '✔ Aplicar al robot',
    'paint.close.title': 'Cerrar',
    'paint.tool.brush': 'Pincel',
    'paint.tool.eraser': 'Goma',
    'paint.tool.bucket': 'Balde',
    'paint.tool.rect': 'Rectángulo',
    'paint.tool.circle': 'Círculo',
    'paint.tool.blur': 'Difuminar',
    'paint.tool.smudge': 'Arrastrar',
    'paint.tool.smudge.title': 'Arrastrar color',
    'paint.tool.eyedrop': 'Gotero',
    'paint.tool.mirror': 'Espejo',
    'paint.tool.mirror.title': 'Pintura espejada',
    'paint.tool.clear': 'Limpiar',
    'paint.tool.clear.title': 'Limpiar pieza activa',
    'paint.color': 'Color',
    'paint.size': 'Tamaño',
    'paint.hardness': 'Dureza',
    'paint.opacity': 'Opacidad',
    'paint.spacing': 'Espaciado',
    'paint.parts': 'Piezas',

    // Menú superior
    'menu.file': 'Archivo',
    'menu.windows': 'Ventanas',
    'menu.config': 'Configuración',
    'menu.tutorials': 'Tutoriales',
    'menu.file.new': '🆕 Nuevo proyecto',
    'menu.file.open': '📂 Abrir proyecto…',
    'menu.file.save': '💾 Guardar',
    'menu.file.saveAs': '💾 Guardar como…',
    'menu.file.import': '📥 Importar proyecto (.sumo)…',
    'menu.file.export': '📤 Exportar proyecto (.sumo)',
    'menu.file.localNote': 'Guardado local en este navegador — usa Exportar para hacer una copia en tu equipo.',
    'menu.file.newDone': '🆕 Nuevo proyecto',
    'menu.file.opened': '📂 Proyecto abierto: {name}',
    'menu.file.saved': '💾 Proyecto guardado: {name}',
    'menu.file.imported': '📥 Proyecto importado: {name}',
    'menu.file.exported': '📤 Proyecto exportado: {name}.sumo',
    'menu.windows.restore': '↺ Restaurar diseño predeterminado',
    'menu.config.theme': 'Tema',
    'menu.config.light': 'Modo claro',
    'menu.config.accent': 'Acento',
    'menu.config.mute': 'Silenciar sonido',
    'menu.accent.azul': 'Azul',
    'menu.accent.violeta': 'Violeta',
    'menu.accent.verde': 'Verde',
    'menu.tour.start': '▶ Iniciar',

    // Panel: nombres visibles
    'panel.name.editor': 'Editor',
    'panel.name.console': 'Consola',
    'panel.name.serial': 'Monitor Serie',
    'panel.name.deviceFiles': 'Archivos del robot',
    'panel.name.arena': 'Visualización 3D',
    'panel.name.control': 'Control',
    'panel.name.inspector': 'Inspector',
    'panel.name.assets': 'Assets',
    'panel.stub.inspector': 'Próximamente: aquí verás las especificaciones físicas del sumobot (tamaño, velocidad máxima, masa) y detalles del bot seleccionado.',
    'panel.stub.assets': 'Próximamente: explorador de bots preestablecidos y skins guardadas.',
    'dock.close': 'Cerrar',
    'dock.empty': 'Sin paneles — ábrelos desde el menú Ventanas.',

    // Tours
    'tour.skip': 'Saltar',
    'tour.prev': 'Anterior',
    'tour.next': 'Siguiente',
    'tour.finish': 'Finalizar',
    'tour.item.pyblock.title': 'Aprender pyblock',
    'tour.item.pyblock.desc': 'Categorías, abrir bloques, arrastrarlos al editor y usar la guía de bloques.',
    'tour.item.paint.title': 'Pintar el bot',
    'tour.item.paint.desc': 'Herramientas, colores, vista 3D/2D y cómo aplicar el diseño al robot virtual.',
    'tour.item.interfaz.title': 'Tour de la interfaz',
    'tour.item.interfaz.desc': 'Conoce la barra de menú, el editor, la arena y el panel de control.',
    'tour.item.primera.title': 'Cómo completar tu primera misión',
    'tour.item.primera.desc': 'Del mapa de misiones a tu primer resultado con estrellas.',

    'tour.interfaz.1.title': 'Barra de menú',
    'tour.interfaz.1.text': 'Desde aquí controlas qué ventanas se ven, la apariencia de la app y los tutoriales.',
    'tour.interfaz.2.title': 'Pintar tu sumobot',
    'tour.interfaz.2.text': 'Personaliza el diseño de la tapa de tu robot.',
    'tour.interfaz.3.title': 'Modo Aprender',
    'tour.interfaz.3.text': 'Cambia entre SumoLab libre y misiones guiadas paso a paso.',
    'tour.interfaz.4.title': 'Editor y consola',
    'tour.interfaz.4.text': 'Aquí escribes tu código (Python, pyblock, JS o C++) y ves lo que imprime tu programa.',
    'tour.interfaz.5.title': 'Arena 3D',
    'tour.interfaz.5.text': 'Observa la simulación de combate en tiempo real.',
    'tour.interfaz.6.title': 'Panel de control',
    'tour.interfaz.6.text': 'Ajusta bots rivales, velocidad y modo de juego.',

    'tour.pyblock.1.title': 'Elige pyblock',
    'tour.pyblock.1.text': 'Abre este selector y cambia el lenguaje a pyblock para usar bloques en vez de escribir Python.',
    'tour.pyblock.2.title': 'Editor pyblock',
    'tour.pyblock.2.text': 'Este es el espacio donde armas tu programa arrastrando bloques.',
    'tour.pyblock.3.title': 'Categorías',
    'tour.pyblock.3.text': 'Las categorías agrupan bloques: Motores, LED y tiempo, Sensores, Control, Lógica y Números.',
    'tour.pyblock.4.title': 'Abrir una categoría',
    'tour.pyblock.4.text': 'Haz clic en una categoría para ver sus bloques disponibles.',
    'tour.pyblock.5.title': 'Agregar un bloque',
    'tour.pyblock.5.text': 'Arrastra un bloque desde esta bandeja hacia el área central y conéctalo debajo de INICIO.',
    'tour.pyblock.6.title': 'Guía de misión',
    'tour.pyblock.6.text': 'En Aprender, esta guía te muestra bloques nuevos, para qué sirven y los pasos de la misión. Puedes minimizarla.',
    'tour.pyblock.7.title': 'Ver código',
    'tour.pyblock.7.text': 'Este botón muestra el CircuitPython generado por tus bloques.',

    'tour.paint.1.title': 'Editor de pintura',
    'tour.paint.1.text': 'Aquí personalizas la apariencia del sumobot virtual. Puedes pintar directamente sobre el modelo 3D o usar la vista 2D desplegada.',
    'tour.paint.2.title': 'Vista 3D',
    'tour.paint.2.text': 'Esta vista sirve para pintar el robot como lo verías en la arena. Clic izquierdo pinta, clic derecho gira y la rueda hace zoom.',
    'tour.paint.3.title': 'Lienzo del robot',
    'tour.paint.3.text': 'Pasa el cursor sobre una pieza y pinta encima. El editor detecta la superficie del modelo y coloca el color en la textura correcta.',
    'tour.paint.4.title': 'Herramientas',
    'tour.paint.4.text': 'Usa pincel, goma, balde, figuras, difuminar, arrastrar color o gotero según el tipo de diseño que quieras hacer.',
    'tour.paint.5.title': 'Pincel',
    'tour.paint.5.text': 'El pincel es la herramienta básica para dibujar líneas y detalles. Si quieres borrar, cambia a Goma.',
    'tour.paint.6.title': 'Color',
    'tour.paint.6.text': 'Elige el color con el selector, escribe un valor hexadecimal o guarda colores frecuentes como muestras.',
    'tour.paint.7.title': 'Tamaño del trazo',
    'tour.paint.7.text': 'Ajusta el tamaño, dureza, opacidad y espaciado para pasar de trazos finos a áreas grandes.',
    'tour.paint.8.title': 'Espejo',
    'tour.paint.8.text': 'Activa Espejo para pintar simétricamente. Es útil para patrones iguales en ambos lados del robot.',
    'tour.paint.9.title': 'Vista 2D',
    'tour.paint.9.text': 'La vista 2D muestra las piezas desplegadas. Sirve para limpiar bordes, trabajar por pieza o hacer detalles más precisos.',
    'tour.paint.10.title': 'Piezas',
    'tour.paint.10.text': 'Toca una pieza para enfocarla en 2D. Así puedes pintar tapa, laterales u otras superficies por separado.',
    'tour.paint.11.title': 'Aplicar al robot',
    'tour.paint.11.text': 'Cuando el diseño te guste, pulsa Aplicar al robot para verlo en el sumobot de la simulación.',
    'tour.paint.12.title': 'Cerrar',
    'tour.paint.12.text': 'Cierra el editor para volver al laboratorio. El último diseño aplicado queda visible en la arena.',

    'tour.primera.1.title': 'Entra a Aprender',
    'tour.primera.1.text': 'Haz clic aquí para ver el mapa de misiones a pantalla completa.',
    'tour.primera.2.title': 'Elige una misión',
    'tour.primera.2.text': 'Toca el primer círculo desbloqueado del mapa para empezar.',
    'tour.primera.3.title': 'Prueba tu código',
    'tour.primera.3.text': 'Cuando tengas tu misión abierta, este botón compila y corre tu robot.',
    'tour.primera.4.title': 'Resultado',
    'tour.primera.4.text': 'Al terminar la prueba verás cuántas estrellas ganaste y el XP/gemas.',

    // Dispositivo (IdeaBoard)
    'device.btn.disconnected': 'Conectar IdeaBoard',
    'device.btn.connecting': 'Conectando…',
    'device.btn.connected': 'Desconectar IdeaBoard',
    'device.btn.uploading': 'Subiendo…',
    'device.btn.error': 'Reintentar conexión',
    'device.status.disconnected': 'Desconectado',
    'device.status.connecting': 'Conectando…',
    'device.status.connected': 'Conectado',
    'device.status.uploading': 'Subiendo…',
    'device.status.error': 'Error de conexión',
    'device.unsupported.title': 'Tu navegador no soporta Web Serial. Usa Chrome o Edge de escritorio para conectar la IdeaBoard.',
    'device.unsupported.status': 'No disponible en este navegador (usa Chrome/Edge de escritorio).',
    'device.unsupported.files': 'No disponible en este navegador.',
    'device.activity': 'última actividad {ago}',
    'device.time.now': 'justo ahora',
    'device.time.sec': 'hace {n} s',
    'device.time.min': 'hace {n} min',
    'device.files.folder': 'Carpeta',
    'device.files.connect': 'Conecta la IdeaBoard para ver sus archivos.',
    'device.files.error': 'Error al listar archivos: {err}',
    'device.files.none': 'No hay archivos en la IdeaBoard.',
    'device.file.download': 'Descargar',
    'device.file.delete': 'Eliminar',
    'device.notify.opened': '📄 {name} cargado en el editor.',
    'device.notify.openFail': '✗ No se pudo abrir {name}: {err}',
    'device.notify.downloadFail': '✗ No se pudo descargar {name}: {err}',
    'device.confirm.delete': '¿Eliminar "{name}" de la IdeaBoard? Esta acción no se puede deshacer.',
    'device.notify.deleted': '🗑 {name} eliminado de la IdeaBoard.',
    'device.notify.deleteFail': '✗ No se pudo eliminar {name}: {err}',
    'device.notify.error': '✗ IdeaBoard: {err}',
    'device.notify.connected': '🔌 IdeaBoard conectada.',
    'device.notify.disconnected': '🔌 {err}',
    'device.notify.uploadNoPy': '✗ El lenguaje actual no genera CircuitPython. Cambia a 🐍 Python o 🧩 pyblock para subir al robot.',
    'device.notify.uploaded': '⬆ Código subido a la IdeaBoard (code.py). Ejecutando…',
    'device.notify.uploadFail': '✗ Error al subir: {err}',
  },

  en: {
    // Landing
    'landing.sub': 'Program, train and battle virtual sumobots. Choose where you want to start.',
    'landing.lab.title': 'SumoLab',
    'landing.lab.desc': 'The complete lab: code editor, 3D simulation and full control. Program your bots and test them freely.',
    'landing.lab.cta': 'Enter the lab →',
    'landing.learn.title': 'Learn',
    'landing.learn.desc': 'Guided step-by-step missions. From zero to a competitive robot, with hints, challenges and achievements along the way.',
    'landing.learn.cta': 'Start learning →',
    'landing.battle.badge': 'Coming soon',
    'landing.battle.title': 'Battle',
    'landing.battle.desc': 'Take your bots into game-style combat, like the real fights: tournaments, rivals and ranking. Still in development.',
    'landing.battle.cta': 'In development 🚧',
    'landing.battle.soon': 'Coming very soon! 🔒',
    'landing.foot': 'Developed by <b>Sebastián Aguilar</b>',

    // Header
    'header.home': 'Home',
    'header.home.title': 'Back to home',
    'header.logo.title': 'Back to home',
    'header.connect.title': 'Connect the IdeaBoard over USB (serial port). Requires desktop Chrome or Edge.',
    'header.paint': 'Paint',
    'header.paint.title': 'Customize and paint your sumobot\'s shell',
    'header.learn': 'Learn',
    'header.learn.title': 'Learn mode — guided missions',
    'header.lang.title': 'Idioma / Language',
    'header.section.sumolab': 'SumoLab',
    'header.section.learn': 'Learn',

    // Editor toolbar
    'toolbar.run.title': 'Compile and run your code (Ctrl+Enter)',
    'toolbar.run': 'Run my bot',
    'toolbar.run.active': 'Running…',
    'toolbar.run.paused': 'Paused',
    'toolbar.pause.title': 'Pause / resume',
    'toolbar.pause': 'Pause',
    'toolbar.reset.title': 'Restart match',
    'toolbar.reset': 'Reset',
    'toolbar.upload.title': 'Upload the current code to the connected IdeaBoard (writes code.py and runs it)',
    'toolbar.upload': 'Upload to robot',
    'toolbar.lang.title': 'Programming language',

    // Console
    'console.clear': '🗑 Clear',
    'console.clear.title': 'Clear console',

    // Serial monitor
    'serial.interrupt.title': 'Stop the program on the robot (Ctrl+C)',
    'serial.reload.title': 'Restart and run code.py (Ctrl+D)',
    'serial.clear.title': 'Clear',
    'serial.input.placeholder': 'Type and press Enter to send to the IdeaBoard REPL…',
    'serial.send': 'Send',

    // Robot files
    'files.refresh': '↻ Refresh',
    'files.refresh.title': 'Refresh list',
    'files.empty.connect': 'Connect the IdeaBoard to see its files.',
    'files.empty.none': 'No files on the IdeaBoard.',
    'files.error.list': 'Error listing files: ',
    'files.folder': 'Folder',

    // Arena
    'arena.overlays.title': 'Show sensor overlays',
    'arena.overlays': 'Sensors',

    // Control panel
    'panel.mode': 'Game mode',
    'panel.mode.rival': '⚔️  With rival',
    'panel.mode.solo': '🤖  Solo',
    'panel.combat': 'Combat',
    'panel.round': 'Round',
    'panel.time': 'Time',
    'panel.score': 'Score',
    'panel.status': 'Status',
    'panel.robots': 'Robots',
    'panel.speed': 'Simulation speed',

    // Dynamic HUD
    'hud.free': 'Free',
    'hud.exits': 'Ring-outs: {n}',
    'hud.noRival': 'No rival',
    'hud.startPrefix': 'Start: {pos}',
    'hud.paused': '⏸ Paused',
    'hud.fighting': '🥊 Fighting',
    'hud.userCode': 'Your code',
    'pos.ESPALDAS': 'BACK TO BACK',
    'pos.DE_LADO': 'SIDE BY SIDE',
    'pos.DE_FRENTE': 'FACE TO FACE',

    // Result messages (engine → screen)
    'result.draw': 'Draw — {reason}',
    'result.win': '{name} wins the round — {reason}',
    'result.matchWinA': '🏆 {name} (blue) wins the match',
    'result.matchWinB': '🏆 {name} (red) wins the match',
    'result.matchDraw': 'Match tied',
    'result.soloOut': 'You left the ring (ring-outs: {n})',
    'result.soloSurvive': 'You survived the time limit',
    'reason.saliste': 'left the ring',
    'reason.sobreviviste': 'survived the limit',
    'reason.dobleSalida': 'double ring-out',
    'reason.empateTiempo': 'time: draw',
    'reason.centrado': 'time: most centered wins',

    // Mission panel
    'mission.objective': 'Objective',
    'mission.context': 'Context',
    'mission.testLabel': 'Test',
    'mission.progress': 'Mission progress',
    'mission.stars.aria': 'Mission stars',
    'mission.progress.note': 'Press Test to measure your progress.',
    'mission.progress.next': 'Next: {desc}',
    'mission.progress.done': 'Mission complete. You can aim for 3 stars.',
    'mission.hint': 'Show hint',
    'mission.hint.n': 'Show hint ({n})',
    'mission.hint.none': 'No more hints',
    'mission.level': 'Level',
    'mission.levelUp.max': 'Max level!',
    'mission.level.progress': '{cur} / {next} XP to level {lvl}',
    'mission.run': '▶ Test',
    'mission.solution.title': 'Show solution',
    'mission.skip.title': 'Skip mission',
    'mission.map': '🗺️ Map',
    'mission.worldLabel': 'World {n} · {title}',

    // Mission map
    'map.tab.missions': 'Missions',
    'map.tab.achievements': 'Achievements',
    'map.world': 'World {n}',
    'map.loading': 'Loading…',
    'map.error': 'Error: {msg}',
    'map.locked': 'Locked',
    'map.mission': 'Mission {id}',
    'map.missionStars': '{title} ({stars}★)',

    // Loader
    'loader.text': 'Loading…',

    // Solution confirm
    'sol.title': 'Show the solution?',
    'sol.desc': 'Your current code will be replaced by the full solution. Use it only if you have really tried.',
    'sol.cancel': 'Cancel',
    'sol.yes': 'Yes, show solution',

    // Achievement toast
    'ach.unlocked': 'Achievement unlocked',

    // Level-up
    'levelup.title': 'You leveled up!',
    'levelup.msg.1': 'Good start',
    'levelup.msg.2': 'You\'ve got rhythm!',
    'levelup.msg.3': 'You\'re on the right track',
    'levelup.msg.4': 'Almost an expert',
    'levelup.msg.5': 'Max level 🏆',
    'levelup.msg.more': 'Amazing!',

    // Result overlay (stars)
    'result.title.perfect': 'Perfect mission!',
    'result.title.done': 'Mission complete',
    'result.title.retry': 'Keep trying',
    'result.retry': 'Retry',
    'result.map': '🗺️ Map',
    'result.next': 'Next →',

    // Paint editor
    'paint.title': '🎨 Paint editor',
    'paint.view3d': '🧊 3D',
    'paint.view2d': '🗺️ 2D (unfolded)',
    'paint.hint': 'Left click: paint · Right click: rotate · Wheel: zoom · Middle button: pan',
    'paint.undo.title': 'Undo',
    'paint.redo.title': 'Redo',
    'paint.new': '🆕 New',
    'paint.open': '📂 Open',
    'paint.save': '💾 Save',
    'paint.saveAs': '💾 Save as',
    'paint.export': '⬇ Export',
    'paint.import': '⬆ Import',
    'paint.apply': '✔ Apply to robot',
    'paint.close.title': 'Close',
    'paint.tool.brush': 'Brush',
    'paint.tool.eraser': 'Eraser',
    'paint.tool.bucket': 'Bucket',
    'paint.tool.rect': 'Rectangle',
    'paint.tool.circle': 'Circle',
    'paint.tool.blur': 'Blur',
    'paint.tool.smudge': 'Smudge',
    'paint.tool.smudge.title': 'Smudge color',
    'paint.tool.eyedrop': 'Eyedropper',
    'paint.tool.mirror': 'Mirror',
    'paint.tool.mirror.title': 'Mirrored painting',
    'paint.tool.clear': 'Clear',
    'paint.tool.clear.title': 'Clear active part',
    'paint.color': 'Color',
    'paint.size': 'Size',
    'paint.hardness': 'Hardness',
    'paint.opacity': 'Opacity',
    'paint.spacing': 'Spacing',
    'paint.parts': 'Parts',

    // Top menu
    'menu.file': 'File',
    'menu.windows': 'Windows',
    'menu.config': 'Settings',
    'menu.tutorials': 'Tutorials',
    'menu.file.new': '🆕 New project',
    'menu.file.open': '📂 Open project…',
    'menu.file.save': '💾 Save',
    'menu.file.saveAs': '💾 Save as…',
    'menu.file.import': '📥 Import project (.sumo)…',
    'menu.file.export': '📤 Export project (.sumo)',
    'menu.file.localNote': 'Saved locally in this browser — use Export to make a copy on your computer.',
    'menu.file.newDone': '🆕 New project',
    'menu.file.opened': '📂 Project opened: {name}',
    'menu.file.saved': '💾 Project saved: {name}',
    'menu.file.imported': '📥 Project imported: {name}',
    'menu.file.exported': '📤 Project exported: {name}.sumo',
    'menu.windows.restore': '↺ Restore default layout',
    'menu.config.theme': 'Theme',
    'menu.config.light': 'Light mode',
    'menu.config.accent': 'Accent',
    'menu.config.mute': 'Mute sound',
    'menu.accent.azul': 'Blue',
    'menu.accent.violeta': 'Purple',
    'menu.accent.verde': 'Green',
    'menu.tour.start': '▶ Start',

    // Panel display names
    'panel.name.editor': 'Editor',
    'panel.name.console': 'Console',
    'panel.name.serial': 'Serial Monitor',
    'panel.name.deviceFiles': 'Robot files',
    'panel.name.arena': '3D View',
    'panel.name.control': 'Control',
    'panel.name.inspector': 'Inspector',
    'panel.name.assets': 'Assets',
    'panel.stub.inspector': 'Coming soon: here you\'ll see the sumobot\'s physical specs (size, top speed, mass) and details of the selected bot.',
    'panel.stub.assets': 'Coming soon: browser of preset bots and saved skins.',
    'dock.close': 'Close',
    'dock.empty': 'No panels — open them from the Windows menu.',

    // Tours
    'tour.skip': 'Skip',
    'tour.prev': 'Previous',
    'tour.next': 'Next',
    'tour.finish': 'Finish',
    'tour.item.pyblock.title': 'Learn pyblock',
    'tour.item.pyblock.desc': 'Categories, opening blocks, dragging them to the editor and using the block guide.',
    'tour.item.paint.title': 'Paint the bot',
    'tour.item.paint.desc': 'Tools, colors, 3D/2D view and how to apply the design to the virtual robot.',
    'tour.item.interfaz.title': 'Interface tour',
    'tour.item.interfaz.desc': 'Get to know the menu bar, the editor, the arena and the control panel.',
    'tour.item.primera.title': 'How to complete your first mission',
    'tour.item.primera.desc': 'From the mission map to your first starred result.',

    'tour.interfaz.1.title': 'Menu bar',
    'tour.interfaz.1.text': 'From here you control which windows are shown, the app\'s look and the tutorials.',
    'tour.interfaz.2.title': 'Paint your sumobot',
    'tour.interfaz.2.text': 'Customize the design of your robot\'s shell.',
    'tour.interfaz.3.title': 'Learn mode',
    'tour.interfaz.3.text': 'Switch between free SumoLab and guided step-by-step missions.',
    'tour.interfaz.4.title': 'Editor and console',
    'tour.interfaz.4.text': 'Here you write your code (Python, pyblock, JS or C++) and see what your program prints.',
    'tour.interfaz.5.title': '3D Arena',
    'tour.interfaz.5.text': 'Watch the combat simulation in real time.',
    'tour.interfaz.6.title': 'Control panel',
    'tour.interfaz.6.text': 'Adjust rival bots, speed and game mode.',

    'tour.pyblock.1.title': 'Choose pyblock',
    'tour.pyblock.1.text': 'Open this selector and change the language to pyblock to use blocks instead of writing Python.',
    'tour.pyblock.2.title': 'pyblock editor',
    'tour.pyblock.2.text': 'This is where you build your program by dragging blocks.',
    'tour.pyblock.3.title': 'Categories',
    'tour.pyblock.3.text': 'Categories group blocks: Motors, LED and time, Sensors, Control, Logic and Numbers.',
    'tour.pyblock.4.title': 'Open a category',
    'tour.pyblock.4.text': 'Click a category to see its available blocks.',
    'tour.pyblock.5.title': 'Add a block',
    'tour.pyblock.5.text': 'Drag a block from this tray to the central area and connect it below START.',
    'tour.pyblock.6.title': 'Mission guide',
    'tour.pyblock.6.text': 'In Learn mode, this guide shows you new blocks, what they do and the mission steps. You can minimize it.',
    'tour.pyblock.7.title': 'View code',
    'tour.pyblock.7.text': 'This button shows the CircuitPython generated by your blocks.',

    'tour.paint.1.title': 'Paint editor',
    'tour.paint.1.text': 'Here you customize the look of the virtual sumobot. You can paint directly on the 3D model or use the unfolded 2D view.',
    'tour.paint.2.title': '3D view',
    'tour.paint.2.text': 'This view lets you paint the robot as you\'d see it in the arena. Left click paints, right click rotates and the wheel zooms.',
    'tour.paint.3.title': 'Robot canvas',
    'tour.paint.3.text': 'Hover over a part and paint on it. The editor detects the model\'s surface and places the color on the correct texture.',
    'tour.paint.4.title': 'Tools',
    'tour.paint.4.text': 'Use brush, eraser, bucket, shapes, blur, smudge or eyedropper depending on the design you want.',
    'tour.paint.5.title': 'Brush',
    'tour.paint.5.text': 'The brush is the basic tool for drawing lines and details. To erase, switch to Eraser.',
    'tour.paint.6.title': 'Color',
    'tour.paint.6.text': 'Pick the color with the selector, type a hexadecimal value or save frequent colors as swatches.',
    'tour.paint.7.title': 'Stroke size',
    'tour.paint.7.text': 'Adjust size, hardness, opacity and spacing to go from fine strokes to large areas.',
    'tour.paint.8.title': 'Mirror',
    'tour.paint.8.text': 'Enable Mirror to paint symmetrically. It\'s useful for matching patterns on both sides of the robot.',
    'tour.paint.9.title': '2D view',
    'tour.paint.9.text': 'The 2D view shows the unfolded parts. It\'s useful to clean up edges, work part by part or make more precise details.',
    'tour.paint.10.title': 'Parts',
    'tour.paint.10.text': 'Tap a part to focus it in 2D. This way you can paint the shell, sides or other surfaces separately.',
    'tour.paint.11.title': 'Apply to robot',
    'tour.paint.11.text': 'When you like the design, press Apply to robot to see it on the sumobot in the simulation.',
    'tour.paint.12.title': 'Close',
    'tour.paint.12.text': 'Close the editor to return to the lab. The last applied design stays visible in the arena.',

    'tour.primera.1.title': 'Enter Learn mode',
    'tour.primera.1.text': 'Click here to see the mission map in full screen.',
    'tour.primera.2.title': 'Pick a mission',
    'tour.primera.2.text': 'Tap the first unlocked circle on the map to start.',
    'tour.primera.3.title': 'Test your code',
    'tour.primera.3.text': 'Once your mission is open, this button compiles and runs your robot.',
    'tour.primera.4.title': 'Result',
    'tour.primera.4.text': 'When the test finishes you\'ll see how many stars you earned and the XP/gems.',

    // Device (IdeaBoard)
    'device.btn.disconnected': 'Connect IdeaBoard',
    'device.btn.connecting': 'Connecting…',
    'device.btn.connected': 'Disconnect IdeaBoard',
    'device.btn.uploading': 'Uploading…',
    'device.btn.error': 'Retry connection',
    'device.status.disconnected': 'Disconnected',
    'device.status.connecting': 'Connecting…',
    'device.status.connected': 'Connected',
    'device.status.uploading': 'Uploading…',
    'device.status.error': 'Connection error',
    'device.unsupported.title': 'Your browser does not support Web Serial. Use desktop Chrome or Edge to connect the IdeaBoard.',
    'device.unsupported.status': 'Not available in this browser (use desktop Chrome/Edge).',
    'device.unsupported.files': 'Not available in this browser.',
    'device.activity': 'last activity {ago}',
    'device.time.now': 'just now',
    'device.time.sec': '{n} s ago',
    'device.time.min': '{n} min ago',
    'device.files.folder': 'Folder',
    'device.files.connect': 'Connect the IdeaBoard to see its files.',
    'device.files.error': 'Error listing files: {err}',
    'device.files.none': 'No files on the IdeaBoard.',
    'device.file.download': 'Download',
    'device.file.delete': 'Delete',
    'device.notify.opened': '📄 {name} loaded into the editor.',
    'device.notify.openFail': '✗ Could not open {name}: {err}',
    'device.notify.downloadFail': '✗ Could not download {name}: {err}',
    'device.confirm.delete': 'Delete "{name}" from the IdeaBoard? This action cannot be undone.',
    'device.notify.deleted': '🗑 {name} deleted from the IdeaBoard.',
    'device.notify.deleteFail': '✗ Could not delete {name}: {err}',
    'device.notify.error': '✗ IdeaBoard: {err}',
    'device.notify.connected': '🔌 IdeaBoard connected.',
    'device.notify.disconnected': '🔌 {err}',
    'device.notify.uploadNoPy': '✗ The current language does not generate CircuitPython. Switch to 🐍 Python or 🧩 pyblock to upload to the robot.',
    'device.notify.uploaded': '⬆ Code uploaded to the IdeaBoard (code.py). Running…',
    'device.notify.uploadFail': '✗ Upload error: {err}',
  },
};

// ── Estado ──────────────────────────────────────────────────────────────────
function detectInitial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LANGS.includes(saved)) return saved;
  } catch (_) {}
  try {
    const nav = (navigator.language || '').toLowerCase();
    if (nav.startsWith('en')) return 'en';
    if (nav.startsWith('es')) return 'es';
  } catch (_) {}
  return DEFAULT_LANG;
}

let lang = detectInitial();

// ── API ─────────────────────────────────────────────────────────────────────
export function getLang() { return lang; }

/** Traduce una clave; interpola {x} con params. Cae al español y luego a la clave. */
export function t(key, params) {
  const table = MESSAGES[lang] || MESSAGES[DEFAULT_LANG];
  let str = table[key];
  if (str == null) str = MESSAGES[DEFAULT_LANG][key];
  if (str == null) return key;
  if (params) {
    str = str.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
  }
  return str;
}

/** Aplica las traducciones al HTML estático dentro de `root` (por defecto, todo el documento). */
export function applyStaticTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
}

/** Cambia el idioma activo, persiste, re-aplica el HTML y avisa a los módulos dinámicos. */
export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next;
  try { localStorage.setItem(KEY, lang); } catch (_) {}
  document.documentElement.setAttribute('lang', lang);
  applyStaticTranslations();
  document.dispatchEvent(new CustomEvent('eteria:langchange', { detail: { lang } }));
}

/** Suscribe un callback a los cambios de idioma. Devuelve una función para desuscribir. */
export function onLangChange(cb) {
  const handler = (e) => cb(e.detail.lang);
  document.addEventListener('eteria:langchange', handler);
  return () => document.removeEventListener('eteria:langchange', handler);
}

/** Inicializa el idioma al cargar: fija <html lang> y traduce el HTML estático. */
export function initI18n() {
  document.documentElement.setAttribute('lang', lang);
  applyStaticTranslations();
}
