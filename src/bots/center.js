// CenterBot ("Centrador") — defiende el centro: retrocede del borde y carga al rival.
export default {
  name: 'CenterBot',
  update(s) {
    if (s.border.front) return { left: -1, right: -1 };    // borde al frente: retrocede
    if (s.border.any)   return { left: -1, right: 1 };      // borde lateral/trasero: gira al centro
    if (s.enemy.detected) return { left: 1, right: 1 };     // ve rival: empuja
    return { left: 0.4, right: 0.4 };                       // mantiene posición central
  },
};
