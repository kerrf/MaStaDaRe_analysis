#!/usr/bin/env bash
#
# Deploy the local database to the server:
#   1. count the rows of every table and dump the database (one consistent snapshot, compressed),
#   2. upload the dump (resumable) and check that it arrived unchanged,
#   3. on the server, restore it into a new database next to the live one and check the row counts,
#   4. switch: the new database goes live, the old one stays as mastr_prev (deploy/rollback_db.sh switches back).
# The website keeps running on the old data until the switch, which takes a few seconds.
#
#   ./deploy/push_db.sh
#
# No arguments. The server comes from deploy/server.env (see deploy/server.env.example).

set -Eeuo pipefail
cd "$(dirname "$0")/.."

LOCAL_CONTAINER=mastr_db
REMOTE_CONTAINER=mastr_db
DB=mastr
DB_USER=mastr
# Not deployed: stg is the old staging copy of the solar units (1.1 GB), which the website doesn't use
EXCLUDE_SCHEMAS=(stg)
WORK_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/mastr-deploy"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die() { printf '\n\033[1;31mStopped: %s\033[0m\n' "$*" >&2; exit 1; }
trap 'die "error in line $LINENO (see above). The server keeps running as it was."' ERR

[[ -f deploy/server.env ]] || die "deploy/server.env is missing: copy deploy/server.env.example and fill in the server."
# shellcheck source=/dev/null
source deploy/server.env
: "${SERVER:?SERVER is missing in deploy/server.env}" "${REMOTE_DIR:?REMOTE_DIR is missing in deploy/server.env}"

local_psql() { docker exec -i "$LOCAL_CONTAINER" psql -U "$DB_USER" -d "$DB" -v ON_ERROR_STOP=1 -tA "$@"; }
# -n: nothing on the server reads from this terminal
remote() { ssh -n -o BatchMode=yes "$SERVER" "$@"; }
started=$SECONDS

# ------------------------------------------------------------------------------------------------------ 1. checks
step "Checks"
docker exec "$LOCAL_CONTAINER" pg_isready -U "$DB_USER" -d "$DB" -q || die "the local database ($LOCAL_CONTAINER) isn't running."
# An update or a view rebuild still writing: the dump would be consistent, but maybe not what you want to deploy
busy=$(local_psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle'")
[[ $busy == 0 ]] || die "something is still running in the local database (an update or a view rebuild?). Let it finish first."
remote true || die "no ssh access to $SERVER."
remote "systemctl is-active --quiet mastr-update.service" && die "the nightly update is running on the server. Try again when it's done."

# The dump has to come from the server's major version: an older pg_restore can't read the files of a newer pg_dump
server_major=$(remote "docker exec $REMOTE_CONTAINER psql -U $DB_USER -d $DB -tAc 'SHOW server_version_num'" | cut -c1-2)
local_major=$(local_psql -c "SHOW server_version_num" | cut -c1-2)
(( local_major <= server_major )) || die "PostgreSQL $local_major here, $server_major on the server: the server has to be at least as new."
PG_BIN="/usr/lib/postgresql/$server_major/bin"
docker exec "$LOCAL_CONTAINER" test -x "$PG_BIN/pg_dump" || die "the server runs PostgreSQL $server_major, its pg_dump is missing here ($PG_BIN)."
info "PostgreSQL $local_major here, $server_major on $SERVER ($REMOTE_DIR)"

excluded=$(IFS=,; echo "${EXCLUDE_SCHEMAS[*]}")
db_bytes=$(local_psql -c "SELECT pg_database_size(current_database()) - coalesce((SELECT sum(pg_total_relation_size(c.oid))
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = ANY(string_to_array('$excluded', ','))), 0)")
info "Database to deploy: $(numfmt --to=iec "$db_bytes") (without ${EXCLUDE_SCHEMAS[*]})"

# ---------------------------------------------------------------------------------------------- 2. count and dump
name="mastr-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$WORK_DIR"
dump="$WORK_DIR/$name.dump"
counts="$WORK_DIR/$name.counts"

step "Counting rows"
local_psql -F $'\t' -v excluded="$excluded" < deploy/count_rows.sql > "$counts"
info "$(wc -l < "$counts") tables and views, $(awk -F'\t' '$2 == "table" { n += $3 } END { print n }' "$counts") rows in the tables"

step "Dumping (custom format, zstd)"
exclude_args=()
for schema in "${EXCLUDE_SCHEMAS[@]}"; do exclude_args+=(--exclude-schema="$schema"); done
# One transaction, i.e. a consistent snapshot; owners and grants are the server's business
docker exec "$LOCAL_CONTAINER" "$PG_BIN/pg_dump" -U "$DB_USER" -d "$DB" --format=custom --compress=zstd:6 \
  --no-owner --no-privileges "${exclude_args[@]}" > "$dump.partial"
mv "$dump.partial" "$dump"
checksum=$(sha256sum "$dump" | cut -d' ' -f1)
info "$(numfmt --to=iec "$(stat -c %s "$dump")") after $(( SECONDS - started )) s · sha256 ${checksum:0:16}…"

# ----------------------------------------------------------------------------------------------------- 3. upload
step "Uploading"
remote "mkdir -p '$REMOTE_DIR/backups'"
for attempt in 1 2 3; do
  # --partial: an interrupted upload continues where it stopped
  rsync --partial --info=progress2 "$dump" "$counts" deploy/count_rows.sql deploy/db_on_server.sh "$SERVER:$REMOTE_DIR/backups/" && break
  (( attempt < 3 )) || die "the upload failed three times."
  info "Upload interrupted, trying again in 10 s …"
  sleep 10
done
remote "echo '$checksum  $REMOTE_DIR/backups/$name.dump' | sha256sum --check --quiet" || die "the dump didn't arrive unchanged."
info "Checksum matches"

# ---------------------------------------------------------------------------------- 4. restore and switch (server)
step "Restoring on the server"
remote "ACTION=restore NAME='$name' REMOTE_DIR='$REMOTE_DIR' DB_BYTES='$db_bytes' EXCLUDED='$excluded' bash '$REMOTE_DIR/backups/db_on_server.sh'"

# ------------------------------------------------------------------------------------------------------- 5. check
if [[ -n ${API_URL:-} ]]; then
  step "Checking the public API"
  for attempt in 1 2 3 4 5 6; do
    curl -fsS --max-time 10 "$API_URL/health" > /dev/null && break
    (( attempt < 6 )) || die "$API_URL doesn't answer. Back to the old database: ./deploy/rollback_db.sh"
    sleep 5
  done
  info "$API_URL/health answers · Datenstand: $(curl -fsS --max-time 10 "$API_URL/meta/datenstand" || echo '?')"
fi

rm -f "$dump" # the counts stay, as a record of what was deployed
trap - ERR
step "Done in $(( (SECONDS - started) / 60 )) min $(( (SECONDS - started) % 60 )) s"
info "The old database stays on the server as mastr_prev: ./deploy/rollback_db.sh switches back to it."
info "The next nightly update fetches every change since the state of this database."
