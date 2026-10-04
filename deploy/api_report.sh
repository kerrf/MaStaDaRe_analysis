#!/usr/bin/env bash
#
# A report on who uses the API, from the server's access log (Caddy, see Caddyfile: kept 7 days there): visitors and
# requests per day and hour, their IP addresses, browsers and systems, the endpoints they call, status codes, slow
# requests, crawlers. GoAccess (in Docker, nothing to install) builds it as a web page, which opens in the browser.
#
#   ./deploy/api_report.sh
#
# No arguments. The server comes from deploy/server.env, like for push_db.sh. The logs and the report only go to a
# temporary folder of your session (they hold IP addresses: personal data, not to be kept longer than on the server).

set -Eeuo pipefail
cd "$(dirname "$0")/.."

GOACCESS_IMAGE=allinurl/goaccess:1.12

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die() { printf '\n\033[1;31mStopped: %s\033[0m\n' "$*" >&2; exit 1; }
trap 'die "error in line $LINENO (see above)."' ERR

work=$(mktemp -d "${XDG_RUNTIME_DIR:-/tmp}/mastr-api-report.XXXXXX")
mkdir -p "$work/logs"

# LOG_DIR: a folder with logs instead of the server's (for testing the report)
if [[ -n ${LOG_DIR:-} ]]; then
  cp "$LOG_DIR"/*.log* "$work/logs/"
else
  [[ -f deploy/server.env ]] || die "deploy/server.env is missing: copy deploy/server.env.example and fill in the server."
  # shellcheck source=/dev/null
  source deploy/server.env
  : "${SERVER:?SERVER is missing in deploy/server.env}" "${REMOTE_DIR:?REMOTE_DIR is missing in deploy/server.env}"
  step "Fetching the access logs from $SERVER"
  rsync -az -e "ssh -o BatchMode=yes" "$SERVER:$REMOTE_DIR/logs/caddy/" "$work/logs/" ||
    die "no logs at $SERVER:$REMOTE_DIR/logs/caddy (is the Caddyfile with the access log deployed? see DEPLOY.md)."
fi
compgen -G "$work/logs/*.log*" > /dev/null || die "no access logs found."
info "$(du -sh "$work/logs" | cut -f1) of logs, $(ls "$work/logs" | wc -l) file(s)"

step "Building the report"
# The rolled files are gzipped, the current one isn't. Times in German time.
docker run --rm --user "$(id -u):$(id -g)" --entrypoint sh -e TZ=Europe/Berlin -v "$work:/work" "$GOACCESS_IMAGE" -c '
  for log in /work/logs/*.log*; do
    case $log in *.gz) zcat "$log" ;; *) cat "$log" ;; esac
  done | goaccess - --log-format=CADDY --tz=Europe/Berlin --html-report-title="api.mastr-data.de" \
    -o /work/report.html -o /work/report.json' > "$work/goaccess.out" 2>&1 || { cat "$work/goaccess.out"; die "GoAccess failed."; }
[[ -s $work/report.html ]] || die "GoAccess wrote no report."
info "$(python3 -c "import json, sys; g = json.load(open(sys.argv[1]))['general']; print(f\"{g['total_requests']:,} requests, {g['unique_visitors']:,} visitors (IP, day and browser)\")" "$work/report.json" 2>/dev/null || true)"
rm -r "$work/logs" "$work/goaccess.out" "$work/report.json"

info "$work/report.html"
xdg-open "$work/report.html" > /dev/null 2>&1 || info "Open it in your browser."
