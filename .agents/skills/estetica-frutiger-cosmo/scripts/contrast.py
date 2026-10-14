#!/usr/bin/env python3
"""Relació de contrast WCAG 2.x entre dos colors, amb capa translúcida opcional.

Ús (des de l'arrel del repo):
  python .agents/skills/estetica-frutiger-cosmo/scripts/contrast.py FG BG
  python .agents/skills/estetica-frutiger-cosmo/scripts/contrast.py FG BG --glass COLOR ALFA

FG, BG i COLOR són hexadecimals (#RRGGBB). Amb --glass, BG és el fons REAL
darrere del vidre i el fons efectiu és COLOR amb ALFA (0-1) sobre BG.
Mesura sempre sobre el pitjor fons possible (zona més clara o més saturada).

Llindars: text >= 4.5, text gran i UI/icones >= 3.
"""
import argparse
import sys


def to_rgb(value):
    h = value.lstrip("#")
    if len(h) != 6:
        raise ValueError(f"color invàlid: {value!r} (esperat #RRGGBB)")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def luminance(rgb):
    def channel(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

    r, g, b = rgb
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def ratio(a, b):
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def composite(fg, alpha, bg):
    return tuple(round(fg[i] * alpha + bg[i] * (1 - alpha)) for i in range(3))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("fg")
    parser.add_argument("bg")
    parser.add_argument("--glass", nargs=2, metavar=("COLOR", "ALFA"))
    args = parser.parse_args()

    fg, bg = to_rgb(args.fg), to_rgb(args.bg)
    if args.glass:
        bg = composite(to_rgb(args.glass[0]), float(args.glass[1]), bg)
    value = ratio(fg, bg)
    verdict = "OK text (>=4.5)" if value >= 4.5 else "només UI/text gran (>=3)" if value >= 3 else "FALLA"
    print(f"{value:.2f}:1  {verdict}  (fons efectiu #{bg[0]:02X}{bg[1]:02X}{bg[2]:02X})")
    return 0 if value >= 3 else 1


if __name__ == "__main__":
    sys.exit(main())
