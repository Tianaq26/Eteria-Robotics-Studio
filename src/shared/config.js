// ======================================================
// config.js — Constantes de reglas y física (sumo robot)
// Unidades: cm, s, kg. Coordenadas: origen en el centro del dojo,
// +x derecha, +y ARRIBA. Mismos valores que el simulador nativo C++.
// ======================================================

export const RULES = {
  DOJO_R_EXT:  45.0,   // círculo exterior 90 cm Ø
  DOJO_R_INT:  40.0,   // círculo interior 80 cm Ø
  BORDE:        5.0,   // banda blanca (r 40..45)
  ARENA_HALF:  50.0,   // zona externa negra 100x100
  RINGOUT_R:   42.5,   // el centro cruza la mitad de la banda blanca
  COMBAT_TIME: 90.0,   // 1:30 por combate
  ROUNDS:       3,     // mejor de 3
};

export const ROBOT = {
  SIZE:       10.0,    // chasis ~11×11 cm (IdeaBoard + ruedas)
  COL_R:       5.5,    // radio sensor-contacto (≈ SIZE/2); la física usa OBB real
  MASS:        0.315,  // 315 g (límite reglamentario)
  WHEEL_BASE:  9.0,    // separación entre ruedas (cm)
  // 200 RPM × π × 3.8 cm (rueda) / 60 ≈ 40 cm/s
  WHEEL_VMAX: 40.0,    // velocidad lineal máxima de rueda (cm/s)
  IR_OFF:      3.0,    // offset de los sensores IR respecto al centro
};

export const SIM = {
  DT: 1 / 60,          // paso fijo de simulación (s)
  MAX_TICKS: Math.ceil(90 / (1 / 60)), // tope de seguridad por combate
};

// Posiciones de inicio (rotan cada combate).
export const START = { DE_FRENTE: 1, DE_LADO: 2 ,ESPALDAS: 3};
