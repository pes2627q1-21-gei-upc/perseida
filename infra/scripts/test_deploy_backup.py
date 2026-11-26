"""Proves de la integració de la còpia de la base de dades a `deploy.sh` (TG-386; stdlib):

    python -m unittest infra/scripts/test_deploy_backup.py

`deploy.sh` s'executa copiat a un directori temporal, amb un `docker` FALS al `PATH` que
REGISTRA les crides en ordre i simula el Compose, i amb un `backup-db.sh` FALS que
registra els seus arguments al mateix registre i surt amb el codi configurat. Així es
proven l'ordre i els arguments de la integració (el comportament real del dump ja el
cobreix `test_backup_db.py`). Variables de control (entorn de la prova):

    FAKE_HEAD                 revisió que torna `alembic heads` (buida = cap)
    FAKE_HEALTHY              tags separats per comes que passen el healthcheck de l'API
    FAKE_PROBE_OK             si és 1, la sonda de la versió anterior respon
    FAKE_DOWNGRADE_EXIT       codi de sortida d'`alembic downgrade` (0 per defecte)
    FAKE_BACKUP_EXIT_PENDING  codi del fals backup en mode --if-pending
    FAKE_BACKUP_EXIT_ALWAYS   codi del fals backup en mode --always
"""

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

DEPLOY = Path(__file__).with_name("deploy.sh")
SENTINEL = "S3NT1NEL-S3CRET-NO-HA-DE-SORTIR"
HEAD = "b2c3d4e5f6a7"
NEW_TAG = "sha-a1b2c3d"
NEW_SHA = "a1b2c3d"
OLD_TAG = "sha-9f8e7d6"
OLD_SHA = "9f8e7d6"
ATTEMPT_TAG = "sha-c0ffee1"
ATTEMPT_SHA = "c0ffee1"

FAKE_DOCKER = r"""#!/bin/sh
# docker fals per a les proves de la integració de la còpia a deploy.sh
args="$*"
first=$(printf '%s' "$args" | head -n 1)
printf '%s\n' "docker tag=${API_IMAGE_TAG:-} $first" >> "$FAKE_LOG"
case "$args" in
  *"compose pull"*) exit 0 ;;
  *"config --images"*)
    echo "ghcr.io/org/perseida-api:${API_IMAGE_TAG:-}"
    exit 0
    ;;
  *"--entrypoint alembic"*heads*)
    if [ -n "${FAKE_HEAD:-}" ]; then echo "$FAKE_HEAD (head)"; fi
    exit 0
    ;;
  *"alembic downgrade"*) exit "${FAKE_DOWNGRADE_EXIT:-0}" ;;
  *"compose up"*)
    printf '%s\n' "${API_IMAGE_TAG:-}" > "$FAKE_STATE"
    exit 0
    ;;
  *"compose exec"*)
    running=$(cat "$FAKE_STATE" 2>/dev/null || true)
    case ",${FAKE_HEALTHY:-}," in
      *",$running,"*) exit 0 ;;
    esac
    exit 1
    ;;
  *"compose stop"*) rm -f "$FAKE_STATE"; exit 0 ;;
  *"compose run -d"*) exit 0 ;;
  "exec perseida-probe"*)
    [ "${FAKE_PROBE_OK:-0}" = 1 ] && exit 0
    exit 1
    ;;
  inspect*) echo true; exit 0 ;;
  *) exit 0 ;;
esac
"""

FAKE_BACKUP = r"""#!/bin/sh
# backup-db.sh fals: registra arguments i entorn rellevant
echo "backup $*" >> "$FAKE_LOG"
echo "backupenv BACKUP_DIR=${BACKUP_DIR:-} BACKUP_KEEP=${BACKUP_KEEP:-}" >> "$FAKE_LOG"
env >> "$FAKE_ENVDUMP"
case "$1" in
  --always) code=${FAKE_BACKUP_EXIT_ALWAYS:-0} ;;
  *) code=${FAKE_BACKUP_EXIT_PENDING:-0} ;;
esac
if [ "$code" != 0 ]; then echo "FAKE-BACKUP-ERROR" >&2; fi
exit "$code"
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
class DeployBackupBase(unittest.TestCase):
    ENV_TEXT = "API_IMAGE_TAG=x\nFOO=bar\n"

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.bin = self.tmp / "bin"
        self.bin.mkdir()
        for name, text in (("docker", FAKE_DOCKER), ("sleep", "#!/bin/sh\nexit 0\n")):
            path = self.bin / name
            path.write_text(text, encoding="utf-8", newline="\n")
            path.chmod(0o755)
        self.work = self.tmp / "work"
        self.work.mkdir()
        shutil.copy(DEPLOY, self.work / "deploy.sh")
        backup = self.work / "backup-db.sh"
        backup.write_text(FAKE_BACKUP, encoding="utf-8", newline="\n")
        backup.chmod(0o755)
        (self.work / ".env").write_text(self.ENV_TEXT, encoding="utf-8", newline="\n")
        self.log = self.tmp / "calls.log"
        self.state = self.tmp / "running"
        self.envdump = self.tmp / "envdump.txt"
        self.log.write_text("", encoding="utf-8", newline="\n")
        self.envdump.write_text("", encoding="utf-8", newline="\n")

    def run_deploy(self, *args: str, **overrides: str) -> subprocess.CompletedProcess:
        env = {
            k: v
            for k, v in os.environ.items()
            if not k.startswith(("FAKE_", "BACKUP_", "API_IMAGE_TAG", "POSTGRES_"))
        }
        env.update(
            {
                "PATH": f"{self.bin.as_posix()}{os.pathsep}{env.get('PATH', '')}",
                "HEALTH_TIMEOUT": "1",
                "PROBE_TIMEOUT": "1",
                "FAKE_LOG": self.log.as_posix(),
                "FAKE_STATE": self.state.as_posix(),
                "FAKE_ENVDUMP": self.envdump.as_posix(),
                "FAKE_HEAD": HEAD,
                "FAKE_HEALTHY": NEW_TAG,
            }
        )
        env.update(overrides)
        return subprocess.run(
            [SH, (self.work / "deploy.sh").as_posix(), *args],
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

    def calls(self) -> list[str]:
        return self.log.read_text(encoding="utf-8").splitlines()

    def backup_calls(self) -> list[str]:
        return [c for c in self.calls() if c.startswith("backup ")]

    def index_of(self, needle: str, start: int = 0) -> int:
        for i, line in enumerate(self.calls()):
            if i >= start and needle in line:
                return i
        return -1

    def seed_state(self, deployed: str | None = None, attempted: str | None = None, env_names: bool = False) -> None:
        if deployed is not None:
            (self.work / ".deployed-tag").write_text(deployed + "\n", encoding="utf-8", newline="\n")
        if attempted is not None:
            (self.work / ".attempted-tag").write_text(attempted + "\n", encoding="utf-8", newline="\n")
        if env_names:
            (self.work / ".deployed-env").write_text("API_IMAGE_TAG=\nFOO=\n", encoding="utf-8", newline="\n")

    def read(self, name: str) -> str | None:
        path = self.work / name
        return path.read_text(encoding="utf-8").strip() if path.exists() else None


class BackupBeforeDeployTest(DeployBackupBase):
    """TG-386: la còpia es fa abans d'arrencar la imatge nova (que és qui migra)."""

    def test_pending_migrations_calls_backup_if_pending_before_up(self) -> None:
        done = self.run_deploy(NEW_TAG)
        self.assertEqual(done.returncode, 0, self.output(done))
        self.assertEqual(self.backup_calls(), [f"backup --if-pending {HEAD} {NEW_SHA}"], self.calls())
        backup_at = self.index_of("backup --if-pending")
        up_at = self.index_of("compose up")
        self.assertGreaterEqual(backup_at, 0, self.calls())
        self.assertGreaterEqual(up_at, 0, self.calls())
        self.assertLess(backup_at, up_at, self.calls())

    def test_unknown_head_calls_backup_always_before_up(self) -> None:
        done = self.run_deploy(NEW_TAG, FAKE_HEAD="")
        self.assertEqual(done.returncode, 0, self.output(done))
        self.assertEqual(self.backup_calls(), [f"backup --always {NEW_SHA}"], self.calls())
        self.assertLess(self.index_of("backup --always"), self.index_of("compose up"), self.calls())

    def test_skipped_backup_still_deploys(self) -> None:
        # El fals surt 0 sense fer res: sense migracions pendents o primer desplegament sense `db`.
        done = self.run_deploy(NEW_TAG)
        self.assertEqual(done.returncode, 0, self.output(done))
        self.assertGreaterEqual(self.index_of("compose up"), 0, self.calls())
        self.assertEqual(self.read(".deployed-tag"), NEW_TAG)
        self.assertIsNone(self.read(".attempted-tag"))
        self.assertIn("Desplegat", self.output(done))


class FailedBackupDeployTest(DeployBackupBase):
    def assert_aborted(self, previous: str | None) -> None:
        self.seed_state(deployed=previous)
        done = self.run_deploy(NEW_TAG, FAKE_BACKUP_EXIT_PENDING="1")
        self.assertNotEqual(done.returncode, 0, self.output(done))
        self.assertEqual(self.index_of("compose up"), -1, self.calls())
        self.assertEqual(self.read(".deployed-tag"), previous)
        self.assertIsNone(self.read(".attempted-tag"))
        self.assertRegex(done.stderr.lower(), r"c[òo]pia|backup", done.stderr)

    def test_failed_backup_aborts_deploy_with_previous_state(self) -> None:
        self.assert_aborted(OLD_TAG)

    def test_failed_backup_aborts_first_deploy_without_state(self) -> None:
        self.assert_aborted(None)

    def test_failed_backup_with_unknown_head_aborts_too(self) -> None:
        done = self.run_deploy(NEW_TAG, FAKE_HEAD="", FAKE_BACKUP_EXIT_ALWAYS="1")
        self.assertNotEqual(done.returncode, 0, self.output(done))
        self.assertEqual(self.index_of("compose up"), -1, self.calls())
        self.assertIsNone(self.read(".attempted-tag"))


class BackupBeforeDowngradeTest(DeployBackupBase):
    def test_manual_rollback_backs_up_always_before_downgrade(self) -> None:
        self.seed_state(deployed=NEW_TAG)
        done = self.run_deploy("--rollback", OLD_TAG, FAKE_HEALTHY=OLD_TAG)
        self.assertEqual(done.returncode, 0, self.output(done))
        self.assertEqual(self.backup_calls(), [f"backup --always {NEW_SHA}"], self.calls())
        backup_at = self.index_of("backup --always")
        downgrade_at = self.index_of("alembic downgrade")
        self.assertGreaterEqual(downgrade_at, 0, self.calls())
        self.assertGreaterEqual(backup_at, 0, self.calls())
        self.assertLess(backup_at, downgrade_at, self.calls())

    def test_manual_rollback_uses_sha_of_attempted_tag_as_origin(self) -> None:
        self.seed_state(deployed=OLD_TAG, attempted=ATTEMPT_TAG)
        done = self.run_deploy("--rollback", OLD_TAG, FAKE_HEALTHY=OLD_TAG)
        self.assertEqual(done.returncode, 0, self.output(done))
        self.assertEqual(self.backup_calls(), [f"backup --always {ATTEMPT_SHA}"], self.calls())

    def test_automatic_rollback_backs_up_always_before_downgrade(self) -> None:
        self.seed_state(deployed=OLD_TAG, env_names=True)
        done = self.run_deploy(NEW_TAG, FAKE_HEALTHY=OLD_TAG, FAKE_PROBE_OK="1")
        self.assertEqual(done.returncode, 1, self.output(done))
        self.assertEqual(
            self.backup_calls(),
            [f"backup --if-pending {HEAD} {NEW_SHA}", f"backup --always {NEW_SHA}"],
            self.calls(),
        )
        always_at = self.index_of("backup --always")
        downgrade_at = self.index_of("alembic downgrade")
        self.assertGreaterEqual(downgrade_at, 0, self.calls())
        self.assertGreaterEqual(always_at, 0, self.calls())
        self.assertLess(always_at, downgrade_at, self.calls())

    def test_manual_rollback_with_failed_backup_does_not_downgrade(self) -> None:
        self.seed_state(deployed=NEW_TAG)
        done = self.run_deploy("--rollback", OLD_TAG, FAKE_HEALTHY=OLD_TAG, FAKE_BACKUP_EXIT_ALWAYS="1")
        self.assertNotEqual(done.returncode, 0, self.output(done))
        self.assertEqual(self.index_of("alembic downgrade"), -1, self.calls())
        self.assertRegex(done.stderr.lower(), r"c[òo]pia|backup", done.stderr)
        self.assertEqual(self.read(".deployed-tag"), NEW_TAG)

    def test_automatic_rollback_with_failed_backup_does_not_downgrade(self) -> None:
        self.seed_state(deployed=OLD_TAG, env_names=True)
        done = self.run_deploy(
            NEW_TAG, FAKE_HEALTHY=OLD_TAG, FAKE_PROBE_OK="1", FAKE_BACKUP_EXIT_ALWAYS="1"
        )
        self.assertNotEqual(done.returncode, 0, self.output(done))
        self.assertEqual(self.index_of("alembic downgrade"), -1, self.calls())
        self.assertRegex(done.stderr.lower(), r"c[òo]pia|backup", done.stderr)


class NoRegressionTest(DeployBackupBase):
    def test_successful_deploy_writes_state_and_message(self) -> None:
        done = self.run_deploy(NEW_TAG)
        self.assertEqual(done.returncode, 0, self.output(done))
        self.assertEqual(self.read(".deployed-tag"), NEW_TAG)
        self.assertEqual(self.read(".deployed-env"), "API_IMAGE_TAG=\nFOO=")
        self.assertIsNone(self.read(".attempted-tag"))
        self.assertIn(f"Desplegat {NEW_TAG}", self.output(done))

    def test_failed_healthcheck_without_previous_keeps_attempted_tag(self) -> None:
        done = self.run_deploy(NEW_TAG, FAKE_HEALTHY="")
        self.assertEqual(done.returncode, 1, self.output(done))
        self.assertEqual(self.read(".attempted-tag"), NEW_TAG)
        self.assertIn("rollback no possible", done.stderr)

    def test_full_automatic_rollback_restarts_previous_version(self) -> None:
        self.seed_state(deployed=OLD_TAG, env_names=True)
        done = self.run_deploy(NEW_TAG, FAKE_HEALTHY=OLD_TAG, FAKE_PROBE_OK="1")
        self.assertEqual(done.returncode, 1, self.output(done))
        self.assertIn("run -d", "\n".join(self.calls()))
        self.assertIn(f"Rollback fet: l'API torna a respondre amb {OLD_TAG}", done.stderr)
        self.assertEqual(self.state.read_text(encoding="utf-8").strip(), OLD_TAG)
        self.assertEqual(self.read(".deployed-tag"), OLD_TAG)
        self.assertEqual(self.read(".attempted-tag"), NEW_TAG)

    def test_probe_failure_still_skips_downgrade_and_backup_always(self) -> None:
        self.seed_state(deployed=OLD_TAG, env_names=True)
        done = self.run_deploy(NEW_TAG, FAKE_HEALTHY=OLD_TAG, FAKE_PROBE_OK="0")
        self.assertEqual(done.returncode, 1, self.output(done))
        self.assertEqual(self.index_of("alembic downgrade"), -1, self.calls())
        self.assertNotIn(f"backup --always {NEW_SHA}", self.backup_calls())
        self.assertIn("tampoc arrenca", done.stderr)

    def test_changed_env_names_still_skips_downgrade_and_backup_always(self) -> None:
        self.seed_state(deployed=OLD_TAG)
        (self.work / ".deployed-env").write_text("API_IMAGE_TAG=\nALTRA=\n", encoding="utf-8", newline="\n")
        done = self.run_deploy(NEW_TAG, FAKE_HEALTHY=OLD_TAG, FAKE_PROBE_OK="1")
        self.assertEqual(done.returncode, 1, self.output(done))
        self.assertEqual(self.index_of("alembic downgrade"), -1, self.calls())
        self.assertNotIn(f"backup --always {NEW_SHA}", self.backup_calls())
        self.assertIn("noms de variable del .env han canviat", done.stderr)

    def test_successful_manual_rollback_writes_state(self) -> None:
        self.seed_state(deployed=NEW_TAG, attempted=NEW_TAG)
        done = self.run_deploy("--rollback", OLD_TAG, FAKE_HEALTHY=OLD_TAG)
        self.assertEqual(done.returncode, 0, self.output(done))
        self.assertEqual(self.read(".deployed-tag"), OLD_TAG)
        self.assertIsNone(self.read(".attempted-tag"))
        self.assertIn("Rollback fet:", self.output(done))


class BackupEnvironmentTest(DeployBackupBase):
    ENV_TEXT = (
        "API_IMAGE_TAG=x\n"
        "BACKUP_DIR=/srv/perseida-copies\n"
        "BACKUP_KEEP=3\n"
        f"POSTGRES_PASSWORD={SENTINEL}\n"
        f"SECRET_KEY={SENTINEL}\n"
    )

    def test_backup_dir_and_keep_from_env_file_reach_backup(self) -> None:
        done = self.run_deploy(NEW_TAG)
        self.assertEqual(done.returncode, 0, self.output(done))
        envs = [c for c in self.calls() if c.startswith("backupenv ")]
        self.assertEqual(envs, ["backupenv BACKUP_DIR=/srv/perseida-copies BACKUP_KEEP=3"], self.calls())

    def test_other_env_file_variables_do_not_reach_backup_or_output(self) -> None:
        done = self.run_deploy(NEW_TAG)
        self.assertEqual(done.returncode, 0, self.output(done))
        self.assertNotIn(SENTINEL, self.envdump.read_text(encoding="utf-8"))
        self.assertNotIn(SENTINEL, self.output(done))
        self.assertNotIn(SENTINEL, "\n".join(self.calls()))

    def test_no_secrets_in_output_when_backup_fails(self) -> None:
        done = self.run_deploy(NEW_TAG, FAKE_BACKUP_EXIT_PENDING="1")
        self.assertNotEqual(done.returncode, 0)
        self.assertNotIn(SENTINEL, self.output(done))
        self.assertNotIn(SENTINEL, self.envdump.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
