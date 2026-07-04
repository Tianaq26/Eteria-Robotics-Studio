// SpinnerBot ("Girador") — conduce en círculo; si ve al rival, embiste.
export default {
  name: 'SpinnerBot',
  update(s) {
    if (s.border.any) return { left: -1, right: -0.3 };   // borde: corrige
    if (s.enemy.detected && s.enemy.distance < 55) return { left: 1, right: 1 }; // embiste
    return { left: 1, right: 0.35 };                        // círculo
  },
};
