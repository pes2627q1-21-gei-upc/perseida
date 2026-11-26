"""Proves de `render_env.py check` (stdlib; cal executar-les a mà):

    python -m unittest infra/scripts/test_render_env.py
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("render_env.py")


def run_check(
    secrets: dict, variables: dict, secret_only: str = "", extra_required: str = ""
) -> tuple[int, str]:
    with tempfile.TemporaryDirectory() as tmp:
        template = Path(tmp, ".env.example")
        template.write_text("DB_PASSWORD=\nDB_PORT=\n", encoding="utf-8")
        env = {
            **os.environ,
            "ENV_TEMPLATE": str(template),
            "ENV_SECRET_ONLY": secret_only,
            "ENV_EXTRA_REQUIRED": extra_required,
            "SECRETS_JSON": json.dumps(secrets),
            "VARS_JSON": json.dumps(variables),
        }
        done = subprocess.run(
            [sys.executable, str(SCRIPT), "check"], env=env, capture_output=True, text=True
        )
    return done.returncode, done.stderr


class CheckTest(unittest.TestCase):
    def test_real_template_does_not_require_optional_websocket_settings(self) -> None:
        template = SCRIPT.parents[1] / ".env.example"
        names = ["WS_AUTH_TIMEOUT_SECONDS", "WS_HEARTBEAT_SECONDS", "WS_MAX_ROOMS",
                 "WS_MAX_FRAME_BYTES", "WS_SEND_TIMEOUT_SECONDS",
                 "WS_MAX_CONNECTIONS_PER_USER"]
        import re

        required = re.findall(r"^([A-Z][A-Z0-9_]*)=", template.read_text(encoding="utf-8"), re.MULTILINE)
        self.assertTrue(set(names).isdisjoint(required))

    def test_real_template_includes_backup_settings(self) -> None:
        import re

        template = SCRIPT.parents[1] / ".env.example"
        required = re.findall(r"^([A-Z][A-Z0-9_]*)=", template.read_text(encoding="utf-8"), re.MULTILINE)
        self.assertIn("BACKUP_DIR", required)
        self.assertIn("BACKUP_KEEP", required)

    def test_cd_workflow_makes_backup_dir_optional_not_excluded(self) -> None:
        import re

        cd = (SCRIPT.parents[2] / ".github" / "workflows" / "cd.yml").read_text(encoding="utf-8")
        exclude = re.search(r"^\s*ENV_EXCLUDE:(.*)$", cd, re.MULTILINE)
        optional = re.search(r"^\s*ENV_OPTIONAL:(.*)$", cd, re.MULTILINE)
        self.assertIsNotNone(exclude)
        self.assertIsNotNone(optional)
        self.assertNotIn("BACKUP_DIR", exclude.group(1).split())
        self.assertIn("BACKUP_DIR", optional.group(1).split())

    def test_everything_defined_passes(self) -> None:
        code, _ = run_check({"DB_PASSWORD": "x"}, {"DB_PORT": "5432"}, "DB_PASSWORD")
        self.assertEqual(code, 0)

    def test_missing_name_is_listed(self) -> None:
        code, err = run_check({"DB_PASSWORD": "x"}, {}, "DB_PASSWORD")
        self.assertEqual(code, 1)
        self.assertIn("DB_PORT", err)

    def test_secret_only_name_as_variable_fails_naming_it(self) -> None:
        code, err = run_check(
            {}, {"DB_PASSWORD": "S3CRET-VALUE", "DB_PORT": "5432"}, "DB_PASSWORD"
        )
        self.assertEqual(code, 1)
        self.assertIn("Han de ser secrets", err)
        self.assertIn("DB_PASSWORD", err)
        self.assertNotIn("S3CRET-VALUE", err)

    def test_other_names_may_be_secret_or_variable(self) -> None:
        code, _ = run_check({"DB_PASSWORD": "x", "DB_PORT": "5432"}, {}, "DB_PASSWORD")
        self.assertEqual(code, 0)

    def test_a_name_defined_as_secret_and_as_variable_passes(self) -> None:
        code, _ = run_check(
            {"DB_PASSWORD": "x"}, {"DB_PASSWORD": "y", "DB_PORT": "5432"}, "DB_PASSWORD"
        )
        self.assertEqual(code, 0)

    def test_extra_required_names_must_exist_too(self) -> None:
        code, err = run_check(
            {"DB_PASSWORD": "x"}, {"DB_PORT": "5432"}, extra_required="SSH_HOST"
        )
        self.assertEqual(code, 1)
        self.assertIn("SSH_HOST", err)


def run_with_optional(
    command: str, secrets: dict, variables: dict
) -> tuple[int, str, str]:
    """Plantilla amb `BACKUP_DIR` declarat opcional (`ENV_OPTIONAL`)."""
    with tempfile.TemporaryDirectory() as tmp:
        template = Path(tmp, ".env.example")
        template.write_text("DB_PORT=\nBACKUP_DIR=\n", encoding="utf-8")
        env = {
            **os.environ,
            "ENV_TEMPLATE": str(template),
            "ENV_OPTIONAL": "BACKUP_DIR",
            "SECRETS_JSON": json.dumps(secrets),
            "VARS_JSON": json.dumps(variables),
        }
        done = subprocess.run(
            [sys.executable, str(SCRIPT), command], env=env, capture_output=True
        )
    return done.returncode, done.stdout.decode("utf-8", "replace"), done.stderr.decode("utf-8", "replace")


class OptionalNamesTest(unittest.TestCase):
    def test_check_passes_without_the_optional_name(self) -> None:
        code, _, err = run_with_optional("check", {}, {"DB_PORT": "5432"})
        self.assertEqual(code, 0, err)

    def test_check_still_requires_the_other_names(self) -> None:
        code, _, err = run_with_optional("check", {}, {})
        self.assertEqual(code, 1)
        self.assertIn("DB_PORT", err)
        self.assertNotIn("BACKUP_DIR", err)

    def test_check_rejects_an_optional_value_that_cannot_be_rendered(self) -> None:
        code, _, err = run_with_optional(
            "check", {}, {"DB_PORT": "5432", "BACKUP_DIR": "/a'b"}
        )
        self.assertEqual(code, 1)
        self.assertIn("BACKUP_DIR", err)

    def test_render_writes_the_optional_name_when_defined(self) -> None:
        code, out, err = run_with_optional(
            "render", {}, {"DB_PORT": "5432", "BACKUP_DIR": "/srv/backups"}
        )
        self.assertEqual(code, 0, err)
        self.assertIn("BACKUP_DIR='/srv/backups'\n", out)
        self.assertIn("DB_PORT='5432'\n", out)

    def test_render_skips_the_optional_name_when_undefined(self) -> None:
        code, out, err = run_with_optional("render", {}, {"DB_PORT": "5432"})
        self.assertEqual(code, 0, err)
        self.assertNotIn("BACKUP_DIR", out)
        self.assertEqual(out, "DB_PORT='5432'\n")


if __name__ == "__main__":
    unittest.main()
