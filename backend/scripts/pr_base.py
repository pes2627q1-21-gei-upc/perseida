#!/usr/bin/env python3
"""Base real d'una PR de GitHub per als passos de la CI que mesuren el codi nou.

En una PR d'un stack (stacked PRs de GitHub) el context del workflow `github.base_ref`
val el tronc de l'stack (`develop`) i no la branca pare de la PR; l'API REST de la PR
(`base.ref`) sí que diu la base real. Si `diff-cover` i `mutmut` diffegen contra el
tronc, cada capa mesura tota la pila en lloc dels seus propis canvis.

Aquest script imprimeix a stdout la base a fer servir (`origin/<branca>`) i explica a
stderr d'on ve. Si l'API no respon, la branca no és vàlida o no existeix en local,
imprimeix la base d'abans (`--fallback`, el que dona `github.base_ref`). Una PR
ordinària (base `develop` o `main`) i un push no canvien.

Mateixa semàntica que `frontend/scripts/run-stryker-diff.mjs`
(`fetchPrBaseRef` i `resolveBaseBranch`).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request
from collections.abc import Callable, Mapping, Sequence
from typing import Any, NamedTuple

DEFAULT_API_URL = "https://api.github.com"
TIMEOUT_SECONDS = 15.0


class ResolvedBase(NamedTuple):
    """Base del diff i d'on surt (`api` o `fallback`)."""

    base_branch: str
    source: str


def fetch_pr_base_ref(
    *,
    repository: str | None,
    pr_number: int | None,
    token: str | None,
    api_url: str = DEFAULT_API_URL,
    urlopen: Callable[..., Any] = urllib.request.urlopen,
    timeout: float = TIMEOUT_SECONDS,
) -> str | None:
    """Branca base real d'una PR segons l'API REST (`base.ref`), o `None`.

    Qualsevol error (xarxa, límit, resposta estranya) dona `None` perquè qui crida
    mantingui la base d'abans.
    """
    if not repository or not pr_number:
        return None
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(  # noqa: S310 (URL https de l'API de GitHub)
        f"{api_url}/repos/{repository}/pulls/{pr_number}", headers=headers
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                return None
            payload = json.loads(response.read())
    except OSError, ValueError:
        return None
    base = payload.get("base") if isinstance(payload, dict) else None
    ref = base.get("ref") if isinstance(base, dict) else None
    return ref if isinstance(ref, str) and ref else None


def resolve_base_branch(
    *,
    fallback: str,
    pr_base_ref: str | None,
    ref_exists: Callable[[str], bool],
) -> ResolvedBase:
    """Tria la base del diff.

    És la base real de la PR (`origin/<pr_base_ref>`) si l'API l'ha donada, és un nom
    de branca acceptable i existeix en local; si no, `fallback`.
    """
    if (
        pr_base_ref
        and not pr_base_ref.startswith("-")
        and not re.search(r"\s", pr_base_ref)
    ):
        candidate = f"origin/{pr_base_ref}"
        if ref_exists(candidate):
            return ResolvedBase(candidate, "api")
    return ResolvedBase(fallback, "fallback")


def ref_exists_locally(ref: str) -> bool:
    result = subprocess.run(
        ["git", "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}"],
        capture_output=True,
        check=False,
    )
    return result.returncode == 0


def _pr_number(value: str) -> int | None:
    """Un número de PR vàlid (enter positiu); qualsevol altra cosa, `None`."""
    return int(value) if re.fullmatch(r"[1-9]\d*", value) else None


def main(argv: Sequence[str], env: Mapping[str, str]) -> int:
    parser = argparse.ArgumentParser(
        description="Imprimeix la base real d'una PR (origin/<branca>)."
    )
    parser.add_argument(
        "--fallback",
        default="origin/develop",
        help="Base si no es pot saber la real (el que dona github.base_ref).",
    )
    parser.add_argument(
        "--pr-number",
        type=_pr_number,
        default=None,
        help="Número de la PR; sense ell no es consulta l'API.",
    )
    args = parser.parse_args(argv)

    pr_base_ref = None
    if args.pr_number is not None:
        pr_base_ref = fetch_pr_base_ref(
            repository=env.get("GITHUB_REPOSITORY"),
            pr_number=args.pr_number,
            token=env.get("GITHUB_TOKEN"),
            api_url=env.get("GITHUB_API_URL") or DEFAULT_API_URL,
        )
    resolved = resolve_base_branch(
        fallback=args.fallback,
        pr_base_ref=pr_base_ref,
        ref_exists=ref_exists_locally,
    )
    if resolved.source == "api":
        why = (
            f"base real de la PR #{args.pr_number} segons l'API; "
            f"{args.fallback} és el que dona github.base_ref"
        )
    elif args.pr_number is None:
        why = f"cap PR a consultar; s'usa {args.fallback}"
    else:
        why = (
            f"no s'ha pogut obtenir la base real de la PR #{args.pr_number}; "
            f"s'usa {args.fallback}"
        )
    print(f"ℹ️ Base del diff: {resolved.base_branch} ({why}).", file=sys.stderr)
    print(resolved.base_branch)
    return 0


if __name__ == "__main__":
    # UTF-8 també a Windows o a consoles que no ho són (el missatge duu un emoji).
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:], os.environ))
