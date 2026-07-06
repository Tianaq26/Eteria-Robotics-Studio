// ======================================================
// mobileMedia.js — Punto único de verdad para "¿estamos en celular?".
//
// El query tiene dos ramas:
//   1. max-width 820px  → celular/tablet en vertical (el breakpoint clásico).
//   2. pointer coarse + max-height 500px → celular GIRADO a horizontal: el
//      ancho supera 820px (p. ej. 844x390) pero sigue siendo un teléfono táctil,
//      así que debe conservar el layout móvil (2 franjas, ahora lado a lado).
//
// IMPORTANTE: styles.css repite este mismo query en sus @media — si cambias
// esto, cambia también los bloques marcados con "breakpoint móvil" allí.
// ======================================================

export const MOBILE_MEDIA_QUERY =
  '(max-width: 820px), (pointer: coarse) and (max-height: 500px)';

export const mobileMql =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia(MOBILE_MEDIA_QUERY)
    : null;

export function isMobile() {
  return !!(mobileMql && mobileMql.matches);
}
