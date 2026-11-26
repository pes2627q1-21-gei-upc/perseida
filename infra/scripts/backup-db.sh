#!/bin/sh
# Còpia de la base de dades abans de migrar, amb rotació (TG-386).
#
# S'executa al servidor, a `/opt/perseida`, abans que el desplegament apliqui
# migracions. Ús:
#
#     ./backup-db.sh --if-pending <head> <git-sha>   còpia només si hi ha migracions pendents
#     ./backup-db.sh --always <git-sha>              còpia sempre, sense comprovar
#
# `<head>` és la revisió d'Alembic que porta la imatge nova; `<git-sha>` arriba sense
# el prefix `sha-`. La revisió actual es llegeix de `alembic_version` dins del
# contenidor `db`, amb les credencials del seu entorn (mai per arguments ni sortida).
# Si no hi ha contenidor `db` en marxa o la taula `alembic_version` no existeix
# (base de dades buida, primer desplegament), s'avisa i no es fa cap còpia (surt amb 0).
# Qualsevol altre error en llegir-la (psql no s'executa, connexió, recuperació, auth)
# fa fallar el script (sortida != 0) perquè el desplegament no migri sense còpia.
#
# La còpia (`pg_dump -Fc`) s'escriu a un fitxer temporal, es verifica
# (`pg_restore --list`) i només llavors agafa el nom definitiu
# `perseida-<AAAAMMDDTHHMMSSZ UTC>-<git-sha>-<revisió>.dump`. Després es conserven
# les `BACKUP_KEEP` (5 per defecte) més recents i s'esborra la resta. Una còpia
# fallida surt amb error, esborra el temporal i no toca les còpies bones.
#
# `BACKUP_DIR` (per defecte `$HOME/perseida/backups`) ha de ser fora del volum de dades
# de PostgreSQL. No s'imprimeix mai cap contrasenya ni contingut del dump: els logs
# del workflow són públics.
set -eu

say() { printf '%s\n' "$*" || true; }
warn() { printf '%s\n' "$*" >&2 || true; }

usage() {
  warn "Ús: $0 --if-pending <head> <git-sha> | --always <git-sha>"
  exit 2
}

mode=${1:-}
case "$mode" in
  --if-pending)
    [ "$#" -eq 3 ] || usage
    head=$2
    sha=$3
    ;;
  --always)
    [ "$#" -eq 2 ] || usage
    head=""
    sha=$2
    ;;
  *) usage ;;
esac

BACKUP_DIR=${BACKUP_DIR:-$HOME/perseida/backups}
BACKUP_KEEP=${BACKUP_KEEP:-5}

case "$BACKUP_KEEP" in
  '' | *[!0-9]*)
    warn "BACKUP_KEEP ha de ser un enter >= 1 (valor rebut: '$BACKUP_KEEP')."
    exit 1
    ;;
esac
if [ "$BACKUP_KEEP" -lt 1 ]; then
  warn "BACKUP_KEEP ha de ser un enter >= 1 (valor rebut: '$BACKUP_KEEP')."
  exit 1
fi

if [ -z "$(docker compose ps -q db 2>/dev/null)" ]; then
  warn "AVÍS: el contenidor db no està en marxa; no es fa cap còpia."
  exit 0
fi

# Credencials de l'entorn del contenidor: l'únic `$` entre cometes simples s'expandeix allà.
# Primer es mira si la taula existeix: un error de psql (connexió, recuperació, auth...) NO és
# una base de dades buida i atura el desplegament (sortida != 0); no se'n mostra el text, que
# podria portar secrets.
table=$(docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select to_regclass('"'"'public.alembic_version'"'"')"' 2>/dev/null) && rc=0 || rc=$?
if [ "$rc" -ne 0 ]; then
  warn "ERROR: no es pot consultar la base de dades (psql ha sortit amb codi $rc); no es pot fer la còpia i no s'ha de migrar."
  exit 1
fi
table=$(printf '%s' "$table" | tr -d '[:space:]')
if [ -z "$table" ]; then
  warn "AVÍS: la taula alembic_version no existeix (base de dades buida, primer desplegament); no es fa cap còpia."
  exit 0
fi

revision=$(docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select version_num from alembic_version"' 2>/dev/null) && rc=0 || rc=$?
if [ "$rc" -ne 0 ]; then
  warn "ERROR: no es pot llegir la revisió d'Alembic (psql ha sortit amb codi $rc); no es pot fer la còpia i no s'ha de migrar."
  exit 1
fi
revision=$(printf '%s' "$revision" | tr -d '[:space:]')
if [ -z "$revision" ]; then
  warn "AVÍS: alembic_version és buida (cap migració aplicada); no es fa cap còpia."
  exit 0
fi

if [ "$mode" = "--if-pending" ] && [ "$revision" = "$head" ]; then
  say "La base de dades ja és a la revisió $head: sense migracions pendents, còpia omesa."
  exit 0
fi

umask 077
if ! mkdir -p "$BACKUP_DIR"; then
  warn "ERROR: no es pot crear el directori de còpies $BACKUP_DIR."
  exit 1
fi

tmp=$(mktemp "$BACKUP_DIR/.perseida-tmp.XXXXXX") || {
  warn "ERROR: no es pot escriure a $BACKUP_DIR."
  exit 1
}
trap 'rm -f "$tmp"' EXIT

say "Fent la còpia de la base de dades (revisió $revision)..."
if ! docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$tmp"; then
  warn "ERROR: pg_dump ha fallat (o no hi ha prou espai); no s'ha creat cap còpia."
  exit 1
fi
if [ ! -s "$tmp" ]; then
  warn "ERROR: la còpia és buida; no s'ha creat cap còpia."
  exit 1
fi
if ! docker compose exec -T db pg_restore --list < "$tmp" >/dev/null; then
  warn "ERROR: la còpia no és un arxiu vàlid (pg_restore --list ha fallat); no s'ha creat cap còpia."
  exit 1
fi

final="$BACKUP_DIR/perseida-$(date -u +%Y%m%dT%H%M%SZ)-$sha-$revision.dump"
if ! mv "$tmp" "$final"; then
  warn "ERROR: no s'ha pogut desar la còpia a $final."
  exit 1
fi
say "Còpia feta: $(basename "$final")"

# Rotació: només després d'una còpia bona. Els noms porten la data UTC al davant.
old=$(cd "$BACKUP_DIR" && ls -1 perseida-*.dump | LC_ALL=C sort -r | tail -n +"$((BACKUP_KEEP + 1))") || old=""
for name in $old; do
  rm -f "$BACKUP_DIR/$name"
  say "Còpia antiga esborrada: $name"
done
