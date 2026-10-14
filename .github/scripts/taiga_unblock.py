"""Desmarca a Taiga les US i tasques "Blocked" quan tots els elements que les bloquegen estan tancats.

Convenció: un element bloquejat (US o tasca) té `is_blocked = true` i una `blocked_note` amb el format
"Bloquejada per: #31, #33". Les referències (`#N`) poden ser d'una US o d'una tasca: a Taiga comparteixen
numeració dins del projecte. Els elements bloquejats amb una nota diferent (bloqueig manual) no es toquen.
Un element bloquejador es considera resolt quan el seu estat és tancat (`is_closed`: Done i Archived a les
US; Cerrada a les tasques).

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


def find_unblockable(items, by_ref):
    """Retorna els elements bloquejats que es poden desbloquejar, i els que tenen referències inexistents.

    `items` són les US i tasques del projecte; `by_ref` els indexa per `ref`.
    """
    unblockable = []
    dangling = []
    for item in items:
        if not item["is_blocked"]:
            continue
        blockers = parse_blockers(item.get("blocked_note"))
        if blockers is None:
            continue  # bloqueig manual, no el toquem
        missing = [ref for ref in blockers if ref not in by_ref]
        if missing:
            dangling.append((item, missing))
            continue
        if all(by_ref[ref]["status_extra_info"]["is_closed"] for ref in blockers):
            unblockable.append((item, blockers))
    return unblockable, dangling


def main():
    username = os.environ["TAIGA_USERNAME"]
    password = os.environ["TAIGA_PASSWORD"]
    slug = os.environ["TAIGA_PROJECT_SLUG"]
    no_pagination = {"x-disable-pagination": "True"}

    token = request("POST", "/auth", body={"type": "normal", "username": username, "password": password})["auth_token"]
    project = request("GET", f"/projects/by_slug?slug={slug}", token)
    stories = request("GET", f"/userstories?project={project['id']}", token, headers=no_pagination)
    tasks = request("GET", f"/tasks?project={project['id']}", token, headers=no_pagination)

    items = [("userstories", story) for story in stories] + [("tasks", task) for task in tasks]
    by_ref = {item["ref"]: item for _, item in items}
    endpoint = {item["ref"]: kind for kind, item in items}

    unblockable, dangling = find_unblockable([item for _, item in items], by_ref)

    for item, missing in dangling:
        print(f"#{item['ref']}: referències inexistents {missing}, es manté bloquejada")

    for item, blockers in unblockable:
        print(f"#{item['ref']} {item['subject']}: desbloquejada (resolts: {blockers})")
        if not DRY_RUN:
            request(
                "PATCH",
                f"/{endpoint[item['ref']]}/{item['id']}",
                token,
                body={"is_blocked": False, "blocked_note": "", "version": item["version"]},
            )

    print(f"Total desbloquejades: {len(unblockable)}{' (dry run)' if DRY_RUN else ''}")


if __name__ == "__main__":
    main()
