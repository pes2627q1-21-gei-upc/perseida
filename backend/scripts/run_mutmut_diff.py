#!/usr/bin/env python3
"""Executa mutation testing amb mutmut únicament sobre els fitxers de domini modificats a la PR.

Requisit ADR-0028 i TG-359 (#370):
- Només s'aplica sobre els fitxers canviats a `backend/app/domain/` respecte a la branca base.
- Llindar bloquejant: mutation score >= 70%.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Mutation testing del backend sobre el git diff.")
    parser.add_argument(
        "--base-branch",
        default="origin/develop",
        help="Branca base contra la qual calcular el diff (per defecte origin/develop).",
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
        help="Llista explícita de fitxers a mutar (opcional; si s'omet es dedueixen de git diff).",
    )
    return parser.parse_args()


def get_changed_domain_files(base_branch: str) -> list[str]:
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
        print(f"⚠️ Error obtenint git diff contra {base_branch}: {err.stderr}", file=sys.stderr)
        return []

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


def main() -> int:
    args = parse_args()

    changed_files = [f[len("backend/") :] if f.startswith("backend/") else f for f in args.files]
    if not changed_files:
        changed_files = get_changed_domain_files(args.base_branch)

    if not changed_files:
        print("ℹ️ Cap fitxer de domini (backend/app/domain) modificat a la PR. Mutation testing del backend omès.")
        return 0

    print(f"🧬 Fitxers de domini a analitzar amb mutmut ({len(changed_files)}):")
    for f in changed_files:
        print(f"   - {f}")

    # Netejar residus d'execucions prèvies
    mutants_dir = Path("mutants")
    shutil.rmtree(mutants_dir, ignore_errors=True)

    try:
        from mutmut import configuration
        from mutmut.__main__ import (
            SourceFileMutationData,
            _run,
            calculate_summary_stats,
            save_cicd_stats,
            walk_mutatable_files,
        )
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

    killed = stats.killed
    survived = stats.survived
    timeout = stats.timeout
    total_tested = killed + survived + timeout

    if total_tested == 0:
        print("ℹ️ Tots els mutants generats s'han descartat o no tenien tests associats.")
        return 0

    score = ((killed + timeout) / total_tested) * 100.0

    print("\n" + "=" * 60)
    print("📊 RESULTAT DEL MUTATION TESTING (backend)")
    print("=" * 60)
    print(f"   Mutants morts (killed):       {killed}")
    print(f"   Mutants supervivents (surv):  {survived}")
    print(f"   Mutants timeout (timeout):    {timeout}")
    print(f"   Total efectiu:                {total_tested}")
    print(f"   Mutation score:               {score:.2f}% (llindar requerit: {args.threshold:.2f}%)")
    print("=" * 60)

    if score < args.threshold:
        print(f"❌ ERROR: Mutation score {score:.2f}% inferior al llindar bloquejant ({args.threshold:.2f}%).")
        return 1

    print(f"✅ Mutation score {score:.2f}% >= {args.threshold:.2f}% superat amb èxit!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
