#!/usr/bin/env python3
"""Genera sons d'interfície curts (WAV 16 bit, mono) només amb la llibreria estàndard.

Ús (des de l'arrel del repo):
  python .agents/skills/estetica-frutiger-cosmo/scripts/generar_so.py tap  frontend/assets/sounds/tap.wav
  python .agents/skills/estetica-frutiger-cosmo/scripts/generar_so.py --llista

Són sons originals (síntesi additiva amb envolupant exponencial): no deriven de cap so
de Nintendo, Microsoft ni Apple. Els valors dels presets són un punt de partida: l'oïda
de la persona és qui valida el resultat. Afegeix el so i la seva «font: generat amb
generar_so.py» a frontend/assets/sounds/LICENSES.md.
"""
import argparse
import math
import struct
import sys
import wave

RATE = 44100

# nom -> (notes [(freq_hz, inici_s, durada_s)], volum 0-1, decaïment)
PRESETS = {
    "tap": ([(880.0, 0.0, 0.09), (1320.0, 0.0, 0.07)], 0.35, 38.0),
    "hover": ([(1568.0, 0.0, 0.05)], 0.18, 55.0),
    "exit": ([(659.3, 0.0, 0.16), (880.0, 0.09, 0.16), (1318.5, 0.18, 0.30)], 0.40, 9.0),
    "error": ([(311.1, 0.0, 0.14), (233.1, 0.12, 0.26)], 0.40, 11.0),
    "notificacio": ([(1046.5, 0.0, 0.14), (1568.0, 0.14, 0.30)], 0.38, 8.0),
    "recompensa": ([(523.3, 0.0, 0.14), (659.3, 0.10, 0.14), (784.0, 0.20, 0.14), (1046.5, 0.30, 0.45)], 0.42, 6.0),
}


def sintetitza(notes, volum, decay):
    total = max(inici + dur for _, inici, dur in notes) + 0.05
    samples = [0.0] * int(total * RATE)
    for freq, inici, dur in notes:
        start = int(inici * RATE)
        for i in range(int(dur * RATE)):
            t = i / RATE
            env = math.exp(-decay * t) * min(1.0, t / 0.004)  # atac de 4 ms: evita el clic
            tone = math.sin(2 * math.pi * freq * t) + 0.35 * math.sin(2 * math.pi * 2 * freq * t) + 0.12 * math.sin(2 * math.pi * 3 * freq * t)
            if start + i < len(samples):
                samples[start + i] += tone * env
    peak = max(abs(s) for s in samples) or 1.0
    return [s / peak * volum for s in samples]


def escriu_wav(path, samples):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767)) for s in samples))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    p.add_argument("preset", nargs="?")
    p.add_argument("sortida", nargs="?")
    p.add_argument("--llista", action="store_true")
    a = p.parse_args()
    if a.llista or not a.preset:
        print("Presets:", ", ".join(PRESETS))
        return 0
    if a.preset not in PRESETS or not a.sortida:
        print(f"Cal un preset de: {', '.join(PRESETS)} i un camí de sortida .wav", file=sys.stderr)
        return 2
    escriu_wav(a.sortida, sintetitza(*PRESETS[a.preset]))
    print(f"Escrit {a.sortida}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
