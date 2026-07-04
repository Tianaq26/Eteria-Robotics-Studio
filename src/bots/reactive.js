// ReactiveBot ("Reactivo") — busca, reacciona a la distancia y evita el borde.
export default {
  name: 'ReactiveBot',
  update(s) {
    if (s.border.front) return { left: -1, right: -1 };           // borde frontal: retrocede
    if (s.border.any)   return { left: -1, right: 1 };            // borde lateral: gira adentro
    if (s.enemy.detected && s.enemy.distance < 50) return { left: 1, right: 1 }; // cerca: embiste
    if (s.enemy.detected) {                                       // lejos: orienta hacia el rival
      return s.enemy.bearing > 0 ? { left: 0.3, right: 1 } : { left: 1, right: 0.3 };
    }
    return { left: 1, right: 0.3 };                               // arco de búsqueda
  },
};
