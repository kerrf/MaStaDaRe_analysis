#!/usr/bin/env bash
#
# Puts a new backend version live on the server. The pipeline runs it (.github/workflows/pipeline.yml, job "Deploy
# backend") in the repo folder on the server, with SHA (the commit) and IMAGE (where the pipeline stored the image of
# that commit) set:
#   1. pull the image of the commit from ghcr.io (the pipeline logged the server in for this run),
#   2. note the way back: the commit and the image running now (deploy/rollback_backend.sh uses them),
#   3. the repo files on the server (compose.yml, Caddyfile, deploy/) to the commit,
#   4. build the views the new version needs, with its image (app/etl/transform.py: new views, and those whose SQL
#      changed; the old version keeps answering meanwhile). Fails: the files go back, the old version keeps running,
#   5. start the new image and wait until the backend answers /health (compose.yml), else go back,
#   6. set up the nightly update (deploy/mastr-update.service and .timer), so it can't be missing.
# The data stays as it is: it comes with the nightly update (and deploy/push_db.sh for a new bulk export).

set -Eeuo pipefail

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die() { printf '\n\033[1;31mStopped: %s\033[0m\n' "$*" >&2; exit 1; }

# Waits until the backend answers /health (its healthcheck in compose.yml), at most 2 minutes. Not `compose up --wait`:
# that one reports success when its time runs out while the container is still starting.
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

# The nightly update's units into systemd, when they differ from the installed ones (the repo folder replaces
# /opt/mastr), and its timer on. Needs root; the deploy goes on without it.
install_nightly_update() {
  [[ $EUID == 0 ]] || { info "not root: set up the nightly update by hand (DEPLOY.md, section 11)"; return 0; }
  local unit changed=0
  for unit in mastr-update.service mastr-update.timer; do
    sed "s|^WorkingDirectory=.*|WorkingDirectory=$PWD|" "deploy/$unit" > "/tmp/$unit" || return 1
    if ! cmp --silent "/tmp/$unit" "/etc/systemd/system/$unit"; then
      install --mode 644 "/tmp/$unit" "/etc/systemd/system/$unit" || return 1
      changed=1
    fi
    rm -f "/tmp/$unit"
  done
  if ((changed)); then
    systemctl daemon-reload || return 1
    info "nightly update: units installed"
  fi
  systemctl enable --now --quiet mastr-update.timer || return 1
  info "nightly update: next run $(systemctl show mastr-update.timer --property=NextElapseUSecRealtime --value)"
}

# All in a function: the pipeline sends this script through ssh on stdin, and bash then has it read completely before
# anything runs (a command reading stdin can't eat the rest of the script).
main() {
  : "${SHA:?run by the pipeline, which sets SHA}" "${IMAGE:?run by the pipeline, which sets IMAGE}"
  trap 'die "error in line $LINENO (see above). The backend keeps running as it was."' ERR

  [[ -z $(git status --porcelain --untracked-files=no) ]] ||
    die "files of the repo were changed by hand on the server (git status). Commit them in the repo, or undo them with 'git checkout -- .'"

  step "Pulling the image of ${SHA:0:7}"
  git fetch --quiet origin
  git cat-file -e "$SHA^{commit}" 2> /dev/null || die "commit $SHA not found on GitHub"
  docker pull --quiet "$IMAGE:$SHA" < /dev/null > /dev/null

  step "Noting the way back"
  git update-ref refs/deploy/previous HEAD
  local running
  running=$(docker inspect --format '{{.Image}}' mastr_backend 2> /dev/null || true)
  if [[ -n $running ]]; then
    docker tag "$running" mastr-api:previous
    info "now: $(git rev-parse --short HEAD), image ${running:7:12}"
  else
    info "no backend running yet: nothing to go back to"
  fi

  step "Building the views of ${SHA:0:7}"
  local caddyfile_before
  caddyfile_before=$(git rev-parse HEAD:Caddyfile)
  # The nightly update refreshes the views: building them beside it would hold up both
  if systemctl is-active --quiet mastr-update.service 2> /dev/null; then
    die "the nightly update is running. Run the pipeline again when it's done (Actions → Pipeline → Run workflow)"
  fi
  git reset --quiet --hard "$SHA"
  # With the new image and its SQL; the old backend keeps answering from the old views until each new one is ready
  if ! BACKEND_IMAGE="$IMAGE:$SHA" docker compose run --rm --no-deps backend python -m app.etl.transform < /dev/null; then
    git reset --quiet --hard refs/deploy/previous
    die "building the views failed (see above). The previous version keeps running; views built before the failure are new already (views only grow, it works with them)"
  fi

  step "Switching to ${SHA:0:7}"
  docker tag "$IMAGE:$SHA" mastr-api:live
  # Only the ghcr.io name goes, the image stays as mastr-api:live
  docker rmi "$IMAGE:$SHA" > /dev/null

  # Compose restarts the backend only if its image changed; Caddy reads its Caddyfile at start only
  docker compose up --detach --no-build backend caddy < /dev/null
  if ! backend_healthy; then
    docker compose logs --tail 40 backend < /dev/null || true
    step "The new backend didn't come up healthy: going back"
    bash deploy/rollback_backend.sh < /dev/null
    die "deploy of ${SHA:0:7} failed, the previous version runs again"
  fi
  if [[ $(git rev-parse HEAD:Caddyfile) != "$caddyfile_before" ]]; then
    info "Caddyfile changed: restarting Caddy"
    docker compose up --detach --no-build --force-recreate caddy < /dev/null
  fi

  # Keep two versions: live and previous. Older backend images have no name left and go (only ours, by their label).
  docker image prune --force --filter "label=org.opencontainers.image.source=https://github.com/kerrf/MaStaDaRe_analysis" > /dev/null

  step "Nightly update"
  install_nightly_update || info "could not set up the nightly update (see above); the new version is live anyway"
  step "Live: ${SHA:0:7}"
}

main
