"""Proves de contrast.py (només llibreria estàndard).

Execució (des de l'arrel del repo):
  python -m unittest discover -s .agents/skills/estetica-frutiger-cosmo/scripts -p "test_*.py"
"""
import contextlib
import io
import sys
import unittest
from unittest import mock

import contrast


def executa(*args):
    """Executa main() amb els arguments donats; retorna (codi, sortida)."""
    out = io.StringIO()
    with mock.patch.object(sys, "argv", ["contrast.py", *args]), contextlib.redirect_stdout(out):
        codi = contrast.main()
    return codi, out.getvalue()


class ToRgb(unittest.TestCase):
    def test_hex_amb_i_sense_coixinet(self):
        self.assertEqual(contrast.to_rgb("#075F94"), (7, 95, 148))
        self.assertEqual(contrast.to_rgb("075f94"), (7, 95, 148))

    def test_longitud_invalida(self):
        for valor in ("#FFF", "#FFFFFFF", ""):
            with self.assertRaises(ValueError):
                contrast.to_rgb(valor)

    def test_no_hexadecimal(self):
        with self.assertRaises(ValueError):
            contrast.to_rgb("#GGGGGG")


class Luminancia(unittest.TestCase):
    def test_extrems(self):
        self.assertAlmostEqual(contrast.luminance((0, 0, 0)), 0.0)
        self.assertAlmostEqual(contrast.luminance((255, 255, 255)), 1.0)


class Ratio(unittest.TestCase):
    def test_blanc_sobre_negre_es_21(self):
        self.assertAlmostEqual(contrast.ratio((255, 255, 255), (0, 0, 0)), 21.0)

    def test_mateix_color_es_1(self):
        self.assertAlmostEqual(contrast.ratio((90, 91, 240), (90, 91, 240)), 1.0)

    def test_simetric(self):
        a, b = (7, 95, 148), (255, 255, 255)
        self.assertAlmostEqual(contrast.ratio(a, b), contrast.ratio(b, a))

    def test_valors_documentats_de_la_skill(self):
        # tokens.md: text blanc sobre el cos del gel #075F94 = 6,8:1; amb #0B78B5 baixa a 4,8:1
        self.assertAlmostEqual(contrast.ratio((255, 255, 255), contrast.to_rgb("#075F94")), 6.83, places=2)
        self.assertAlmostEqual(contrast.ratio((255, 255, 255), contrast.to_rgb("#0B78B5")), 4.81, places=2)


class Composite(unittest.TestCase):
    def test_alfa_zero_i_u(self):
        fg, bg = (255, 255, 255), (0, 0, 0)
        self.assertEqual(contrast.composite(fg, 0.0, bg), bg)
        self.assertEqual(contrast.composite(fg, 1.0, bg), fg)

    def test_barreja_proporcional(self):
        self.assertEqual(contrast.composite((200, 100, 0), 0.5, (0, 0, 0)), (100, 50, 0))


class Main(unittest.TestCase):
    def test_text_correcte(self):
        codi, sortida = executa("#FFFFFF", "#075F94")
        self.assertEqual(codi, 0)
        self.assertIn("6.83:1", sortida)
        self.assertIn("OK text", sortida)
        self.assertIn("#075F94", sortida)

    def test_nomes_ui_o_text_gran(self):
        codi, sortida = executa("#FFFFFF", "#8A8A8A")  # ~3,5:1
        self.assertEqual(codi, 0)
        self.assertIn("només UI/text gran", sortida)

    def test_falla_amb_codi_1(self):
        codi, sortida = executa("#FFFFFF", "#F0F0F0")
        self.assertEqual(codi, 1)
        self.assertIn("FALLA", sortida)

    def test_vidre_usa_el_fons_efectiu(self):
        # blanc al 100 % sobre qualsevol fons = fons efectiu blanc
        _, sortida = executa("#000000", "#102030", "--glass", "#FFFFFF", "1")
        self.assertIn("21.00:1", sortida)
        self.assertIn("#FFFFFF", sortida)

    def test_color_invalid_aixeca_error(self):
        with self.assertRaises(ValueError):
            executa("#12345", "#FFFFFF")


if __name__ == "__main__":
    unittest.main()
