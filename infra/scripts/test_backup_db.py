"""Proves de `backup-db.sh` (TG-386; stdlib; cal executar-les a mà):

    python -m unittest infra/scripts/test_backup_db.py

L'script s'executa amb un `docker` FALS al `PATH` que simula el contenidor `db`
(`pg_dump -Fc`, `pg_restore --list` i la lectura d'`alembic_version`). Es controla
amb variables d'entorn de la prova:

    FAKE_REVISION      revisió d'Alembic actual; buida = la taula `alembic_version` no existeix
    FAKE_PSQL_EXIT     si no és 0, psql falla amb aquest codi (connexió, auth, recuperació...)
    FAKE_DUMP_EXIT     codi de sortida de pg_dump (0 per defecte)
    FAKE_DUMP_EMPTY    si és 1, pg_dump surt bé però no escriu res
    FAKE_DUMP_PARTIAL  si és 1, pg_dump escriu uns bytes i falla (disc ple)
    FAKE_LIST_FAIL     si és 1, `pg_restore --list` falla (dump il·legible)
    FAKE_DB_MISSING    si és 1, el contenidor `db` no existeix
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPT = Path(__file__).with_name("backup-db.sh")
SENTINEL = "S3NT1NEL-P4SSW0RD-NO-HA-DE-SORTIR"
SHA = "abc1234"
HEAD = "b2c3d4e5f6a7"
CURRENT = "a1b2c3d4e5f6"

FAKE_DOCKER = r"""#!/bin/sh
# docker fals per a les proves de backup-db.sh
args="$*"
if [ "${FAKE_DB_MISSING:-0}" = 1 ]; then
  case "$args" in
    *"ps"*) exit 0 ;;
  esac
  echo "Error response from daemon: service \"db\" is not running" >&2
  exit 1
fi
case "$args" in
  *pg_restore*)
    cat >/dev/null
    if [ "${FAKE_LIST_FAIL:-0}" = 1 ]; then
      echo "pg_restore: error: file is not a valid archive" >&2
      exit 1
    fi
    echo "; Archive created by fake docker"
    exit 0
    ;;
  *pg_dump*)
    if [ "${FAKE_DUMP_PARTIAL:-0}" = 1 ]; then
      printf 'PGDMP-parcial'
      echo "pg_dump: error: No space left on device" >&2
      exit 1
    fi
    if [ "${FAKE_DUMP_EXIT:-0}" != 0 ]; then
      echo "pg_dump: error: connection to server failed" >&2
      exit "${FAKE_DUMP_EXIT}"
    fi
    if [ "${FAKE_DUMP_EMPTY:-0}" = 1 ]; then
      exit 0
    fi
    printf 'PGDMP-contingut-sintetic-de-la-prova\n'
    exit 0
    ;;
  *to_regclass*)
    if [ "${FAKE_PSQL_EXIT:-0}" != 0 ]; then
      echo "psql: error: connection failed: password authentication failed (password $POSTGRES_PASSWORD)" >&2
      exit "${FAKE_PSQL_EXIT}"
    fi
    if [ -z "${FAKE_REVISION:-}" ]; then
      exit 0
    fi
    printf 'alembic_version\n'
    exit 0
    ;;
  *alembic_version*)
    if [ "${FAKE_PSQL_EXIT:-0}" != 0 ]; then
      echo "psql: error: connection failed: password authentication failed (password $POSTGRES_PASSWORD)" >&2
      exit "${FAKE_PSQL_EXIT}"
    fi
    if [ -z "${FAKE_REVISION:-}" ]; then
      echo 'ERROR:  relation "alembic_version" does not exist' >&2
      exit 1
    fi
    printf '%s\n' "$FAKE_REVISION"
    exit 0
    ;;
  *"config --services"*)
    printf 'db\napi\n'
    exit 0
    ;;
  *)
    # ps -q db, inspect, etc.: el contenidor existeix
    echo fakecontainerid
    exit 0
    ;;
esac
"""


def find_sh() -> str | None:
    found = shutil.which("sh")
    if found:
        return found
    for candidate in (r"C:\Program Files\Git\bin\sh.exe", r"C:\Program Files\Git\usr\bin\sh.exe"):
        if Path(candidate).exists():
            return candidate
    return None


SH = find_sh()


@unittest.skipIf(SH is None, "no hi ha cap `sh` (a Windows, instal·la Git Bash) per executar l'script")
class BackupDbBase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.bin = self.tmp / "bin"
        self.bin.mkdir()
        docker = self.bin / "docker"
        docker.write_text(FAKE_DOCKER, encoding="utf-8", newline="\n")
        docker.chmod(0o755)
        self.backups = self.tmp / "backups"
        self.home = self.tmp / "home"
        self.home.mkdir()
        (self.tmp / ".env").write_text(f"POSTGRES_PASSWORD={SENTINEL}\n", encoding="utf-8")

    def run_script(self, *args: str, **overrides: str | None) -> subprocess.CompletedProcess:
        """Executa l'script; `overrides` amb valor None elimina la variable de l'entorn."""
        self.assertTrue(SCRIPT.is_file(), f"No existeix {SCRIPT}")
        env = {k: v for k, v in os.environ.items() if not k.startswith(("FAKE_", "BACKUP_"))}
        env.update(
            {
                "PATH": f"{self.bin.as_posix()}{os.pathsep}{env.get('PATH', '')}",
                "HOME": self.home.as_posix(),
                "BACKUP_DIR": self.backups.as_posix(),
                "POSTGRES_PASSWORD": SENTINEL,
                "DB_PASSWORD": SENTINEL,
                "FAKE_REVISION": CURRENT,
            }
        )
        for key, value in overrides.items():
            if value is None:
                env.pop(key, None)
            else:
                env[key] = value
        return subprocess.run(
            [SH, SCRIPT.as_posix(), *args],
            env=env,
            cwd=self.tmp,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

    @staticmethod
    def output(done: subprocess.CompletedProcess) -> str:
        return (done.stdout or "") + (done.stderr or "")

    def dumps(self, directory: Path | None = None) -> list[Path]:
        directory = directory or self.backups
        if not directory.exists():
            return []
        return sorted(directory.glob("*.dump"))

    def listing(self, directory: Path | None = None) -> list[str]:
        directory = directory or self.backups
        return sorted(p.name for p in directory.iterdir()) if directory.exists() else []

    def seed(self, count: int, directory: Path | None = None) -> list[str]:
        """Crea `count` còpies prèvies, de més antiga a més nova, totes anteriors a ara."""
        directory = directory or self.backups
        directory.mkdir(parents=True, exist_ok=True)
        names = []
        for i in range(1, count + 1):
            name = f"perseida-2020010{i}T000000Z-oldsha{i}-{CURRENT}.dump"
            path = directory / name
            path.write_bytes(b"PGDMP-previ")
            stamp = datetime(2020, 1, i, tzinfo=timezone.utc).timestamp()
            os.utime(path, (stamp, stamp))
            names.append(name)
        return names


NAME_RE = re.compile(
    r"^perseida-(?P<ts>\d{8}T\d{6}Z)-(?P<sha>[0-9a-f]+)(?:-(?P<rev>[0-9a-f]+))?\.dump$"
)


class ScriptExistsTest(BackupDbBase):
    def test_script_exists(self) -> None:
        self.assertTrue(SCRIPT.is_file(), f"No existeix {SCRIPT}")


class SuccessfulBackupTest(BackupDbBase):
    def assert_one_good_dump(self, expected_rev: str) -> Path:
        files = self.dumps()
        self.assertEqual(len(files), 1, self.listing())
        match = NAME_RE.match(files[0].name)
        self.assertIsNotNone(match, files[0].name)
        self.assertEqual(match["sha"], SHA)
        self.assertEqual(match["rev"], expected_rev)
        stamp = datetime.strptime(match["ts"], "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        self.assertLess(abs(datetime.now(timezone.utc) - stamp), timedelta(minutes=5))
        self.assertGreater(files[0].stat().st_size, 0)
        return files[0]

    def test_always_creates_named_non_empty_dump(self) -> None:
        done = self.run_script("--always", SHA)
        self.assertEqual(done.returncode, 0, self.output(done))
        self.assert_one_good_dump(CURRENT)

    def test_always_backs_up_even_if_revision_equals_head(self) -> None:
        done = self.run_script("--always", SHA, FAKE_REVISION=HEAD)
        self.assertEqual(done.returncode, 0, self.output(done))
        self.assert_one_good_dump(HEAD)

    def test_if_pending_with_different_head_creates_dump(self) -> None:
        done = self.run_script("--if-pending", HEAD, SHA)
        self.assertEqual(done.returncode, 0, self.output(done))
        self.assert_one_good_dump(CURRENT)

    def test_no_temporary_files_are_left_behind(self) -> None:
        self.run_script("--always", SHA)
        self.assertEqual(len(self.listing()), 1, self.listing())


class SkippedBackupTest(BackupDbBase):
    def test_if_pending_without_pending_migrations_skips(self) -> None:
        done = self.run_script("--if-pending", CURRENT, SHA)
        self.assertEqual(done.returncode, 0, self.output(done))
        self.assertEqual(self.listing(), [])
        self.assertIn("sense migracions pendents, còpia omesa", self.output(done))

    def test_unreadable_revision_skips_with_warning_always(self) -> None:
        done = self.run_script("--always", SHA, FAKE_REVISION="")
        self.assertEqual(done.returncode, 0, self.output(done))
        self.assertEqual(self.listing(), [])
        self.assertTrue(self.output(done).strip(), "cal un avís")

    def test_unreadable_revision_skips_with_warning_if_pending(self) -> None:
        done = self.run_script("--if-pending", HEAD, SHA, FAKE_REVISION="")
        self.assertEqual(done.returncode, 0, self.output(done))
        self.assertEqual(self.listing(), [])
        self.assertTrue(self.output(done).strip(), "cal un avís")

    def test_missing_db_container_skips_with_warning(self) -> None:
        for args in (("--always", SHA), ("--if-pending", HEAD, SHA)):
            with self.subTest(args=args):
                done = self.run_script(*args, FAKE_DB_MISSING="1")
                self.assertEqual(done.returncode, 0, self.output(done))
                self.assertEqual(self.listing(), [])
                self.assertTrue(self.output(done).strip(), "cal un avís")


class UnreadableRevisionTest(BackupDbBase):
    """Un error de psql no és una BD buida: la còpia falla i no es migra."""

    def test_psql_failure_fails_without_backup(self) -> None:
        for args in (("--always", SHA), ("--if-pending", HEAD, SHA)):
            for code in ("1", "2"):
                with self.subTest(args=args, code=code):
                    done = self.run_script(*args, FAKE_PSQL_EXIT=code)
                    self.assertNotEqual(done.returncode, 0, self.output(done))
                    self.assertEqual(self.listing(), [])
                    self.assertTrue(self.output(done).strip(), "cal un missatge d'error")
                    self.assertNotIn(SENTINEL, self.output(done))

    def test_psql_failure_does_not_touch_existing_backups(self) -> None:
        prior = self.seed(3)
        done = self.run_script("--always", SHA, FAKE_PSQL_EXIT="2")
        self.assertNotEqual(done.returncode, 0, self.output(done))
        self.assertEqual(self.listing(), sorted(prior))

    def test_missing_table_skips_with_warning_and_exit_zero(self) -> None:
        for args in (("--always", SHA), ("--if-pending", HEAD, SHA)):
            with self.subTest(args=args):
                done = self.run_script(*args, FAKE_REVISION="")
                self.assertEqual(done.returncode, 0, self.output(done))
                self.assertEqual(self.listing(), [])
                self.assertIn("AVÍS", self.output(done))


class RotationTest(BackupDbBase):
    def test_default_keeps_five_most_recent(self) -> None:
        prior = self.seed(8)
        done = self.run_script("--always", SHA, BACKUP_KEEP=None)
        self.assertEqual(done.returncode, 0, self.output(done))
        names = self.listing()
        self.assertEqual(len(names), 5, names)
        self.assertEqual(names[:4], prior[-4:])
        self.assertIsNotNone(NAME_RE.match(names[4]))
        self.assertIn(f"-{SHA}-", names[4])

    def test_backup_keep_is_configurable(self) -> None:
        prior = self.seed(6)
        done = self.run_script("--always", SHA, BACKUP_KEEP="2")
        self.assertEqual(done.returncode, 0, self.output(done))
        names = self.listing()
        self.assertEqual(len(names), 2, names)
        self.assertEqual(names[0], prior[-1])

    def test_fewer_than_keep_are_all_kept(self) -> None:
        prior = self.seed(2)
        done = self.run_script("--always", SHA)
        self.assertEqual(done.returncode, 0, self.output(done))
        names = self.listing()
        self.assertEqual(len(names), 3)
        self.assertEqual(names[:2], prior)

    def test_default_dir_is_home_perseida_backups_with_keep_five(self) -> None:
        default_dir = self.home / "perseida" / "backups"
        prior = self.seed(7, default_dir)
        done = self.run_script("--always", SHA, BACKUP_DIR=None, BACKUP_KEEP=None)
        self.assertEqual(done.returncode, 0, self.output(done))
        names = self.listing(default_dir)
        self.assertEqual(len(names), 5, names)
        self.assertEqual(names[:4], prior[-4:])


class RotationSafetyTest(BackupDbBase):
    def test_failed_delete_of_old_backup_is_not_fatal(self) -> None:
        real_rm = shutil.which("rm")
        self.assertIsNotNone(real_rm)
        fake_rm = self.bin / "rm"
        fake_rm.write_text(
            '#!/bin/sh\n'
            'case "$*" in *oldsha*) echo "rm: cannot remove: Permission denied" >&2; exit 1 ;; esac\n'
            f'exec "{Path(real_rm).as_posix()}" "$@"\n',
            encoding="utf-8",
            newline="\n",
        )
        fake_rm.chmod(0o755)
        self.seed(3)
        done = self.run_script("--always", SHA, BACKUP_KEEP="1")
        self.assertEqual(done.returncode, 0, self.output(done))
        self.assertTrue(any(f"-{SHA}-" in n for n in self.listing()), self.listing())
        self.assertTrue(self.output(done).strip())

    def test_new_backup_is_never_rotated_out_even_with_future_dated_files(self) -> None:
        self.backups.mkdir()
        future = self.backups / f"perseida-29990101T000000Z-futursha-{CURRENT}.dump"
        future.write_bytes(b"PGDMP-futur")
        done = self.run_script("--always", SHA, BACKUP_KEEP="1")
        self.assertEqual(done.returncode, 0, self.output(done))
        names = self.listing()
        self.assertEqual(len(names), 1, names)
        self.assertIn(f"-{SHA}-", names[0])


class FailureTest(BackupDbBase):
    def assert_fails_without_touching_backups(self, **overrides: str) -> None:
        prior = self.seed(8)
        done = self.run_script("--always", SHA, **overrides)
        self.assertNotEqual(done.returncode, 0, self.output(done))
        self.assertEqual(self.listing(), sorted(prior), "no ha de deixar fitxers incomplets ni esborrar còpies bones")
        self.assertTrue(self.output(done).strip(), "cal un missatge d'error")

    def test_dump_exit_nonzero(self) -> None:
        self.assert_fails_without_touching_backups(FAKE_DUMP_EXIT="1")

    def test_empty_dump(self) -> None:
        self.assert_fails_without_touching_backups(FAKE_DUMP_EMPTY="1")

    def test_pg_restore_list_fails(self) -> None:
        self.assert_fails_without_touching_backups(FAKE_LIST_FAIL="1")

    def test_write_error_midway_leaves_no_partial_file(self) -> None:
        self.assert_fails_without_touching_backups(FAKE_DUMP_PARTIAL="1")

    def test_failure_with_no_prior_backups_leaves_no_file(self) -> None:
        done = self.run_script("--always", SHA, FAKE_DUMP_EXIT="1")
        self.assertNotEqual(done.returncode, 0, self.output(done))
        self.assertEqual(self.listing(), [])

    def test_unwritable_backup_dir_fails_with_clear_message(self) -> None:
        blocker = self.tmp / "no-es-un-directori"
        blocker.write_text("fitxer, no directori", encoding="utf-8")
        done = self.run_script("--always", SHA, BACKUP_DIR=(blocker / "backups").as_posix())
        self.assertNotEqual(done.returncode, 0, self.output(done))
        self.assertTrue(self.output(done).strip(), "cal un missatge d'error")


class NoSecretsTest(BackupDbBase):
    def test_output_never_contains_password(self) -> None:
        scenarios = [
            ("--always", SHA, {}),
            ("--if-pending", CURRENT, {}),
            ("--if-pending", HEAD, {}),
            ("--always", SHA, {"FAKE_DUMP_EXIT": "1"}),
            ("--always", SHA, {"FAKE_LIST_FAIL": "1"}),
            ("--always", SHA, {"FAKE_DB_MISSING": "1"}),
            ("--always", SHA, {"FAKE_REVISION": ""}),
        ]
        for mode, arg, extra in scenarios:
            with self.subTest(mode=mode, arg=arg, extra=extra):
                args = (mode, HEAD, SHA) if mode == "--if-pending" and arg == HEAD else (
                    (mode, arg, SHA) if mode == "--if-pending" else (mode, arg)
                )
                done = self.run_script(*args, **extra)
                self.assertNotIn(SENTINEL, self.output(done))
                for dump in self.dumps():
                    self.assertNotIn(SENTINEL.encode(), dump.read_bytes())


@unittest.skipIf(sys.platform == "win32", "els modes POSIX (700/600) no s'apliquen a Windows")
class PermissionsTest(BackupDbBase):
    def test_new_dir_is_700_and_dump_is_600(self) -> None:
        done = self.run_script("--always", SHA)
        self.assertEqual(done.returncode, 0, self.output(done))
        self.assertEqual(self.backups.stat().st_mode & 0o777, 0o700)
        (dump,) = self.dumps()
        self.assertEqual(dump.stat().st_mode & 0o777, 0o600)

    def test_default_home_dir_is_700(self) -> None:
        done = self.run_script("--always", SHA, BACKUP_DIR=None)
        self.assertEqual(done.returncode, 0, self.output(done))
        directory = self.home / "perseida" / "backups"
        self.assertEqual(directory.stat().st_mode & 0o777, 0o700)


if __name__ == "__main__":
    unittest.main()
