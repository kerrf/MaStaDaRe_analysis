#!/usr/bin/env bash
#
# Calls every route the website uses, as the website does: each has to answer 200 with data (not an empty list). That
# checks the code and the data at once, for a route fails too when a view or the rows the new code reads are missing.
# The pipeline runs it after each backend deploy and goes back if it fails, the daily check every morning.
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
  "/zubau/zeitverlauf?yearly=true&technology=grossspeicher_leistung&technology=gewerbespeicher_leistung&technology=heimspeicher_leistung"
  /zubau/registrierungen
  /zubau/registrierungsverzug
  "/solar/dashboard-stats?level=bundesland"
  /solar/size-distribution
  /solar/orientation
  /solar/orientation-tilt
  "/solar/size-distribution/regions?level=bundesland"
  "/solar/orientation/regions?level=bundesland"
  /solar/pv-speicher
  "/wind/dashboard-stats?level=bundesland"
  /wind/size-distribution
  "/wind/size-distribution/regions?level=bundesland"
  /wind/turbines
  "/water/dashboard-stats?level=bundesland"
  /water/size-distribution
  "/water/size-distribution/regions?level=bundesland"
  # Biomasse, Geothermie & Grubengas, KWK and the other storages (their tables come from the bulk export)
  "/biomass/dashboard-stats?level=bundesland"
  /biomass/size-distribution
  "/geothermal/dashboard-stats?level=bundesland"
  /geothermal/size-distribution
  "/kwk/dashboard-stats?level=bundesland"
  /kwk/size-distribution
  "/other-storage/dashboard-stats?level=bundesland"
  # The map in time (mrt.karte_zeit)
  "/karte/solar?level=bundesland&kennzahl=zubau&jahr=2024"
  "/zubau/zeitverlauf?yearly=true&technology=biomasse&technology=geothermie_grubengas&technology=kwk&technology=wasserstoffspeicher"
  "/battery/dashboard-stats?level=bundesland"
  # The Anlagen pages of Speicher and Gas: size classes and kinds (the pies)
  /battery/kinds
  /gas/erzeuger/size-distribution
  /gas/erzeuger/kinds
  /gas/speicher/size-distribution
  /gas/speicher/kinds
  /pumped-storage/plants
  /gas/erzeuger
  /gas/speicher
  "/regions/areas?level=bundesland"
  # Landkreis/Gemeinde (Landkreis Zwickau, Gemeinde Zwickau)
  "/regions/areas?level=gemeinde&within=14524"
  "/solar/zubau?region=14524"
  # Überblick: the monthly series of the parts (with the Balkonkraftwerke apart) and the Bestand of the peers
  "/zubau/zeitverlauf?region=14524&technology=solar_gebaeude_netto&technology=solar_balkon_netto&technology=solar_freiflaeche_netto&technology=solar"
  "/zubau/bestand?parent=14&year=2025&technology=solar_netto"
  "/solar/orientation?region=14524330"
  "/solar/orientation-tilt?region=14524330"
  "/solar/size-distribution?region=14524330"
  "/battery/zubau?region=14524"
  "/battery/size-distribution?region=14524330"
  "/battery/kinds?region=14524330"
  # The continuous map (mrt.heatmap_points)
  /solar/heatmap
  /wind/heatmap
  "/battery/heatmap?measure=capacity"
)

printf 'Smoke test of %s\n' "$API_URL"
body=$(mktemp)
trap 'rm -f "$body"' EXIT
failed=0
# Cloudflare keeps the API's answers for a while (Cache-Control, app/main.py): an address of its own for this run, so
# every route is answered by the backend itself, not by a copy from before the deploy. The API ignores the parameter.
run="smoke=$(date +%s)"
for route in "${ROUTES[@]}"; do
  [[ $route == *\?* ]] && url="$API_URL$route&$run" || url="$API_URL$route?$run"
  # A few tries: right after a deploy, Cloudflare and Caddy may need a moment
  result=$(curl --silent --output "$body" --write-out '%{http_code} %{time_total}' --max-time 60 \
    --retry 2 --retry-delay 5 --retry-all-errors "$url")
  code=${result%% *}
  # An empty list, or a map without points: the route works, but the database lacks its rows
  start=$(head -c 9 "$body")
  [[ $code == 200 && (${start:0:2} == '[]' || $start == '{"lon":[]') ]] && code='200, but empty'
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
