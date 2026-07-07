#!/usr/bin/env python3
# ======================================================
# make-reel-music.py — Genera una pista de fondo ORIGINAL (libre de derechos)
# para el reel de lanzamiento. Vibra tech/electronica, La menor, ~120 BPM.
# Capas: pad calido, bajo pluck, arpegio, bombo four-on-the-floor, hats e
# impactos alineados a los cortes de escena. Resuelve en el outro con fade.
# Salida: social/assets/reel-music.wav
# Uso: python3 tools/make-reel-music.py
# ======================================================
import wave, struct, os
import numpy as np

SR = 44100
DUR = 22.6                      # calza con el reel final
N = int(SR * DUR)
t = np.arange(N) / SR
mix = np.zeros(N, dtype=np.float64)

def idx(sec):
    return int(sec * SR)

def env(start, dur, a=0.005, d=0.0, s=1.0, r=0.05, length=None):
    """Envolvente ADSR simple sobre un buffer del tamaño total."""
    e = np.zeros(N)
    L = int((length if length else dur) * SR)
    seg = np.zeros(L)
    ai = max(1, int(a * SR)); ri = max(1, int(r * SR)); di = int(d * SR)
    seg[:ai] = np.linspace(0, 1, ai)
    if di > 0:
        seg[ai:ai+di] = np.linspace(1, s, di)
        seg[ai+di:L-ri] = s
    else:
        seg[ai:L-ri] = 1.0
    seg[L-ri:] = np.linspace(seg[L-ri-1] if L-ri>0 else 1, 0, ri)
    s0 = idx(start); s1 = min(N, s0 + L)
    e[s0:s1] = seg[:s1-s0]
    return e

def tone(freq, harmonics=(1.0,), detune=0.0):
    """Suma de armonicos senoidales, con leve detune para ancho estereo/calidez."""
    sig = np.zeros(N)
    for i, amp in enumerate(harmonics, start=1):
        f = freq * i
        sig += amp * np.sin(2*np.pi*f*t)
        if detune:
            sig += amp*0.5 * np.sin(2*np.pi*f*(1+detune)*t)
    return sig / max(1, len(harmonics))

# ── notas ──
def nt(name):
    names = {'A2':110.00,'C3':130.81,'D3':146.83,'E3':164.81,'F2':87.31,'F3':174.61,
             'G2':98.00,'G3':196.00,'A3':220.00,'B3':246.94,'C4':261.63,'D4':293.66,
             'E4':329.63,'F4':349.23,'G4':392.00,'A4':440.00,'C5':523.25,'E5':659.25}
    return names[name]

# progresion: Am - F - C - G  (i - VI - III - VII), 2s por acorde = 8s de loop
PROG = [
    dict(bass='A2', arp=['A3','C4','E4','A4'], pad=['A3','C4','E4']),
    dict(bass='F2', arp=['F3','A3','C4','F4'], pad=['F3','A3','C4']),
    dict(bass='C3', arp=['C4','E4','G4','C5'], pad=['C4','E4','G4']),
    dict(bass='G2', arp=['G3','B3','D4','G4'], pad=['G3','B3','D4']),
]
BEAT = 0.5            # 120 BPM
CHORD = 2.0          # 4 beats
loops = int(np.ceil(DUR / (CHORD*len(PROG)))) + 1

# secciones (segundos) segun cortes del reel
S_EDITOR, S_COMBATE, S_PINTURA, S_OUTRO = 3.8, 8.8, 12.6, 18.4

# ── construir por acorde ──
chords = []
tsec = 0.0
for _ in range(loops):
    for ch in PROG:
        chords.append((tsec, ch)); tsec += CHORD
        if tsec >= DUR: break
    if tsec >= DUR: break

for cstart, ch in chords:
    if cstart >= DUR: break
    active_bass = cstart >= S_EDITOR - 0.2   # bajo entra en la 2a escena
    # PAD (colchon) — siempre
    for name in ch['pad']:
        f = nt(name)
        e = env(cstart, CHORD, a=0.25, r=0.4, length=CHORD)
        mix += 0.05 * e * tone(f, harmonics=(1.0,0.5,0.25), detune=0.006)
    # BAJO pluck en cada beat (root, alterna octava)
    if active_bass:
        for b in range(int(CHORD/BEAT)):
            bs = cstart + b*BEAT
            if bs >= DUR: break
            f = nt(ch['bass']) * (2 if b % 2 else 1)
            e = env(bs, 0.42, a=0.004, d=0.08, s=0.4, r=0.12, length=0.42)
            mix += 0.22 * e * tone(f, harmonics=(1.0,0.4,0.2))
    # ARPEGIO en corcheas
    arp_amp = 0.10 if cstart < S_EDITOR else 0.15
    steps = int(CHORD/0.25)
    for stp in range(steps):
        asec = cstart + stp*0.25
        if asec >= DUR: break
        f = nt(ch['arp'][stp % len(ch['arp'])])
        if cstart >= S_PINTURA:            # brillo extra en la escena hero
            f *= 1.0
        e = env(asec, 0.24, a=0.004, d=0.06, s=0.25, r=0.06, length=0.24)
        mix += arp_amp * e * tone(f, harmonics=(1.0,0.3,0.12), detune=0.004)

# ── BOMBO four-on-the-floor ──
def kick(at):
    L = int(0.14*SR); n = np.arange(L)/SR
    fsweep = 120*np.exp(-n*32) + 48
    ph = 2*np.pi*np.cumsum(fsweep)/SR
    body = np.sin(ph) * np.exp(-n*11)
    click = np.sin(2*np.pi*1600*n) * np.exp(-n*180) * 0.5
    seg = (body + click)
    s0 = idx(at); s1 = min(N, s0+L)
    mix[s0:s1] += 0.85 * seg[:s1-s0]

def hat(at, amp=0.18):
    L = int(0.05*SR); n = np.arange(L)/SR
    seg = (np.random.rand(L)*2-1) * np.exp(-n*90)
    s0 = idx(at); s1 = min(N, s0+L)
    mix[s0:s1] += amp * seg[:s1-s0]

def impact(at):
    # boom + swell de ruido (cierre de build)
    L = int(1.2*SR); n = np.arange(L)/SR
    boom = np.sin(2*np.pi*(70*np.exp(-n*3)+40)*n) * np.exp(-n*3.0)
    noise = (np.random.rand(L)*2-1) * np.exp(-n*2.2) * 0.25
    seg = boom + noise
    s0 = idx(at); s1 = min(N, s0+L)
    mix[s0:s1] += 0.5 * seg[:s1-s0]

beat = 0.0
DRUMS_STOP = 20.9
while beat < DUR:
    if S_EDITOR-0.6 <= beat and beat < DRUMS_STOP:
        kick(beat)
        hat(beat+0.25, amp=0.16)
    if S_COMBATE <= beat < DRUMS_STOP:
        hat(beat+0.125, amp=0.06); hat(beat+0.375, amp=0.06)
    beat += BEAT

for at in (S_COMBATE, S_PINTURA, S_OUTRO):
    impact(at)

# acorde final Am que resuena en el outro
for name in ['A3','C4','E4','A4']:
    e = env(S_OUTRO, DUR-S_OUTRO, a=0.02, r=1.6, length=DUR-S_OUTRO)
    mix += 0.06 * e * tone(nt(name), harmonics=(1.0,0.5,0.25,0.12), detune=0.006)

# ── master: fade, limitador suave, normalizar ──
fin = int(0.6*SR); fout = int(1.6*SR)
mix[:fin] *= np.linspace(0,1,fin)
mix[-fout:] *= np.linspace(1,0,fout)
mix = np.tanh(mix * 1.1)                      # soft clip / glue
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.89                                   # headroom (~ -1 dBFS)

# estereo con leve ensanche
left = mix.copy(); right = mix.copy()
d = int(0.008*SR)
right[d:] += 0.06*mix[:-d]
right /= np.max(np.abs(right))+1e-9; right *= 0.89

stereo = np.stack([left, right], axis=1)
pcm = (stereo * 32767).astype(np.int16)

out = os.path.join(os.path.dirname(__file__), '..', 'social', 'assets', 'reel-music.wav')
out = os.path.abspath(out)
with wave.open(out, 'w') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('LISTO ->', out, f'({DUR}s)')
