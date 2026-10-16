#!/usr/bin/env bash
# Afegeix la clau pública SSH d'un company a la VM de Virtech (authorized_keys).
#
# Ús:  infra/scripts/add-team-key.sh
# Demana el nom del company i la seva clau PÚBLICA (una línia "ssh-ed25519 AAAA...").
#
# Necessites accés SSH amb clau a la VM (la teva clau ja ha d'estar a authorized_keys).
# Aquest script no conté cap secret: només host, port i usuari, que no ho són.
#
# Variables opcionals:
#   PERSEIDA_SSH_HOST  (per defecte nattech.fib.upc.edu; pot ser un alias de ~/.ssh/config)
#   PERSEIDA_SSH_PORT  (per defecte 40439)
#   PERSEIDA_SSH_USER  (per defecte alumne)
#   PERSEIDA_SSH_KEY   (ruta a la teva clau privada; si no, la que triï ssh)

set -euo pipefail

HOST="${PERSEIDA_SSH_HOST:-nattech.fib.upc.edu}"
PORT="${PERSEIDA_SSH_PORT:-40439}"
USER_="${PERSEIDA_SSH_USER:-alumne}"

die() { echo "Error: $*" >&2; exit 1; }

read -r -p "Nom del company (només lletres, números, punts i guions): " name
[[ "$name" =~ ^[A-Za-z0-9._-]{1,32}$ ]] || die "nom no vàlid"

echo "Enganxa la clau PÚBLICA (la línia que comença per ssh-ed25519; mai la privada):"
read -r pubkey

# Mai acceptem una clau privada.
[[ "$pubkey" != *"PRIVATE KEY"* ]] || die "això sembla una clau PRIVADA; no la comparteixis. Passa només el fitxer .pub"

# Només tipus i còs en base64; el comentari i qualsevol opció del davant es descarten.
if [[ "$pubkey" =~ (^|[[:space:]])(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521))[[:space:]]+([A-Za-z0-9+/]+=*)([[:space:]]|$) ]]; then
  key_type="${BASH_REMATCH[2]}"
  key_body="${BASH_REMATCH[4]}"
else
  die "format no vàlid: s'espera 'ssh-ed25519 AAAA... comentari'"
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
printf '%s %s %s\n' "$key_type" "$key_body" "$name" > "$tmp"
info="$(ssh-keygen -l -f "$tmp" 2>/dev/null)" || die "la clau no és vàlida"
if [[ "$key_type" == "ssh-rsa" ]]; then
  bits="${info%% *}"
  [[ "$bits" -ge 3072 ]] || die "RSA de menys de 3072 bits no acceptada"
fi

line="$key_type $key_body $name-perseida"
echo
echo "S'afegirà a ${USER_}@${HOST}:${PORT}:"
echo "  $info"
echo "  nom: $name"
read -r -p "Confirmes? [s/N] " ok
[[ "$ok" =~ ^[sSyY]$ ]] || die "cancel·lat"

ssh_args=(-p "$PORT" -o BatchMode=yes -o PasswordAuthentication=no)
[[ -n "${PERSEIDA_SSH_KEY:-}" ]] && ssh_args+=(-i "$PERSEIDA_SSH_KEY" -o IdentitiesOnly=yes)

# La clau viatja per stdin, així no cal escapar res a la comanda remota.
printf '%s\n' "$line" | ssh "${ssh_args[@]}" "${USER_}@${HOST}" '
  set -e
  umask 077
  mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys
  chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
  read -r line
  body="$(printf "%s" "$line" | cut -d" " -f2)"
  if grep -qF -- "$body" ~/.ssh/authorized_keys; then
    echo "Aquesta clau ja hi era: cap canvi."
  else
    printf "%s\n" "$line" >> ~/.ssh/authorized_keys
    echo "Clau afegida."
  fi
'
