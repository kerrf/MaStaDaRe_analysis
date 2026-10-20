#!/usr/bin/env bash
#
# Goes back to the backend version that ran before the last deploy: its commit (compose.yml, Caddyfile, ...) and its
# image, both noted by deploy/deploy_backend.sh. The pipeline runs it when a new version fails its health check or the
# smoke test; you can run it yourself on the server too:
#
#   /opt/mastr/deploy/rollback_backend.sh
#
# No arguments. Once more goes nowhere: it is a step back from the last deploy, not through all of them. To go back
# further, re-run the pipeline of an older commit on GitHub (Actions → the run → "Re-run all jobs").
# The database stays as it is (that has deploy/rollback_db.sh).

set -Eeuo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mStopped: %s\033[0m\n' "$*" >&2; exit 1; }
trap 'die "error in line $LINENO (see above)."' ERR

# As in deploy/deploy_backend.sh: until the backend answers /health, at most 2 minutes
backend_healthy() {
  local status
  for _ in {1..60}; do
    status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck-{{.State.Status}}{{end}}' mastr_backend 2> /dev/null || true)
    case $status in
      # A backend from before the healthcheck (compose.yml) can only say it runs
      healthy | no-healthcheck-running) return 0 ;;
      unhealthy | no-healthcheck-exited | no-healthcheck-dead) return 1 ;;
    esac
    sleep 2
  done
  return 1
}

git rev-parse --quiet --verify refs/deploy/previous > /dev/null || die "no earlier deploy noted: nothing to go back to"
docker image inspect mastr-api:previous > /dev/null 2>&1 || die "the image of the earlier version is gone: nothing to go back to"

# The raw tables hold texts instead of catalog codes since app/etl/decode_codes.py; a version from before reads and writes
# codes: its views would come out empty, its nightly update would write codes into the tables again. Going back that far
# is possible, but without the nightly update (a deploy of a version with the texts switches it on again).
if ! git cat-file -e "refs/deploy/previous:backend/app/etl/decode_codes.py" 2> /dev/null; then
  step "The earlier version reads catalog codes, the tables hold texts: its nightly update stays off"
  if [[ $EUID == 0 ]]; then
    systemctl disable --now --quiet mastr-update.timer 2> /dev/null || true
  fi
fi

step "Going back to $(git rev-parse --short refs/deploy/previous)"
git reset --quiet --hard refs/deploy/previous
docker tag mastr-api:previous mastr-api:live
docker compose up --detach --no-build backend < /dev/null
# Caddy too, in case its Caddyfile was part of the change
docker compose up --detach --no-build --force-recreate caddy < /dev/null
backend_healthy || die "the earlier version doesn't come up healthy either: look at 'docker compose logs backend' (the database?)"
step "Live again: $(git rev-parse --short HEAD)"
