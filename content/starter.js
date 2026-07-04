// Programa tu sumobot. update(s) se llama cada tick del combate.
// Sensores (s):
//   s.enemy.detected  -> ¿ves al rival al frente?
//   s.enemy.distance  -> cm hasta el rival (o null)
//   s.enemy.bearing   -> -1 derecha ... 0 frente ... +1 izquierda
//   s.border.front / s.border.any / s.border.frontLeft ...  -> línea blanca
//   s.contact         -> ¿estás tocando al rival?
// Devuelve velocidades de rueda en rango -1..1:  { left, right }
function update(s) {
  if (s.border.front) return { left: -1, right: -1 };   // evita caerte
  if (s.enemy.detected) return { left: 1, right: 1 };   // embiste
  return { left: 1, right: 0.3 };                       // busca en arco
}
