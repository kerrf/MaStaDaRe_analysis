#!/usr/bin/env bash
#
# Put the tables on the server that came after the first bulk export and that it doesn't have yet: the Netzanschlusspunkte,
# the grid operators, the units of the other technologies and their EEG and KWK plants (TABLES of
# backend/app/etl/export_tables.py, which can load them here from the newest export; db_migrate from the export on
# disk). The nightly update keeps them current once they are there. The tables the server has stay as they are: they
# are newer than these. Not the whole database (deploy/push_db.sh): the rest stays as the nightly update keeps it.
#   1. ask the server which of the tables it lacks, count their rows here and dump them (compressed),
#   2. upload the dump (resumable) and check that it arrived unchanged,
#   3. on the server, restore them next to the live tables, check the row counts and replace the live ones in one
#      transaction (deploy/raw_tables_on_server.sh); then build the views that were missing for want of them.
# The website keeps running all the while.
#
#   ./deploy/push_raw_tables.sh
#
# No arguments. The server comes from deploy/server.env (see deploy/server.env.example).

set -Eeuo pipefail
cd "$(dirname "$0")/.."

LOCAL_CONTAINER=mastr_db
REMOTE_CONTAINER=mastr_db
DB=mastr
DB_USER=mastr
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
# Which tables: export_tables.py names them, of them the ones the server doesn't have
all_tables=$(cd backend && uv run --quiet python -c 'from app.etl.export_tables import TABLES; print(",".join(TABLES))')
[[ -n $all_tables ]] || die "no tables to upload (backend/app/etl/export_tables.py)."
docker exec "$LOCAL_CONTAINER" pg_isready -U "$DB_USER" -d "$DB" -q || die "the local database ($LOCAL_CONTAINER) isn't running."
busy=$(local_psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle'")
[[ $busy == 0 ]] || die "something is still running in the local database (a reload or a view rebuild?). Let it finish first."
remote true || die "no ssh access to $SERVER."
remote "systemctl is-active --quiet mastr-update.service" && die "the nightly update is running on the server. Try again when it's done."
tables=$(remote "docker exec $REMOTE_CONTAINER psql -U $DB_USER -d $DB -tAc \"SELECT string_agg(t, ',' ORDER BY n) FROM unnest(string_to_array('$all_tables', ',')) WITH ORDINALITY AS a(t, n) WHERE to_regclass('raw.' || t) IS NULL\"")
for table in ${all_tables//,/ }; do
  [[ ,$tables, == *,$table,* ]] || info "raw.$table: on the server already, stays as it is"
done
if [[ -z $tables ]]; then
  step "Nothing to upload: the server has every table (the nightly update keeps them current)"
  exit 0
fi
for table in ${tables//,/ }; do
  [[ $(local_psql -c "SELECT to_regclass('raw.$table') IS NOT NULL") == t ]] ||
    die "raw.$table isn't in the local database: load it first (cd backend && uv run python -m app.etl.db_migrate)."
  info "raw.$table, to upload: $(local_psql -c "SELECT coalesce(obj_description('raw.$table'::regclass, 'pg_class'), 'export unknown')")"
done

# The dump has to come from the server's major version: an older pg_restore can't read the files of a newer pg_dump
server_major=$(remote "docker exec $REMOTE_CONTAINER psql -U $DB_USER -d $DB -tAc 'SHOW server_version_num'" | cut -c1-2)
local_major=$(local_psql -c "SHOW server_version_num" | cut -c1-2)
(( local_major <= server_major )) || die "PostgreSQL $local_major here, $server_major on the server: the server has to be at least as new."
PG_BIN="/usr/lib/postgresql/$server_major/bin"
docker exec "$LOCAL_CONTAINER" test -x "$PG_BIN/pg_dump" || die "the server runs PostgreSQL $server_major, its pg_dump is missing here ($PG_BIN)."
info "PostgreSQL $local_major here, $server_major on $SERVER ($REMOTE_DIR)"

# ---------------------------------------------------------------------------------------------- 2. count and dump
name="raw-tables-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$WORK_DIR"
dump="$WORK_DIR/$name.dump"
counts="$WORK_DIR/$name.counts"

step "Counting rows"
for table in ${tables//,/ }; do
  printf '%s\t%s\n' "$table" "$(local_psql -c "SELECT count(*) FROM raw.\"$table\"")"
done > "$counts"
while IFS=$'\t' read -r table rows; do info "raw.$table: $(numfmt --grouping "$rows") rows"; done < "$counts"

step "Dumping (custom format, zstd)"
table_args=()
for table in ${tables//,/ }; do table_args+=(--table="raw.$table"); done
# One transaction, i.e. a consistent snapshot; with each table its key and comment; owners and grants are the server's
docker exec "$LOCAL_CONTAINER" "$PG_BIN/pg_dump" -U "$DB_USER" -d "$DB" --format=custom --compress=zstd:6 \
  --no-owner --no-privileges "${table_args[@]}" > "$dump.partial"
mv "$dump.partial" "$dump"
checksum=$(sha256sum "$dump" | cut -d' ' -f1)
info "$(numfmt --to=iec "$(stat -c %s "$dump")") after $(( SECONDS - started )) s · sha256 ${checksum:0:16}…"

# ----------------------------------------------------------------------------------------------------- 3. upload
step "Uploading"
remote "mkdir -p '$REMOTE_DIR/backups'"
for attempt in 1 2 3; do
  # --partial: an interrupted upload continues where it stopped
  rsync --partial --info=progress2 "$dump" "$counts" deploy/raw_tables_swap.sql deploy/raw_tables_on_server.sh \
    "$SERVER:$REMOTE_DIR/backups/" && break
  (( attempt < 3 )) || die "the upload failed three times."
  info "Upload interrupted, trying again in 10 s …"
  sleep 10
done
remote "echo '$checksum  $REMOTE_DIR/backups/$name.dump' | sha256sum --check --quiet" || die "the dump didn't arrive unchanged."
info "Checksum matches"

# ------------------------------------------------------------------------------------- 4. replace (on the server)
remote "NAME='$name' REMOTE_DIR='$REMOTE_DIR' TABLES='$tables' bash '$REMOTE_DIR/backups/raw_tables_on_server.sh'"

# ------------------------------------------------------------------------------------------------------- 5. check
if [[ -n ${API_URL:-} ]]; then
  step "Checking the public API"
  status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "$API_URL/netz/ebenen?region=DE" || true)
  [[ $status == 200 ]] || die "$API_URL/netz/ebenen answers $status: see the view build above."
  info "$API_URL/netz/ebenen answers"
fi

rm -f "$dump" # the counts stay, as a record of what was uploaded
trap - ERR
step "Done in $(( (SECONDS - started) / 60 )) min $(( (SECONDS - started) % 60 )) s"
