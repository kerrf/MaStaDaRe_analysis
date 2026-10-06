#!/usr/bin/env bash
#
# Opens the website in a headless Chrome, like a visitor, and checks that it works: the app renders and the start page
# shows the four figures of the register, which it loads from the API. So it also catches a blank page (a broken
# bundle) and a frontend that can't reach the backend (API address, CORS), which a plain HTTP check would let pass.
# The pipeline runs it after a frontend deploy, the daily check (.github/workflows/monitor.yml) every morning.
#
#   ./deploy/check_website.sh                                    # https://www.mastr-data.de
#   SITE_URL=http://localhost:5173 ./deploy/check_website.sh     # the dev server
#
# No arguments. Needs Chrome or Chromium (GitHub's runners have it).

set -Eeuo pipefail
export LC_ALL=C

SITE_URL=${SITE_URL:-https://www.mastr-data.de}
FIGURES=4 # RegisterFigures.jsx: Solaranlagen, Windenergieanlagen, Batteriespeicher, Gasspeicher

chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[[ -n $chrome ]] || { printf 'No Chrome or Chromium found\n' >&2; exit 1; }
profile=$(mktemp -d)
trap 'rm -rf "$profile"' EXIT

printf 'Website check of %s\n' "$SITE_URL"
for attempt in 1 2 3; do
  # The page as the browser built it: after its scripts ran and the API answered (virtual time waits for the requests)
  page=$("$chrome" --headless=new --disable-gpu --no-first-run --user-data-dir="$profile" \
    --virtual-time-budget=20000 --dump-dom "$SITE_URL/" 2> /dev/null || true)
  # A figure shows a number once its data came, "—" while it is missing
  loaded=$(grep -o 'class="figure__value tabular">[0-9]' <<< "$page" | wc -l || true)
  if ((loaded == FIGURES)); then
    printf '  \033[32mok\033[0m   the app renders, %d of %d figures from the API\n' "$loaded" "$FIGURES"
    exit 0
  fi
  if grep -q 'class="navbar' <<< "$page"; then
    printf '  try %d: the app renders, but only %d of %d figures came from the API\n' "$attempt" "$loaded" "$FIGURES"
  else
    printf '  try %d: the app did not render (blank page, or the site is down)\n' "$attempt"
  fi
  ((attempt < 3)) && sleep 15
done

printf '\n\033[1;31mThe website does not work as it should\033[0m\n'
exit 1
