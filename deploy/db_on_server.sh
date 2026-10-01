#!/usr/bin/env bash
#
# The server's part of deploy/push_db.sh and deploy/rollback_db.sh, which upload this file and run it on the server
# (not meant to be started by hand). ACTION says what to do:
#
#   restore   restore backups/$NAME.dump into a new database next to the live one, check its row counts against
#             backups/$NAME.counts, then switch: the new database goes live, the old one becomes the previous one.
#   rollback  swap the live and the previous database (a second rollback swaps them back).
#
# The website keeps running on the live database until the switch; for the switch itself the backend stops for a few
# seconds, since a database can only be renamed without connections.

set -Eeuo pipefail

: "${ACTION:?}" "${REMOTE_DIR:?}"
CONTAINER=${CONTAINER:-mastr_db}
DB_USER=${DB_USER:-mastr}
LIVE=${LIVE:-mastr}       # the database the backend uses
NEXT="${LIVE}_next"       # a new one, restored next to it
PREV="${LIVE}_prev"       # the one before the last switch, for a rollback
BACKEND=${BACKEND-backend} # the compose service using the database; empty: none

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die() { printf '\n\033[1;31mStopped on the server: %s\033[0m\n' "$*" >&2; exit 1; }
trap 'die "error in line $LINENO (see above)."' ERR

cd "$REMOTE_DIR"
# psql in the database container: sql for commands, sql_in to read from a pipe or file
sql() { docker exec "$CONTAINER" psql -U "$DB_USER" -v ON_ERROR_STOP=1 -tAq "$@"; }
sql_in() { docker exec -i "$CONTAINER" psql -U "$DB_USER" -v ON_ERROR_STOP=1 -tAq "$@"; }
exists() { [[ $(sql -d postgres -c "SELECT count(*) FROM pg_database WHERE datname = '$1'") == 1 ]]; }

backend() {
  [[ -n $BACKEND ]] || return 0
  docker compose "$1" "$BACKEND" < /dev/null
}

# Rename databases while nothing is connected: stops the backend, disconnects the rest, restarts the backend afterwards.
# $@: "old new" pairs, renamed in this order. If a rename fails, the live database is put back before anything else.
switch() {
  backend stop
  trap 'recover; die "the switch failed (see above), the live database is back in place."' ERR
  sql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
                      WHERE datname IN ('$LIVE', '$NEXT', '$PREV') AND pid <> pg_backend_pid()" > /dev/null
  while (( $# )); do
    sql -d postgres -c "ALTER DATABASE \"$1\" RENAME TO \"$2\""
    shift 2
  done
  trap 'die "error in line $LINENO (see above)."' ERR
  backend start
}

recover() {
  if ! exists "$LIVE"; then
    for candidate in "${LIVE}_swap" "$PREV"; do
      if exists "$candidate"; then sql -d postgres -c "ALTER DATABASE \"$candidate\" RENAME TO \"$LIVE\""; break; fi
    done
  fi
  backend start || true
}

# ------------------------------------------------------------------------------------------------------ rollback
if [[ $ACTION == rollback ]]; then
  exists "$PREV" || die "there is no previous database ($PREV) to switch back to."
  step "Swapping $LIVE and $PREV"
  switch "$LIVE" "${LIVE}_swap" "$PREV" "$LIVE" "${LIVE}_swap" "$PREV"
  info "$LIVE is now the database from before the last switch, $PREV the one that was live."
  exit 0
fi

[[ $ACTION == restore ]] || die "unknown ACTION '$ACTION'."
: "${NAME:?}" "${DB_BYTES:?}"
EXCLUDED=${EXCLUDED:-}
dump="backups/$NAME.dump"
[[ -f $dump && -f backups/$NAME.counts ]] || die "$dump or its counts are missing."

# ------------------------------------------------------------------------------------------------------- checks
step "Checks"
# Room for the new database next to the live one, plus the dump inside the container
root=$(docker info --format '{{.DockerRootDir}}')
free=$(df -B1 --output=avail "$root" | tail -1)
need=$(( DB_BYTES * 13 / 10 + $(stat -c %s "$dump") ))
(( free > need )) || die "not enough disk space: $(numfmt --to=iec "$free") free, about $(numfmt --to=iec "$need") needed."
info "$(numfmt --to=iec "$free") free, about $(numfmt --to=iec "$need") needed"
jobs=$(docker exec "$CONTAINER" nproc)
# The tools of the server's own major version (an image may also carry newer clients, which send settings it doesn't know)
bin="/usr/lib/postgresql/$(sql -d postgres -c "SHOW server_version_num" | cut -c1-2)/bin"
docker exec "$CONTAINER" test -x "$bin/pg_restore" || bin=""

# ------------------------------------------------------------------------------------------------------ restore
step "Restoring into $NEXT ($jobs parallel jobs)"
if exists "$PREV"; then
  info "Dropping $PREV (the database before the last deploy)"
  sql -d postgres -c "DROP DATABASE \"$PREV\" WITH (FORCE)"
fi
sql -d postgres -c "DROP DATABASE IF EXISTS \"$NEXT\" WITH (FORCE)" # left over from an aborted run
sql -d postgres -c "CREATE DATABASE \"$NEXT\" TEMPLATE template0"
docker cp "$dump" "$CONTAINER:/tmp/$NAME.dump"
cleanup() { docker exec "$CONTAINER" rm -f "/tmp/$NAME.dump" || true; }
trap cleanup EXIT
started=$SECONDS
# Tables, then indexes and the materialized views (computed anew), several at a time
docker exec "$CONTAINER" "${bin:+$bin/}pg_restore" -U "$DB_USER" -d "$NEXT" --jobs="$jobs" --no-owner --no-privileges \
  --exit-on-error "/tmp/$NAME.dump"
info "Restored in $(( SECONDS - started )) s"
# A restore brings no planner statistics: without them the first queries would be slow
docker exec "$CONTAINER" "${bin:+$bin/}vacuumdb" -U "$DB_USER" -d "$NEXT" --analyze-only --jobs="$jobs" --quiet
info "Statistics collected"

# The update history (meta.update_runs) is the server's: the Datenstand the website shows. Carry it over.
if [[ $(sql -d "$LIVE" -c "SELECT to_regclass('meta.update_runs') IS NOT NULL") == t ]]; then
  sql -d "$LIVE" -c "\copy meta.update_runs TO STDOUT" | sql_in -d "$NEXT" \
    -c "CREATE SCHEMA IF NOT EXISTS meta" \
    -c "CREATE TABLE IF NOT EXISTS meta.update_runs (finished_at timestamptz PRIMARY KEY DEFAULT now(), datenstand date NOT NULL)" \
    -c "CREATE TEMP TABLE runs (LIKE meta.update_runs)" \
    -c "\copy runs FROM pstdin" \
    -c "INSERT INTO meta.update_runs SELECT * FROM runs ON CONFLICT DO NOTHING"
  info "Update history carried over"
fi

# ------------------------------------------------------------------------------------------------------- verify
step "Checking the row counts"
sql_in -d "$NEXT" -F $'\t' -v excluded="$EXCLUDED" < backups/count_rows.sql > "backups/$NAME.restored"
# Tables have to match exactly; materialized views are computed anew and may depend on the day (last 12 months)
report=$(awk -F'\t' 'NR == FNR { want[$1] = $3; kind[$1] = $2; next } { have[$1] = $3 }
  END {
    for (r in want) {
      if (!(r in have)) print kind[r] "\tmissing\t" r
      else if (have[r] != want[r]) print kind[r] "\tdiffers\t" r " (" want[r] " here, " have[r] " restored)"
    }
  }' "backups/$NAME.counts" "backups/$NAME.restored")
if grep -q $'^table\t' <<< "$report"; then
  grep $'^table\t' <<< "$report" | cut -f2- | sed 's/^/    /'
  die "the restored tables differ from the local ones. $LIVE stays live; $NEXT is left for a look."
fi
if [[ -n $report ]]; then
  cut -f2- <<< "$report" | sed 's/^/    view /'
fi
info "$(wc -l < "backups/$NAME.counts") tables and views, all tables complete"

# ------------------------------------------------------------------------------------------------------- switch
step "Switching"
switch "$LIVE" "$PREV" "$NEXT" "$LIVE"
info "$LIVE is live, the database before stays as $PREV"
rm -f "$dump"
