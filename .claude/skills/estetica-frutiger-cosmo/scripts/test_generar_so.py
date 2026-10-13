"""Proves de generar_so.py (només llibreria estàndard).

Execució (des de l'arrel del repo):
  python -m unittest discover -s .agents/skills/estetica-frutiger-cosmo/scripts -p "test_*.py"
"""
import contextlib
import io
import os
import sys
import tempfile
import unittest
import wave
from unittest import mock

import generar_so


def executa(*args):
    """Executa main() amb els arguments donats; retorna (codi, stdout, stderr)."""
    out, err = io.StringIO(), io.StringIO()
    with mock.patch.object(sys, "argv", ["generar_so.py", *args]), \
            contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        codi = generar_so.main()
    return codi, out.getvalue(), err.getvalue()


class Presets(unittest.TestCase):
    NOMS = {"tap", "hover", "exit", "error", "notificacio", "recompensa"}

    def test_presets_esperats(self):
        self.assertEqual(set(generar_so.PRESETS), self.NOMS)

    def test_cada_preset_es_valid(self):
        for nom, p in generar_so.PRESETS.items():
            with self.subTest(preset=nom):
                self.assertTrue(p["veus"])
                self.assertTrue(0 < p["pic"] <= 1)
                for v in p["veus"]:
                    self.assertGreater(v["freq"], 0)
                    self.assertGreater(v["dur"], 0)
                    self.assertGreaterEqual(v["inici"], 0)


class Sintesi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mostres = {nom: generar_so.sintetitza(p) for nom, p in generar_so.PRESETS.items()}

    def test_pic_igual_al_del_preset(self):
        for nom, mostres in self.mostres.items():
            with self.subTest(preset=nom):
                self.assertAlmostEqual(max(abs(s) for s in mostres), generar_so.PRESETS[nom]["pic"], places=6)

    def test_durada_cobreix_les_veus(self):
        for nom, mostres in self.mostres.items():
            with self.subTest(preset=nom):
                minim = max(v["inici"] + v["dur"] for v in generar_so.PRESETS[nom]["veus"])
                self.assertGreaterEqual(len(mostres) / generar_so.RATE, minim)

    def test_determinista(self):
        self.assertEqual(generar_so.sintetitza(generar_so.PRESETS["tap"]), self.mostres["tap"])

    def test_sense_clic_a_l_inici(self):
        for nom, mostres in self.mostres.items():
            with self.subTest(preset=nom):
                self.assertLess(abs(mostres[0]), 0.01)


class Mesura(unittest.TestCase):
    def test_silenci_amb_un_pic_unic(self):
        mostres = [0.0] * generar_so.RATE
        mostres[1000] = 0.5
        efectiva, pic, _ = generar_so.mesura(mostres)
        self.assertAlmostEqual(pic, 20 * generar_so.math.log10(0.5))
        self.assertLess(efectiva, 0.05)  # granularitat de finestra de 5 ms

    def test_constant_rms_igual_al_pic(self):
        efectiva, pic, rms = generar_so.mesura([0.5] * generar_so.RATE)
        self.assertAlmostEqual(pic, rms)
        self.assertAlmostEqual(efectiva, 1.0, places=1)


class EscriuWav(unittest.TestCase):
    def test_format_16_bit_mono_i_clipping(self):
        with tempfile.TemporaryDirectory() as d:
            cami = os.path.join(d, "x.wav")
            generar_so.escriu_wav(cami, [0.0, 0.5, -0.5, 2.0, -2.0])
            with wave.open(cami, "rb") as w:
                self.assertEqual((w.getnchannels(), w.getsampwidth(), w.getframerate()),
                                 (1, 2, generar_so.RATE))
                dades = w.readframes(w.getnframes())
        valors = [int.from_bytes(dades[i:i + 2], "little", signed=True) for i in range(0, len(dades), 2)]
        self.assertEqual(valors, [0, 16383, -16383, 32767, -32767])


class Main(unittest.TestCase):
    def test_llista(self):
        codi, out, _ = executa("--llista")
        self.assertEqual(codi, 0)
        for nom in generar_so.PRESETS:
            self.assertIn(nom, out)

    def test_sense_arguments_llista_els_presets(self):
        codi, out, _ = executa()
        self.assertEqual(codi, 0)
        self.assertIn("Presets:", out)

    def test_preset_desconegut(self):
        codi, _, err = executa("inexistent", "x.wav")
        self.assertEqual(codi, 2)
        self.assertIn("Cal un preset", err)

    def test_falta_la_sortida(self):
        codi, _, _ = executa("tap")
        self.assertEqual(codi, 2)

    def test_genera_el_fitxer_i_imprimeix_mesures(self):
        with tempfile.TemporaryDirectory() as d:
            cami = os.path.join(d, "tap.wav")
            codi, out, _ = executa("tap", cami)
            self.assertEqual(codi, 0)
            self.assertTrue(os.path.getsize(cami) > 44)
        for text in ("efectiva", "dBFS", "RMS"):
            self.assertIn(text, out)


if __name__ == "__main__":
    unittest.main()
