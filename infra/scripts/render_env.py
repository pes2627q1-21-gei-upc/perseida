#!/usr/bin/env python3
"""Valida i renderitza el `.env` de producció a partir de secrets i variables de GitHub.

Ús (el workflow `cd.yml` l'executa als passos de verificació i de render):

    render_env.py check    comprova que no en falta cap; si en falten, les llista totes
    render_env.py mask     imprimeix les ordres ::add-mask:: dels valors que són secrets
    render_env.py render   escriu el `.env` per stdout (no el desa enlloc)

Entrada (variables d'entorn):

    SECRETS_JSON   `toJSON(secrets)` del workflow
    VARS_JSON      `toJSON(vars)` del workflow
    ENV_TEMPLATE   plantilla amb els noms requerits (per defecte `.env.example`)
    ENV_EXCLUDE    noms de la plantilla que no van al servidor, separats per espais

Mai s'imprimeix el valor d'una variable als missatges d'error.
"""

import json
import os
import re
import sys

NAME = re.compile(r"^([A-Z][A-Z0-9_]*)=", re.MULTILINE)


def required_names() -> list[str]:
    template = os.environ.get("ENV_TEMPLATE", ".env.example")
    excluded = set(os.environ.get("ENV_EXCLUDE", "").split())
    with open(template, encoding="utf-8") as f:
        names = NAME.findall(f.read())
    return [n for n in dict.fromkeys(names) if n not in excluded]


def load_context() -> tuple[dict[str, str], dict[str, str]]:
    return (
        json.loads(os.environ.get("SECRETS_JSON") or "{}"),
        json.loads(os.environ.get("VARS_JSON") or "{}"),
    )


def check() -> int:
    secrets, variables = load_context()
    missing = [n for n in required_names() if n not in secrets and n not in variables]
    if missing:
        print("Falten secrets o variables requerits al repositori:", file=sys.stderr)
        for name in missing:
            print(f"  - {name}", file=sys.stderr)
        return 1
    print("Tots els secrets i variables requerits existeixen.")
    return 0


def mask() -> int:
    secrets, _ = load_context()
    for name in required_names():
        if name in secrets:
            print(f"::add-mask::{secrets[name]}")
    return 0


def render() -> int:
    secrets, variables = load_context()
    lines = []
    for name in required_names():
        value = secrets.get(name, variables.get(name))
        if value is None:
            print(f"Falta {name}", file=sys.stderr)
            return 1
        # Entre cometes simples el valor és literal; no es pot escapar una cometa
        # simple ni representar un salt de línia, així que es rebutgen.
        if "\n" in value or "\r" in value or "'" in value:
            print(f"El valor de {name} conté un salt de línia o una cometa simple", file=sys.stderr)
            return 1
        lines.append(f"{name}='{value}'\n")
    sys.stdout.buffer.write("".join(lines).encode("utf-8"))
    return 0


COMMANDS = {"check": check, "mask": mask, "render": render}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        print(f"Ús: {sys.argv[0]} {{{'|'.join(COMMANDS)}}}", file=sys.stderr)
        sys.exit(2)
    sys.exit(COMMANDS[sys.argv[1]]())
