#!/usr/bin/env python3
# ======================================================
# make-reel-music.py — Pista de fondo ORIGINAL (libre de derechos) para el reel.
# Estilo Tron: Legacy / Daft Punk: Re menor, ~120 BPM, oscuro y cinematografico.
#   - Arpegio supersaw implacable (16avos) con eco
#   - Bajo sub + supersaw detuneado
#   - Pad oscuro
#   - Bombo four-on-the-floor con SIDECHAIN (bombeo) sobre la parte musical
#   - Transiciones = risers/barridos que fluyen al corte + sub-drop en el
#     downbeat (en vez de impactos secos)
# Salida: social/assets/reel-music.wav
# Uso: python3 tools/make-reel-music.py
# ======================================================
import wave, os
import numpy as np

SR = 44100
DUR = 22.6
N = int(SR * DUR)

music = np.zeros(N)   # bus musical (recibe sidechain)
drums = np.zeros(N)   # bus percusion (no ducking)
fx    = np.zeros(N)   # risers / drops / barridos

def place(bus, buf, at):
    s0 = int(at * SR); s1 = min(N, s0 + len(buf))
    if s0 >= N or s1 <= 0: return
    bus[max(0, s0):s1] += buf[max(0, -s0):s1 - s0]

def adsr(n, a, d, s, r):
    e = np.zeros(n)
    ai = min(n, max(1, int(a * SR)))
    ri = min(n, max(1, int(r * SR)))
    di = int(d * SR)
    e[:ai] = np.linspace(0, 1, ai)
    body_end = max(ai, n - ri)
    if di > 0 and ai + di < body_end:
        e[ai:ai + di] = np.linspace(1, s, di)
        e[ai + di:body_end] = s
    else:
        e[ai:body_end] = 1.0
    if ri > 0:
        start = e[body_end - 1] if body_end > 0 else 1.0
        e[body_end:] = np.linspace(start, 0, n - body_end)
    return e

def saw(freq, n, nharm=9):
    tt = np.arange(n) / SR
    sig = np.zeros(n)
    for k in range(1, nharm + 1):
        sig += (1.0 / k) * np.sin(2 * np.pi * freq * k * tt)
    return sig

def supersaw(freq, n, detunes=(-0.011, -0.006, 0, 0.006, 0.011), nharm=8):
    sig = np.zeros(n)
    for d in detunes:
        sig += saw(freq * (1 + d), n, nharm)
    return sig / len(detunes)

def note(freq, dur, wave='super', nharm=8, a=0.004, d=0.06, s=0.3, r=0.06):
    n = max(2, int(dur * SR))
    if wave == 'super':
        sig = supersaw(freq, n, nharm=nharm)
    elif wave == 'saw':
        sig = saw(freq, n, nharm=nharm)
    else:  # sine + a couple harmonics
        tt = np.arange(n) / SR
        sig = np.sin(2 * np.pi * freq * tt) + 0.3 * np.sin(2 * np.pi * 2 * freq * tt)
    return sig * adsr(n, a, d, s, r)

# ── armonia (Re menor) ──
# triadas base + raiz de bajo por acorde; 4 beats por acorde
TRIADS = [
    ([146.83, 174.61, 220.00], 73.42),   # Dm  (D3 F3 A3)  bass D2
    ([116.54, 146.83, 174.61], 58.27),   # Bb  (Bb2 D3 F3) bass Bb1
    ([174.61, 220.00, 261.63], 87.31),   # F   (F3 A3 C4)  bass F2
    ([130.81, 164.81, 196.00], 65.41),   # C   (C3 E3 G3)  bass C2
]
BEAT = 0.5            # 120 BPM
CHORD = 4 * BEAT      # 2 s
SIX = BEAT / 2        # 16avo = 0.25? -> usamos 8avos rapidos. Ver ARP_STEP
ARP_STEP = BEAT / 4   # 16avos reales = 0.125 s (arpegio implacable)

# patron de arpegio: (indice de triada, multiplicador de octava)
ARP = [(0,1),(1,1),(2,1),(0,2),(2,1),(1,1),(2,2),(1,1)]

# cortes de escena del reel (segundos)
S_EDITOR, S_COMBATE, S_PINTURA, S_OUTRO = 3.8, 8.8, 12.6, 18.4
DRUMS_STOP = 21.2

# lista de acordes en el tiempo
chords = []
tsec = 0.0
i = 0
while tsec < DUR:
    chords.append((tsec, TRIADS[i % len(TRIADS)]))
    tsec += CHORD; i += 1

# ── PAD oscuro + BAJO + ARPEGIO ──
for cstart, (triad, broot) in chords:
    bright = cstart >= S_PINTURA
    # PAD (dos voces graves del acorde, largo)
    for f in triad[:2]:
        buf = note(f, CHORD + 0.3, wave='super', nharm=5, a=0.3, d=0.0, s=1.0, r=0.5)
        place(music, 0.045 * buf, cstart)
    # BAJO: sub sine + saw por beat (pulsante)
    if cstart >= S_EDITOR - 0.5:
        for b in range(int(CHORD / BEAT)):
            bs = cstart + b * BEAT
            sub = note(broot, 0.46, wave='sine', a=0.004, d=0.05, s=0.6, r=0.12)
            sw  = note(broot * 2, 0.42, wave='super', nharm=6, a=0.004, d=0.08, s=0.35, r=0.1)
            place(music, 0.30 * sub, bs)
            place(music, 0.10 * sw, bs)
    # ARPEGIO supersaw (16avos)
    arp_amp = 0.11 if cstart < S_EDITOR else 0.16
    steps = int(round(CHORD / ARP_STEP))
    for stp in range(steps):
        asec = cstart + stp * ARP_STEP
        if asec >= DUR: break
        ti, octm = ARP[stp % len(ARP)]
        f = triad[ti] * octm * (2 if bright and stp % 2 == 0 else 1)
        buf = note(f, ARP_STEP * 1.5, wave='super', nharm=9,
                   a=0.003, d=0.05, s=0.2, r=0.04)
        place(music, arp_amp * buf, asec)

# ── ECO del arpegio (delay estilo Tron) ──
delay = int(ARP_STEP * SR)           # 1 corchea de delay
echo = np.zeros(N)
g = 0.33
for tap in (1, 2, 3):
    shift = delay * tap * 2
    if shift < N:
        echo[shift:] += (g ** tap) * music[:N - shift]
music += 0.5 * echo

# ── BOMBO four-on-the-floor + HATS ──
kick_times = []
def kick(at):
    L = int(0.15 * SR); n = np.arange(L) / SR
    fsweep = 150 * np.exp(-n * 34) + 50
    ph = 2 * np.pi * np.cumsum(fsweep) / SR
    body = np.sin(ph) * np.exp(-n * 10)
    click = np.sin(2 * np.pi * 1800 * n) * np.exp(-n * 200) * 0.5
    place(drums, 0.9 * (body + click), at)
    kick_times.append(at)

def hat(at, amp=0.14, dcy=95):
    L = int(0.05 * SR); n = np.arange(L) / SR
    seg = (np.random.rand(L) * 2 - 1) * np.exp(-n * dcy)
    place(drums, amp * seg, at)

beat = 0.0
while beat < DUR:
    if S_EDITOR - 0.5 <= beat < DRUMS_STOP:
        kick(beat)
        hat(beat + 0.25, amp=0.14)
    if S_COMBATE <= beat < DRUMS_STOP:
        hat(beat + 0.125, amp=0.055); hat(beat + 0.375, amp=0.06)
    beat += BEAT

# ── SIDECHAIN: ducking del bus musical con cada bombo ──
duck = np.ones(N)
for kt in kick_times:
    s0 = int(kt * SR)
    L = int(0.34 * SR); n = np.arange(L) / SR
    shape = 0.5 + 0.5 * (1 - np.exp(-n * 14))   # cae y se recupera
    s1 = min(N, s0 + L)
    duck[s0:s1] = np.minimum(duck[s0:s1], shape[:s1 - s0])
music *= duck

# ── TRANSICIONES: riser (barrido) hacia el corte + sub-drop en el downbeat ──
def riser(end, length=1.3):
    L = int(length * SR); n = np.arange(L) / SR
    x = n / (n[-1] if L > 1 else 1)
    # ruido filtrado que sube + tono que sube de pitch
    noise = (np.random.rand(L) * 2 - 1) * (x ** 2)
    swp = np.sin(2 * np.pi * (200 + 1400 * x ** 2) * n) * (x ** 2) * 0.4
    env = x ** 2
    place(fx, 0.28 * (noise + swp) * env, end - length)

def subdrop(at, freq):
    L = int(1.0 * SR); n = np.arange(L) / SR
    boom = np.sin(2 * np.pi * (freq * 1.5 * np.exp(-n * 3) + freq) * n) * np.exp(-n * 3.2)
    place(fx, 0.45 * boom, at)

for cut, root in ((S_EDITOR, 73.42), (S_COMBATE, 87.31), (S_PINTURA, 65.41), (S_OUTRO, 73.42)):
    riser(cut)
    subdrop(cut, root)

# acorde final Dm que resuena en el outro
for f in [146.83, 220.00, 293.66, 440.00]:
    buf = note(f, DUR - S_OUTRO, wave='super', nharm=7, a=0.02, d=0.0, s=1.0, r=1.8)
    place(music, 0.05 * buf, S_OUTRO)

# ── MASTER ──
mixdown = music + drums + fx
fin = int(0.5 * SR); fout = int(1.7 * SR)
mixdown[:fin] *= np.linspace(0, 1, fin)
mixdown[-fout:] *= np.linspace(1, 0, fout)
mixdown = np.tanh(mixdown * 1.05)
mixdown /= np.max(np.abs(mixdown)) + 1e-9
mixdown *= 0.89

# estereo: arp/echo con leve ancho
left = mixdown.copy()
right = mixdown.copy()
d = int(0.010 * SR)
right[d:] += 0.07 * mixdown[:-d]
right /= np.max(np.abs(right)) + 1e-9; right *= 0.89
pcm = (np.stack([left, right], axis=1) * 32767).astype(np.int16)

out = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'social', 'assets', 'reel-music.wav'))
with wave.open(out, 'w') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('LISTO ->', out, f'({DUR}s, estilo Tron)')
