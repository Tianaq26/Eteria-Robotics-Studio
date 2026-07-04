# Plan de implementación — Sistema Educativo
> Cada lote es revisable y funcional por sí solo.  
> Cada lote se revisa antes de continuar con el siguiente.  
> Si se pierde contexto, este archivo indica qué está hecho y qué sigue.

---

## MVP ACTUAL ✓
Editor · Física · 3D · Python · Bots

---

## LOTE A — Núcleo educativo mínimo ✅ COMPLETADO
- Esquema JSON de misiones
- Misiones Mundo 0 (4 misiones: 0.1 – 0.4)
- CurriculumLoader + MissionRunner + ProgressTracker (localStorage)
- Toggle Aprender / Arena
- Panel de misión (objetivo + narrativa + código inicial + pistas + resultado + estrellas)

**Entrega:** El estudiante completa su primera misión y recibe estrellas.

---

## LOTE B — Mapa de mundos + progresión ✅ COMPLETADO
- Mapa visual interactivo de misiones (nodos conectados, estado: completada / activa / bloqueada)
- Barra de XP + nivel en el panel de misión
- Animación de estrellas (spring bounce escalonado)
- Audio de recompensa con AudioContext (Do-Mi-Sol según estrellas)
- CSS polish: overlay con blur, entrada animada, glow púrpura

**Entrega:** El estudiante navega entre misiones y ve su progreso global.

---

## LOTE C — Asistente + sistema de pistas
- HintEngine con 3 capas:
  1. Pista genérica (ya existe, sin XP)
  2. Pista de diagnóstico (analiza métricas: "recorriste 8 cm de 30")
  3. Pista de código (detecta errores comunes: throttle=0, pixel=(0,0,0), etc.)
- Feedback detallado de criterios en el overlay (barra de progreso por criterio)
- Detección de errores comunes en el código antes de ejecutar

**Entrega:** El estudiante recibe ayuda contextual sin ver la solución directa.

---

## LOTE D — Overlays pedagógicos en la simulación
- Cono sonar visible (arco de detección del sensor de distancia)
- Indicadores IR en las esquinas del robot (se iluminan al detectar borde)
- Trail del robot (rastro de posición de los últimos N ticks)
- Zona de peligro del borde (anillo visual en el límite del dojo)

**Entrega:** El estudiante ve exactamente qué siente el robot en cada sensor.

---

## LOTE E — Logros + gamificación completa
- AchievementEngine (verifica condiciones al completar misiones)
- `content/achievements.json` con 10+ logros definidos
- Toast de logro sorpresa con animación (aparece sobre la arena)
- Galería de logros en el modal de misiones
- Animación de subida de nivel (efecto visual en el badge de XP)

**Entrega:** El estudiante descubre logros inesperados y quiere seguir.

---

## LOTE F — Contenido educativo completo
- Mundos 1–6 completos en JSON:
  - Mundo 1: Sensores (IR, sonar, contacto)
  - Mundo 2: Lógica y decisiones (if/else, estados)
  - Mundo 3: Movimiento avanzado (curvas, maniobras)
  - Mundo 4: Estrategia (atacar, esquivar, centrar)
  - Mundo 5: Optimización (tunear parámetros)
  - Mundo 6: Competencia (robot completo, torneo)
- Todos los logros implementados
- Rivales y arenas desbloqueables por progreso
- Texto educativo revisado y pulido

**Entrega:** Experiencia completa — 0 → robot competitivo.

---

## Estado actual
| Lote | Estado |
|------|--------|
| MVP  | ✅ |
| A    | ✅ |
| B    | ✅ |
| C    | ✅ |
| D    | ✅ |
| E    | ✅ |
| F    | ✅ |
