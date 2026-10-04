#!/usr/bin/env bash
#
# Calls every route the website uses, as the website does: each has to answer 200. That checks the code and the data at
# once, for a route fails too when the server's database lacks a view the new code reads (push the database first,
# deploy/push_db.sh). The pipeline runs it after each backend deploy and goes back if it fails.
#
#   ./deploy/smoke_test.sh                                   # the live API
#   API_URL=http://localhost:8000 ./deploy/smoke_test.sh     # your local backend
#
# When the website calls a new route, add it here.

set -uo pipefail
export LC_ALL=C # decimal points, whatever the language of the machine

API_URL=${API_URL:-https://api.mastr-data.de}

ROUTES=(
  /health
  /meta/datenstand
  "/zubau/zeitverlauf?yearly=true&technology=solar_netto&technology=wind_an_land&technology=wind_auf_see&technology=grossspeicher&technology=gewerbespeicher&technology=heimspeicher"
  /zubau/registrierungen
  /zubau/registrierungsverzug
  "/solar/dashboard-stats?level=bundesland"
  /solar/size-distribution
  /solar/orientation
  "/solar/size-distribution/regions?level=bundesland"
  "/solar/orientation/regions?level=bundesland"
  /solar/pv-speicher
  "/wind/dashboard-stats?level=bundesland"
  /wind/size-distribution
  "/wind/size-distribution/regions?level=bundesland"
  "/water/dashboard-stats?level=bundesland"
  /water/size-distribution
  "/water/size-distribution/regions?level=bundesland"
  "/battery/dashboard-stats?level=bundesland"
  /pumped-storage/plants
  /gas/erzeuger
  /gas/speicher
  "/regions/areas?level=bundesland"
)

printf 'Smoke test of %s\n' "$API_URL"
failed=0
for route in "${ROUTES[@]}"; do
  # A few tries: right after a deploy, Cloudflare and Caddy may need a moment
  result=$(curl --silent --output /dev/null --write-out '%{http_code} %{time_total}' --max-time 60 \
    --retry 2 --retry-delay 5 --retry-all-errors "$API_URL$route")
  code=${result%% *}
  if [[ $code == 200 ]]; then
    printf '  \033[32mok\033[0m   %s  %5.2fs  %s\n' "$code" "${result#* }" "$route"
  else
    printf '  \033[31mFAIL\033[0m %s  %5.2fs  %s\n' "$code" "${result#* }" "$route"
    failed=$((failed + 1))
  fi
done

if ((failed)); then
  printf '\n\033[1;31m%d of %d routes failed\033[0m\n' "$failed" "${#ROUTES[@]}"
  exit 1
fi
printf '\n\033[1;32mAll %d routes answer\033[0m\n' "${#ROUTES[@]}"
