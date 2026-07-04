// ux.js — Sistema de audio, micro-interacciones y efectos visuales
// Sonidos click, typing, transiciones de panel, ripple en botones.

// ── Audio ────────────────────────────────────────────────────────────────────
let _ctx = null;
function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
}

let _muted = false;

function beep({ freq = 440, type = 'sine', vol = 0.08, dur = 0.06, attack = 0.004, decay = 0.05, delay = 0 } = {}) {
  if (_muted) return;
  try {
    const c = ctx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type = type; o.frequency.value = freq;
    const t = c.currentTime + delay;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.start(t); o.stop(t + attack + decay + 0.01);
  } catch (_) {}
}

function noise({ vol = 0.04, dur = 0.015 } = {}) {
  if (_muted) return;
  try {
    const c = ctx();
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    src.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    src.start(); src.stop(c.currentTime + dur + 0.01);
  } catch (_) {}
}

export const SFX = {
  setMuted(v) { _muted = !!v; },
  isMuted()   { return _muted; },
  click()     { beep({ freq: 880, type: 'sine',     vol: 0.07, dur: 0.04, attack: 0.003, decay: 0.04 }); },
  clickSoft() { beep({ freq: 660, type: 'sine',     vol: 0.04, dur: 0.03, attack: 0.002, decay: 0.03 }); },
  type()      { noise({ vol: 0.018, dur: 0.010 }); },
  success()   {
    [523.25, 659.25, 783.99].forEach((f, i) =>
      beep({ freq: f, vol: 0.12, dur: 0.3, attack: 0.01, decay: 0.28, delay: i * 0.16 }));
  },
  unlock()    {
    [440, 554, 659, 880].forEach((f, i) =>
      beep({ freq: f, type: 'sine', vol: 0.09, dur: 0.18, attack: 0.008, decay: 0.16, delay: i * 0.09 }));
  },
  error()     { beep({ freq: 180, type: 'sawtooth', vol: 0.06, dur: 0.12, attack: 0.005, decay: 0.11 }); },
  skip()      { beep({ freq: 440, type: 'triangle', vol: 0.05, dur: 0.08, attack: 0.004, decay: 0.07 }); },
  hint()      { beep({ freq: 740, type: 'sine',     vol: 0.06, dur: 0.1,  attack: 0.005, decay: 0.09 }); },
  solution()  {
    [330, 415, 523].forEach((f, i) =>
      beep({ freq: f, type: 'triangle', vol: 0.08, dur: 0.18, attack: 0.01, decay: 0.16, delay: i * 0.08 }));
  },
  tabSwitch() { beep({ freq: 520, type: 'sine',    vol: 0.04, dur: 0.05, attack: 0.002, decay: 0.045 }); },
  star(n)     {
    const freqs = [[523.25],[523.25,659.25],[523.25,659.25,783.99]][n-1] || [];
    freqs.forEach((f, i) => beep({ freq: f, vol: 0.13, dur: 0.35, attack: 0.01, decay: 0.32, delay: i * 0.18 }));
  },
};

// ── Ripple en botones ────────────────────────────────────────────────────────
function addRipple(btn) {
  btn.addEventListener('pointerdown', (e) => {
    const r = btn.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const rip = document.createElement('span');
    rip.className = 'ux-ripple';
    rip.style.cssText = `left:${x}px;top:${y}px`;
    btn.appendChild(rip);
    rip.addEventListener('animationend', () => rip.remove());
  });
}

export function initRipples(root = document) {
  root.querySelectorAll('button').forEach(addRipple);
}

// Observa nuevos botones añadidos al DOM (para modales, etc.)
const _rippleObs = new MutationObserver(muts => {
  muts.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType !== 1) return;
    if (n.tagName === 'BUTTON') addRipple(n);
    n.querySelectorAll && n.querySelectorAll('button').forEach(addRipple);
  }));
});
export function observeRipples(root = document.body) {
  _rippleObs.observe(root, { childList: true, subtree: true });
}

// ── Cursor glow suave (sigue al ratón en el canvas arena) ───────────────────
export function initCursorGlow(arenaEl) {
  const glow = document.createElement('div');
  glow.className = 'ux-cursor-glow';
  arenaEl.style.position = 'relative';
  arenaEl.appendChild(glow);
  arenaEl.addEventListener('mousemove', (e) => {
    const r = arenaEl.getBoundingClientRect();
    glow.style.left = (e.clientX - r.left) + 'px';
    glow.style.top  = (e.clientY - r.top)  + 'px';
    glow.style.opacity = '1';
  });
  arenaEl.addEventListener('mouseleave', () => { glow.style.opacity = '0'; });
}

// ── Transición suave entre paneles del modal (tabs Misiones ↔ Logros) ───────
let _tabFrom = null;

export function animateTabTransition(fromEl, toEl, direction = 1) {
  if (!fromEl || !toEl) { if (toEl) toEl.style.display = ''; return; }
  const dist = 28;
  fromEl.style.transition = 'none';
  fromEl.style.transform  = 'translateX(0)';
  fromEl.style.opacity    = '1';
  requestAnimationFrame(() => {
    fromEl.style.transition = 'transform 0.22s cubic-bezier(.4,0,.2,1), opacity 0.22s ease';
    fromEl.style.transform  = `translateX(${-direction * dist}px)`;
    fromEl.style.opacity    = '0';
    toEl.style.display      = '';
    toEl.style.transition   = 'none';
    toEl.style.transform    = `translateX(${direction * dist}px)`;
    toEl.style.opacity      = '0';
    requestAnimationFrame(() => {
      toEl.style.transition = 'transform 0.22s cubic-bezier(.4,0,.2,1), opacity 0.22s ease';
      toEl.style.transform  = 'translateX(0)';
      toEl.style.opacity    = '1';
      fromEl.addEventListener('transitionend', () => {
        fromEl.style.display = 'none';
        fromEl.style.transition = fromEl.style.transform = fromEl.style.opacity = '';
      }, { once: true });
    });
  });
}

// ── Partículas de confetti ligero al completar misión ────────────────────────
export function burstConfetti(count = 22) {
  const colors = ['#a855f7','#3c82f0','#34d058','#ffd86e','#f87171'];
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'ux-confetti';
    const col = colors[i % colors.length];
    const x   = 30 + Math.random() * 40;  // % del viewport
    const rot = Math.random() * 360;
    const dur  = 0.7 + Math.random() * 0.6;
    const size = 4 + Math.random() * 5;
    p.style.cssText = `
      left:${x}vw; top:38vh;
      width:${size}px; height:${size}px;
      background:${col};
      transform:rotate(${rot}deg);
      animation: uxConfettiFall ${dur}s cubic-bezier(.2,.8,.4,1) ${Math.random()*0.3}s both;
    `;
    document.body.appendChild(p);
    p.addEventListener('animationend', () => p.remove());
  }
}

// ── Shimmer en el header badge cuando sube XP ───────────────────────────────
export function shimmerXp(el) {
  el.classList.remove('ux-shimmer');
  void el.offsetWidth;
  el.classList.add('ux-shimmer');
  el.addEventListener('animationend', () => el.classList.remove('ux-shimmer'), { once: true });
}
