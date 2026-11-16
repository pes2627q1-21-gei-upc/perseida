#!/usr/bin/env python3
"""Mutation testing amb mutmut sobre els fitxers de domini modificats a la PR.

Requisit ADR-0028 i TG-359 (#370):
- Només s'aplica sobre els fitxers canviats a backend/app/domain/.
- Llindar bloquejant: mutation score >= 70%.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from mutmut.stats import Stat

# Assegurar UTF-8 a sortida estàndard (p. ex. Windows/consoles sense UTF-8)
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    reconfig_out = getattr(sys.stdout, "reconfigure", None)
    if callable(reconfig_out):
        reconfig_out(encoding="utf-8")
    reconfig_err = getattr(sys.stderr, "reconfigure", None)
    if callable(reconfig_err):
        reconfig_err(encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Mutation testing del backend sobre el git diff."
    )
    parser.add_argument(
        "--base-branch",
        default="origin/develop",
        help="Branca base contra la qual calcular el diff (defecte origin/develop).",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=70.0,
        help="Percentatge mínim de mutation score requerit (per defecte 70.0).",
    )
    parser.add_argument(
        "--files",
        nargs="*",
        default=[],
        help=(
            "Llista explícita de fitxers a mutar "
            "(opcional; si s'omet es dedueixen de git diff)."
        ),
    )
    return parser.parse_args()


def get_changed_domain_files(base_branch: str) -> list[str] | None:
    try:
        diff_cmd = [
            "git",
            "diff",
            "--name-only",
            f"{base_branch}...HEAD",
            "--",
            "app/domain",
            "backend/app/domain",
        ]
        proc = subprocess.run(diff_cmd, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as err:
        print(
            f"❌ Error obtenint git diff contra {base_branch}: {err.stderr}",
            file=sys.stderr,
        )
        return None

    files: list[str] = []
    for line in proc.stdout.splitlines():
        clean = line.strip()
        if not clean or not clean.endswith(".py"):
            continue
        if clean.startswith("backend/"):
            clean = clean[len("backend/") :]
        if Path(clean).is_file():
            files.append(clean)

    return sorted(set(files))


def evaluate_mutation_results(stats: Stat, threshold: float) -> int:
    killed = stats.killed
    survived = stats.survived
    timeout = stats.timeout
    no_tests = stats.no_tests
    suspicious = stats.suspicious

    # Els mutants sense tests (no_tests) i sospitosos compten com a supervivents
    effective_survived = survived + no_tests + suspicious
    total_evaluated = killed + timeout + effective_survived

    if total_evaluated == 0:
        print(
            "❌ ERROR: S'han generat mutants al domini pero cap s'ha provat "
            "(sense tests associats)."
        )
        return 1

    score = ((killed + timeout) / total_evaluated) * 100.0

    print("\n" + "=" * 60)
    print("📊 RESULTAT DEL MUTATION TESTING (backend)")
    print("=" * 60)
    print(f"   Mutants morts (killed):       {killed}")
    print(f"   Mutants supervivents (surv):  {survived}")
    print(f"   Mutants sense tests (no_tst): {no_tests}")
    print(f"   Mutants sospitosos (susp):    {suspicious}")
    print(f"   Mutants timeout (timeout):    {timeout}")
    print(f"   Total avaluat:                {total_evaluated}")
    print(
        f"   Mutation score:               {score:.2f}% "
        f"(llindar requerit: {threshold:.2f}%)"
    )
    print("=" * 60)

    if score < threshold:
        print(
            f"❌ ERROR: Mutation score {score:.2f}% inferior al llindar bloquejant "
            f"({threshold:.2f}%)."
        )
        return 1

    print(f"✅ Mutation score {score:.2f}% >= {threshold:.2f}% superat amb èxit!")
    return 0


def main() -> int:
    args = parse_args()

    if args.files:
        changed_files: list[str] | None = [
            f[len("backend/") :] if f.startswith("backend/") else f for f in args.files
        ]
    else:
        changed_files = get_changed_domain_files(args.base_branch)

    if changed_files is None:
        print(
            f"❌ ERROR: No s'ha pogut obtenir el git diff contra '{args.base_branch}'."
        )
        return 1

    if not changed_files:
        print(
            "ℹ️ Cap fitxer de domini (backend/app/domain) modificat a la PR. "
            "Mutation testing del backend omès."
        )
        return 0

    print(f"🧬 Fitxers de domini a analitzar amb mutmut ({len(changed_files)}):")
    for f in changed_files:
        print(f"   - {f}")

    # Netejar residus d'execucions prèvies
    shutil.rmtree(Path("mutants"), ignore_errors=True)

    try:
        from mutmut import configuration
        from mutmut.__main__ import _run, save_cicd_stats
        from mutmut.mutation.data import SourceFileMutationData
        from mutmut.stats import calculate_summary_stats
        from mutmut.utils.file_utils import walk_mutatable_files
    except ImportError as err:
        print(f"❌ Error importants mòduls de mutmut: {err}", file=sys.stderr)
        return 1

    cfg = configuration.config()
    cfg.only_mutate = changed_files

    max_children = min(os.cpu_count() or 4, 8)
    print(f"🚀 Iniciant mutmut (workers: {max_children})...")
    _run([], max_children=max_children)

    # Recopilar i guardar estadístiques
    source_file_mutation_data_by_path: dict[str, SourceFileMutationData] = {}
    for path in walk_mutatable_files():
        m = SourceFileMutationData(path=path)
        m.load()
        if m.exit_code_by_key:
            source_file_mutation_data_by_path[str(path)] = m

    if not source_file_mutation_data_by_path:
        print("ℹ️ No s'ha generat cap mutant per als fitxers analitzats.")
        return 0

    save_cicd_stats(source_file_mutation_data_by_path)
    stats = calculate_summary_stats(source_file_mutation_data_by_path)
    return evaluate_mutation_results(stats, args.threshold)


if __name__ == "__main__":
    sys.exit(main())
