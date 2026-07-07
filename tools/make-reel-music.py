#!/usr/bin/env python3
# ======================================================
# make-reel-music.py — Pista de fondo ORIGINAL (libre de derechos) para el reel.
# Estilo Tron / Daft Punk, version ELECTRICA y GRAVE: Re menor, ~120 BPM.
#   - Bajo "growl" con distorsion (supersaw + sub) = peso y suciedad electrica
#   - Arpegio supersaw con drive (borde electrico) y eco
#   - Pad oscuro
#   - Bombo four-on-the-floor con sidechain (bombeo)
#   - SIN sonidos de transicion (risers/drops eliminados)
#   - Master caliente (mas fuerte)
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

def place(bus, buf, at):
    s0 = int(at * SR); s1 = min(N, s0 + len(buf))
    if s0 >= N or s1 <= 0: return
    bus[max(0, s0):s1] += buf[max(0, -s0):s1 - s0]

def drive(x, amt):
    return np.tanh(x * amt)

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

def supersaw(freq, n, detunes=(-0.012, -0.006, 0, 0.006, 0.012), nharm=8):
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
    else:
        tt = np.arange(n) / SR
        sig = np.sin(2 * np.pi * freq * tt) + 0.35 * np.sin(2 * np.pi * 2 * freq * tt)
    return sig * adsr(n, a, d, s, r)

# ── armonia (Re menor) ── triadas + raiz de bajo por acorde
TRIADS = [
    ([146.83, 174.61, 220.00], 73.42),   # Dm  bass D2
    ([116.54, 146.83, 174.61], 58.27),   # Bb  bass Bb1
    ([174.61, 220.00, 261.63], 87.31),   # F   bass F2
    ([130.81, 164.81, 196.00], 65.41),   # C   bass C2
]
BEAT = 0.5            # 120 BPM
CHORD = 4 * BEAT
ARP_STEP = BEAT / 4   # 16avos

ARP = [(0,1),(1,1),(2,1),(0,2),(2,1),(1,1),(2,2),(1,1)]

S_EDITOR, S_COMBATE, S_PINTURA, S_OUTRO = 3.8, 8.8, 12.6, 18.4
DRUMS_STOP = 21.2

chords = []
tsec = 0.0; i = 0
while tsec < DUR:
    chords.append((tsec, TRIADS[i % len(TRIADS)])); tsec += CHORD; i += 1

# ── PAD + BAJO GROWL + ARPEGIO ──
for cstart, (triad, broot) in chords:
    bright = cstart >= S_PINTURA
    # PAD oscuro
    for f in triad[:2]:
        buf = note(f, CHORD + 0.3, wave='super', nharm=5, a=0.3, d=0.0, s=1.0, r=0.5)
        place(music, 0.045 * buf, cstart)
    # BAJO growl: sub sine (grave) + supersaw distorsionado (electrico)
    for b in range(int(CHORD / BEAT)):
        bs = cstart + b * BEAT
        n = int(0.47 * SR)
        e = adsr(n, 0.004, 0.05, 0.75, 0.1)
        sub = np.sin(2 * np.pi * broot * np.arange(n) / SR) * e
        grw = drive(supersaw(broot * 2, n, nharm=7) * e, 3.0)     # growl electrico
        grw2 = drive(supersaw(broot, n, nharm=6) * e, 2.2)        # cuerpo grave
        place(music, 0.42 * sub, bs)     # sub profundo
        place(music, 0.20 * grw, bs)     # suciedad electrica
        place(music, 0.16 * grw2, bs)    # peso
    # ARPEGIO supersaw con drive (borde electrico)
    arp_amp = 0.13 if cstart < S_EDITOR else 0.18
    steps = int(round(CHORD / ARP_STEP))
    for stp in range(steps):
        asec = cstart + stp * ARP_STEP
        if asec >= DUR: break
        ti, octm = ARP[stp % len(ARP)]
        f = triad[ti] * octm * (2 if bright and stp % 2 == 0 else 1)
        n = int(ARP_STEP * 1.5 * SR)
        e = adsr(n, 0.003, 0.05, 0.2, 0.04)
        buf = drive(supersaw(f, n, nharm=9) * e, 1.8)
        place(music, arp_amp * buf, asec)

# ── ECO del arpegio ──
delay = int(ARP_STEP * SR)
echo = np.zeros(N)
g = 0.30
for tap in (1, 2, 3):
    shift = delay * tap * 2
    if shift < N:
        echo[shift:] += (g ** tap) * music[:N - shift]
music += 0.45 * echo

# ── BOMBO + HATS (electrico, punchy) ──
kick_times = []
def kick(at):
    L = int(0.16 * SR); n = np.arange(L) / SR
    fsweep = 160 * np.exp(-n * 33) + 52
    ph = 2 * np.pi * np.cumsum(fsweep) / SR
    body = np.sin(ph) * np.exp(-n * 9)
    click = np.sin(2 * np.pi * 1900 * n) * np.exp(-n * 200) * 0.6
    seg = drive(body + click, 1.3)                # bombo con drive = mas pegada
    place(drums, 1.0 * seg, at); kick_times.append(at)

def hat(at, amp=0.15, dcy=95):
    L = int(0.05 * SR); n = np.arange(L) / SR
    seg = (np.random.rand(L) * 2 - 1) * np.exp(-n * dcy)
    place(drums, amp * seg, at)

beat = 0.0
while beat < DUR:
    if S_EDITOR - 0.5 <= beat < DRUMS_STOP:
        kick(beat); hat(beat + 0.25, amp=0.15)
    if S_COMBATE <= beat < DRUMS_STOP:
        hat(beat + 0.125, amp=0.06); hat(beat + 0.375, amp=0.065)
    beat += BEAT

# ── SIDECHAIN (bombeo) sobre el bus musical ──
duck = np.ones(N)
for kt in kick_times:
    s0 = int(kt * SR); L = int(0.32 * SR); n = np.arange(L) / SR
    shape = 0.45 + 0.55 * (1 - np.exp(-n * 15))
    s1 = min(N, s0 + L)
    duck[s0:s1] = np.minimum(duck[s0:s1], shape[:s1 - s0])
music *= duck

# acorde final Dm que resuena en el outro (sin drop/riser)
for f in [146.83, 220.00, 293.66, 440.00]:
    buf = note(f, DUR - S_OUTRO, wave='super', nharm=7, a=0.02, d=0.0, s=1.0, r=1.8)
    place(music, 0.05 * buf, S_OUTRO)

# ── MASTER caliente (mas fuerte) ──
mixdown = music + drums
fin = int(0.4 * SR); fout = int(1.5 * SR)
mixdown[:fin] *= np.linspace(0, 1, fin)
mixdown[-fout:] *= np.linspace(1, 0, fout)
mixdown /= np.max(np.abs(mixdown)) + 1e-9      # normaliza antes de limitar
mixdown = np.tanh(mixdown * 2.4)               # drive/limitador = mas RMS (mas fuerte)
mixdown /= np.max(np.abs(mixdown)) + 1e-9
mixdown *= 0.97                                # muy caliente, ~ -0.3 dBFS

# estereo con ancho leve
left = mixdown.copy(); right = mixdown.copy()
d = int(0.010 * SR)
right[d:] += 0.07 * mixdown[:-d]
right /= np.max(np.abs(right)) + 1e-9; right *= 0.97
pcm = (np.stack([left, right], axis=1) * 32767).astype(np.int16)

out = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'social', 'assets', 'reel-music.wav'))
with wave.open(out, 'w') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('LISTO ->', out, f'({DUR}s, electrico/grave, sin transiciones)')
