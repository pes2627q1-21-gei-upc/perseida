#!/usr/bin/env python3
"""Genera sons d'interfície curts (WAV 16 bit, mono) només amb la llibreria estàndard.

Ús (des de l'arrel del repo):
  python .agents/skills/estetica-frutiger-cosmo/scripts/generar_so.py tap  frontend/assets/sounds/tap.wav
  python .agents/skills/estetica-frutiger-cosmo/scripts/generar_so.py --llista

Són sons originals (síntesi additiva, lliscaments de to, filtre i ressonància suau): no
deriven de cap so de Nintendo, Microsoft ni Apple. Després d'escriure el fitxer, l'script
imprimeix durada, pic i nivell RMS: serveixen per comparar sons entre ells (un so de
menys de ~100 ms o a més de 8 dB per sota dels altres no se sentirà al mòbil). L'oïda de
la persona és qui valida el resultat. Afegeix el so i la seva «font: generat amb
generar_so.py» a frontend/assets/sounds/LICENSES.md.
"""
import argparse
import math
import struct
import sys
import wave

RATE = 44100
SUAU = ((1.0, 1.0), (2.0, 0.15), (3.0, 0.03))  # harmònics suaus, sense estridència
CAMPANA_SUAU = ((1.0, 1.0), (2.756, 0.22), (5.404, 0.07))  # vidre amb poca brillantor


def veu(freq, inici, dur, decay, amp=1.0, parcials=SUAU, glide_a=None, glide_s=0.06, atac=0.004):
    return dict(freq=freq, inici=inici, dur=dur, decay=decay, amp=amp, parcials=parcials,
                glide_a=glide_a, glide_s=glide_s, atac=atac)


# nom -> veus, pic (0-1), passa-baixos (Hz o None), ressonància [(retard_s, guany)]
PRESETS = {
    # bombolla suau: lliscament curt cap amunt, to rodó (mateixa família que error)
    "tap": dict(
        veus=[veu(520, 0.0, 0.20, 20, 1.0, SUAU, glide_a=760, glide_s=0.06, atac=0.008)],
        pic=0.60, passabaix=3500, ress=[(0.04, 0.15)]),
    # «tic» de vidre, discret però audible
    "hover": dict(
        veus=[veu(1318.5, 0.0, 0.16, 26, 1.0, ((1.0, 1.0), (2.756, 0.22)))],
        pic=0.45, passabaix=7000, ress=[(0.025, 0.2)]),
    # arpegi ascendent una mica més agut i més llarg
    "exit": dict(
        veus=[veu(784.0, 0.00, 0.28, 7, 1.0), veu(1046.5, 0.11, 0.28, 7, 1.0), veu(1568.0, 0.22, 0.48, 6, 1.0)],
        pic=0.5, passabaix=6000, ress=[(0.04, 0.2)]),
    # descendent, no estrident, una mica més llarg
    "error": dict(
        veus=[veu(311.1, 0.0, 0.24, 7, 1.0), veu(233.1, 0.16, 0.38, 6, 1.0)],
        pic=0.5, passabaix=3500, ress=[(0.04, 0.15)]),
    # Frutiger Aero suau: bloop d'aigua + arpegi de vidre (Re major add9) + centelleig, amb aire
    "notificacio": dict(
        veus=[veu(380, 0.00, 0.24, 18, 0.50, SUAU, glide_a=720, glide_s=0.09, atac=0.008),
              veu(587.3, 0.12, 0.95, 4.5, 0.80, CAMPANA_SUAU, atac=0.010),
              veu(740.0, 0.26, 0.95, 4.5, 0.72, CAMPANA_SUAU, atac=0.010),
              veu(880.0, 0.40, 0.95, 4.5, 0.68, CAMPANA_SUAU, atac=0.010),
              veu(1174.7, 0.58, 1.05, 4.0, 0.50, CAMPANA_SUAU, atac=0.010),
              veu(1568.0, 0.62, 0.45, 10, 0.10, ((1.0, 1.0),), atac=0.010),
              veu(1975.5, 0.72, 0.45, 10, 0.07, ((1.0, 1.0),), atac=0.010)],
        pic=0.55, passabaix=4500,
        ress=[(0.037, 0.28), (0.061, 0.22), (0.089, 0.16), (0.131, 0.10), (0.190, 0.06)]),
    # el mateix to i ritme que ja agradava, amb menys brillantor
    "recompensa": dict(
        veus=[veu(523.3, 0.00, 0.14, 6), veu(659.3, 0.10, 0.14, 6),
              veu(784.0, 0.20, 0.14, 6), veu(1046.5, 0.30, 0.45, 6)],
        pic=0.40, passabaix=3200, ress=[(0.03, 0.15)]),
}


def sintetitza(p):
    veus, ress = p["veus"], p["ress"]
    cua = max((d for d, _ in ress), default=0.0)
    total = max(v["inici"] + v["dur"] for v in veus) + 0.05 + cua
    n = int(total * RATE)
    buf = [0.0] * n
    for v in veus:
        i0, fase = int(v["inici"] * RATE), 0.0
        for i in range(int(v["dur"] * RATE)):
            t = i / RATE
            f = v["freq"]
            if v["glide_a"]:
                f += (v["glide_a"] - v["freq"]) * min(1.0, t / v["glide_s"])
            fase += 2 * math.pi * f / RATE
            env = min(1.0, t / v["atac"]) * min(1.0, (v["dur"] - t) / 0.015)  # atac i alliberament sense clic
            val = sum(a * math.sin(r * fase) * math.exp(-v["decay"] * (1 + 0.5 * k) * t)
                      for k, (r, a) in enumerate(v["parcials"]))
            if i0 + i < n:
                buf[i0 + i] += v["amp"] * env * val
    if p["passabaix"]:
        a, y = 1 - math.exp(-2 * math.pi * p["passabaix"] / RATE), 0.0
        for i in range(n):
            y += a * (buf[i] - y)
            buf[i] = y
    sortida = list(buf)
    for retard, guany in ress:
        d = int(retard * RATE)
        for i in range(n - d):
            sortida[i + d] += guany * buf[i]
    pic = max(abs(s) for s in sortida) or 1.0
    return [s / pic * p["pic"] for s in sortida]


def escriu_wav(cami, mostres):
    with wave.open(cami, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767)) for s in mostres))


def mesura(mostres):
    pic = max(abs(s) for s in mostres)
    rms = math.sqrt(sum(s * s for s in mostres) / len(mostres))
    finestra, llindar, ultim = int(RATE * 0.005), pic * 0.0316, 0
    for i in range(0, len(mostres) - finestra, finestra):
        if max(abs(s) for s in mostres[i:i + finestra]) > llindar:
            ultim = i + finestra
    return ultim / RATE, 20 * math.log10(pic), 20 * math.log10(rms)


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
    mostres = sintetitza(PRESETS[a.preset])
    escriu_wav(a.sortida, mostres)
    efectiva, pic, rms = mesura(mostres)
    print(f"Escrit {a.sortida}: efectiva {efectiva:.2f} s, pic {pic:.1f} dBFS, RMS {rms:.1f} dBFS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
