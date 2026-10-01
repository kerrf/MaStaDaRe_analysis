#!/usr/bin/env bash
#
# Switch the server back to the database from before the last deploy/push_db.sh: the live database and the previous one
# (mastr_prev) swap places, so running it again switches forward again. The backend stops for a few seconds.
#
#   ./deploy/rollback_db.sh
#
# No arguments. The server comes from deploy/server.env (see deploy/server.env.example).

set -Eeuo pipefail
cd "$(dirname "$0")/.."

die() { printf '\n\033[1;31mStopped: %s\033[0m\n' "$*" >&2; exit 1; }
[[ -f deploy/server.env ]] || die "deploy/server.env is missing: copy deploy/server.env.example and fill in the server."
# shellcheck source=/dev/null
source deploy/server.env
: "${SERVER:?SERVER is missing in deploy/server.env}" "${REMOTE_DIR:?REMOTE_DIR is missing in deploy/server.env}"

read -r -p "Swap the live database on $SERVER with the previous one? [j/N] " answer
[[ $answer == [jJyY] ]] || die "nothing changed."

ssh -o BatchMode=yes "$SERVER" "mkdir -p '$REMOTE_DIR/backups'"
rsync deploy/db_on_server.sh "$SERVER:$REMOTE_DIR/backups/"
ssh -n -o BatchMode=yes "$SERVER" "ACTION=rollback REMOTE_DIR='$REMOTE_DIR' bash '$REMOTE_DIR/backups/db_on_server.sh'"
if [[ -n ${API_URL:-} ]]; then
  printf '    Datenstand now: %s\n' "$(curl -fsS --max-time 10 "$API_URL/meta/datenstand" || echo '?')"
fi
