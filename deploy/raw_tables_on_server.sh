#!/usr/bin/env bash
#
# The server's part of deploy/push_raw_tables.sh, which uploads this file and runs it on the server (not meant to be
# started by hand): replaces some raw tables of the live database with those of backups/$NAME.dump, while the website
# keeps running.
#   1. restore the dump into a database of its own, and move its tables into schema raw_next of the live database,
#   2. check their row counts against backups/$NAME.counts,
#   3. replace the tables in raw with them, in one transaction (raw_tables_swap.sql): the views built on them stay,
#   4. build the views that were missing for want of these tables (app/etl/transform.py, with the running image).
# Views that exist already get the new data with the next nightly update, which recomputes all of them.

set -Eeuo pipefail

: "${NAME:?}" "${REMOTE_DIR:?}" "${TABLES:?}"
CONTAINER=${CONTAINER:-mastr_db}
DB_USER=${DB_USER:-mastr}
LIVE=${LIVE:-mastr}
STAGE="${LIVE}_tables" # the dump restored on its own, before its tables move into the live database

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die() { printf '\n\033[1;31mStopped on the server: %s\033[0m\n' "$*" >&2; exit 1; }
trap 'die "error in line $LINENO (see above). The live tables are as they were."' ERR

cd "$REMOTE_DIR"
sql() { docker exec "$CONTAINER" psql -U "$DB_USER" -v ON_ERROR_STOP=1 -tAq "$@"; }
sql_in() { docker exec -i "$CONTAINER" psql -U "$DB_USER" -v ON_ERROR_STOP=1 -tAq "$@"; }
dump="backups/$NAME.dump"
[[ -f $dump && -f backups/$NAME.counts ]] || die "$dump or its counts are missing."

# What a run leaves behind, also when it stops halfway (after the switch raw_next is gone already)
cleanup() {
  docker exec "$CONTAINER" rm -f "/tmp/$NAME.dump" || true
  sql -d postgres -c "DROP DATABASE IF EXISTS \"$STAGE\" WITH (FORCE)" || true
  sql -d "$LIVE" -c "DROP SCHEMA IF EXISTS raw_next CASCADE" || true
}
trap cleanup EXIT

# ------------------------------------------------------------------------------------------------------- checks
step "Checks"
# The tables three times (restored on their own, in raw_next, in raw) and the dump inside the container
root=$(docker info --format '{{.DockerRootDir}}')
free=$(df -B1 --output=avail "$root" | tail -1)
need=$(( $(stat -c %s "$dump") * 25 ))
(( free > need )) || die "not enough disk space: $(numfmt --to=iec "$free") free, about $(numfmt --to=iec "$need") needed."
info "$(numfmt --to=iec "$free") free, about $(numfmt --to=iec "$need") needed"
bin="/usr/lib/postgresql/$(sql -d postgres -c "SHOW server_version_num" | cut -c1-2)/bin"
docker exec "$CONTAINER" test -x "$bin/pg_restore" || bin=""
pg() { docker exec -i "$CONTAINER" "${bin:+$bin/}$1" -U "$DB_USER" "${@:2}"; }

# ------------------------------------------------------------------------------------------------------ restore
step "Restoring the tables"
sql -d postgres -c "DROP DATABASE IF EXISTS \"$STAGE\" WITH (FORCE)" # left over from an aborted run
sql -d postgres -c "CREATE DATABASE \"$STAGE\" TEMPLATE template0"
# A dump of single tables doesn't create their schema
sql -d "$STAGE" -c "CREATE SCHEMA raw"
docker cp "$dump" "$CONTAINER:/tmp/$NAME.dump"
started=$SECONDS
pg pg_restore -d "$STAGE" --no-owner --no-privileges --exit-on-error "/tmp/$NAME.dump"
# Into the live database under another schema: raw stays untouched until the switch
sql -d "$STAGE" -c "ALTER SCHEMA raw RENAME TO raw_next"
sql -d "$LIVE" -c "DROP SCHEMA IF EXISTS raw_next CASCADE"
pg pg_dump -d "$STAGE" --format=custom --schema=raw_next | pg pg_restore -d "$LIVE" --no-owner --no-privileges --exit-on-error
info "Restored in $(( SECONDS - started )) s"

step "Checking the row counts"
while IFS=$'\t' read -r table want; do
  have=$(sql -d "$LIVE" -c "SELECT count(*) FROM raw_next.\"$table\"")
  [[ $have == "$want" ]] || die "raw_next.$table has $have rows, $want were uploaded. The live tables are as they were."
  info "$table: $(numfmt --grouping "$have") rows"
done < "backups/$NAME.counts"

# -------------------------------------------------------------------------------------------------------- switch
step "Replacing the tables"
started=$SECONDS
sql_in -d "$LIVE" --single-transaction -v tables="$TABLES" < backups/raw_tables_swap.sql
for table in ${TABLES//,/ }; do
  sql -d "$LIVE" -c "ANALYZE raw.\"$table\""
done
info "Replaced in $(( SECONDS - started )) s"
rm -f "$dump"

# --------------------------------------------------------------------------------------------------------- views
step "Building the views that were missing (transform.py, a few minutes)"
docker compose run --rm --no-deps backend python -m app.etl.transform < /dev/null
info "Views that existed already get the new data with the next nightly update."
