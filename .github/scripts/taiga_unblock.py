"""Desmarca a Taiga les US "Blocked" quan totes les US que les bloquegen estan tancades.

Convenció: una US bloquejada té `is_blocked = true` i una `blocked_note` amb el format
"Bloquejada per: #31, #33". Les US bloquejades amb una nota diferent (bloqueig manual)
no es toquen. Una US bloquejadora es considera resolta quan el seu estat és tancat
(`is_closed`: Done i Archived).

Variables d'entorn:
  TAIGA_USERNAME, TAIGA_PASSWORD  credencials (secrets del repositori)
  TAIGA_PROJECT_SLUG              slug del projecte (variable del repositori)
  TAIGA_URL                       opcional, per defecte https://api.taiga.io
  DRY_RUN=1                       només mostra què faria
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request

BASE_URL = os.environ.get("TAIGA_URL", "https://api.taiga.io").rstrip("/")
API = f"{BASE_URL}/api/v1"
NOTE_PREFIX = "Bloquejada per:"
DRY_RUN = os.environ.get("DRY_RUN") == "1"


def request(method, path, token=None, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as err:
        # No imprimim el cos de la petició (pot contenir credencials).
        sys.exit(f"Error HTTP {err.code} a {method} {path}: {err.read().decode()[:300]}")


def parse_blockers(note):
    if not note or not note.strip().startswith(NOTE_PREFIX):
        return None
    return [int(ref) for ref in re.findall(r"#(\d+)", note)]


def main():
    username = os.environ["TAIGA_USERNAME"]
    password = os.environ["TAIGA_PASSWORD"]
    slug = os.environ["TAIGA_PROJECT_SLUG"]

    token = request("POST", "/auth", body={"type": "normal", "username": username, "password": password})["auth_token"]
    project = request("GET", f"/projects/by_slug?slug={slug}", token)
    stories = request(
        "GET", f"/userstories?project={project['id']}", token, headers={"x-disable-pagination": "True"}
    )
    by_ref = {story["ref"]: story for story in stories}

    unblocked = 0
    for story in stories:
        if not story["is_blocked"]:
            continue
        blockers = parse_blockers(story.get("blocked_note"))
        if blockers is None:
            continue  # bloqueig manual, no el toquem
        missing = [ref for ref in blockers if ref not in by_ref]
        if missing:
            print(f"#{story['ref']}: referències inexistents {missing}, es manté bloquejada")
            continue
        pending = [ref for ref in blockers if not by_ref[ref]["status_extra_info"]["is_closed"]]
        if pending:
            continue
        print(f"#{story['ref']} {story['subject']}: desbloquejada (resolts: {blockers})")
        unblocked += 1
        if not DRY_RUN:
            request(
                "PATCH",
                f"/userstories/{story['id']}",
                token,
                body={"is_blocked": False, "blocked_note": "", "version": story["version"]},
            )

    print(f"Total desbloquejades: {unblocked}{' (dry run)' if DRY_RUN else ''}")


if __name__ == "__main__":
    main()
