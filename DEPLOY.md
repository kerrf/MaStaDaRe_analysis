# Deploying the backend to netcup

One-time setup to get `main` running permanently on the netcup VPS
(`152.53.185.75`), reachable at `https://api.mastr-data.de` through
Cloudflare, and to wire up auto-deploy on every push to `main`.

Run everything below **on the netcup server** over SSH unless marked
"(local)" or "(Cloudflare dashboard)" or "(GitHub)".

## 0. Prerequisites

- SSH access to the netcup server as a user that can install packages
  (sudo) and will own the deploy directory.
- Cloudflare dashboard access for the `mastr-data.de` zone.
- GitHub repo admin access (to add Actions secrets).

## 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Log out and back in (or `newgrp docker`) so your session picks up the
`docker` group. Verify:

```bash
docker compose version
```

## 2. Clone the repo

```bash
sudo mkdir -p /opt/mastr
sudo chown $USER:$USER /opt/mastr
git clone https://github.com/kerrf/MaStaDaRe_analysis.git /opt/mastr
cd /opt/mastr
```

This path (`/opt/mastr`) is what you'll put in the `NETCUP_DEPLOY_PATH`
GitHub secret in step 7.

## 3. Create the secret env files (never committed to git)

Generate a strong Postgres password:

```bash
openssl rand -base64 24
```

**`/opt/mastr/.env`** (root of the repo — read automatically by `docker compose`):

```
POSTGRES_PASSWORD=<paste the generated password>
```

**`/opt/mastr/backend/.env.production`** — copy the template and fill it in:

```bash
cp backend/.env.production.example backend/.env.production
```

Edit it so `DATABASE_URL` uses the **same** password as above, and paste
your real MaStR `webservice_key` (copy it from your local `backend/.env`):

```
DATABASE_URL="postgresql+psycopg2://mastr:<same password as .env>@db:5432/mastr"
webservice_key="<your real key>"
```

## 4. Start the database

```bash
docker compose up -d db
docker compose ps   # wait until it shows "healthy"
```

## 5. Copy your existing data over (local → server)

Run these on your **local** machine, not the server.

**Database:** `deploy/push_db.sh` (see section 12) copies the local database to
the server — the first time, and whenever you have new data locally. It needs
the backend running (step 6), since it restarts it for the switch.


**Processed GeoJSON/PNG files** (182MB — this is what `/plz5_heatmap_image`
etc. serve; `data/raw` is not needed at runtime, skip it):

```bash
rsync -av --progress backend/data/processed/ you@152.53.185.75:/opt/mastr/backend/data/processed/
```

## 6. Build and start the backend + reverse proxy

Back on the **server**:

```bash
cd /opt/mastr
docker compose up -d --build backend caddy
docker compose logs -f backend   # Ctrl+C once you see "Application startup complete"
```

## 7. Cloudflare (Cloudflare dashboard)

For the `mastr-data.de` zone → SSL/TLS → Overview: set encryption mode to
**Full (strict)**. This is safe as soon as Caddy is running, since Caddy
gets a real Let's Encrypt cert automatically on first request to
`api.mastr-data.de` (DNS is already proxied there, which is what lets the
ACME challenge reach the origin).

## 8. Verify

```bash
curl https://api.mastr-data.de/health
curl -I https://api.mastr-data.de/plz5_heatmap_image
```

Both should return `200`. Then open `/map3` on the Vercel site and confirm
the heatmap image layer renders. The stats panel may still error — see the
"known gaps" note below, that's expected and unrelated to this deploy.

## 9. Vercel env var (Vercel dashboard)

Project Settings → Environment Variables → add for **Production**:

```
VITE_API_URL=https://api.mastr-data.de
```

Redeploy the frontend (or just push — see below) for it to take effect.
`frontend/.env.production` is gitignored, so this dashboard setting is the
only place this value actually lives for the deployed site.

## 10. GitHub Actions secrets — auto-deploy on every push to `main` (GitHub)

Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `NETCUP_HOST` | `152.53.185.75` |
| `NETCUP_SSH_USER` | the SSH user you used above |
| `NETCUP_SSH_KEY` | a **private** key (generate a dedicated deploy key, don't reuse your personal one) whose public half is in that user's `~/.ssh/authorized_keys` on the server |
| `NETCUP_DEPLOY_PATH` | `/opt/mastr` |

Once these are set, every push to `main` that passes CI runs
`git pull && docker compose up -d --build backend caddy` on the server
automatically (see `.github/workflows/main.yaml`, `deploy` job).

## 11. Nightly update from the MaStR API

`backend/app/etl/update.py` fetches every unit that changed since the last
run from the MaStR API and upserts it into `raw.solar_units`,
`raw.wind_units`, `raw.water_units` and `raw.storage_units`, plus the storage
plants of changed or plant-less storage units into `raw.storage_plants` (the
capacity lives there). Likewise the gas producers and gas storages
(`raw.gas_producer_units`, `raw.gas_storage_units`, `raw.gas_storage_plants`),
as soon as those tables exist (they come with `deploy/push_db.sh`, section 12;
until then it skips them). A systemd
timer runs it every night at 1:00 German time, in a one-off container of the
backend image.

It lists what changed (cheap: 2,000 units per call) and fetches only the units
that are new or really changed, solar first and new units before changed ones,
so a night costs a few hundred detail calls instead of tens of thousands. Up to
when each table is complete is noted in `meta.sync_state`: if the API quota or an
interruption cuts a run short, the next one continues there.

Afterwards it refreshes the dashboard's materialized views (schema `mrt`, created
once by `transform.py`), so the website shows the new data. If nothing failed, it
notes the **Datenstand** in `meta.update_runs`: the day up to which the data
includes every change of the register. The API serves the newest one at
`GET /meta/datenstand`, and the website shows it wherever it says "Datenstand"
(until the first run, the fallback date in `frontend/src/config/site.js`). A failed
run keeps the previous Datenstand and exits with an error, visible in
`systemctl status mastr-update.service`.

Once, on the **server** (needs `webservice_key` in
`backend/.env.production`, see step 3):

```bash
sudo cp /opt/mastr/deploy/mastr-update.service /opt/mastr/deploy/mastr-update.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mastr-update.timer
```

Useful afterwards:

```bash
systemctl list-timers mastr-update.timer     # when it runs next / ran last
sudo systemctl start mastr-update.service    # run it right now
docker compose run --rm backend python -m app.etl.update --dry-run   # only show what the next run would fetch
journalctl -u mastr-update.service -e        # the log of the last runs
curl -s https://api.mastr-data.de/meta/datenstand   # the Datenstand the website shows
```

If your deploy path isn't `/opt/mastr`, change `WorkingDirectory` in
`deploy/mastr-update.service` first.

**The refresh keeps a view's old definition.** A changed file in
`backend/app/etl/queries/` reaches the server with the database: build the
view locally, then run `deploy/push_db.sh` (section 12), which also brings new
tables such as the gas ones.

## 12. Push the local database to the server

```bash
./deploy/push_db.sh
```

Once, before the first run: `cp deploy/server.env.example deploy/server.env`
and fill in the ssh destination (`SERVER`), the repo folder on the server
(`REMOTE_DIR`) and the API URL. The file is not committed. No arguments needed.

What it does:

1. **Checks:** local database idle (no update or view rebuild still writing),
   ssh access, no nightly update running on the server, PostgreSQL versions
   (the dump is written by the `pg_dump` of the server's major version, which an
   older `pg_restore` could not read otherwise).
2. **Dump:** one consistent snapshot in PostgreSQL's custom format, zstd
   compressed, plus the exact row count of every table and view (the manifest).
   Left out: the old staging schema `stg` (see `EXCLUDE_SCHEMAS`).
3. **Upload** with `rsync --partial` (an interrupted upload continues, three
   tries) and a sha256 check on the server.
4. **Restore on the server** (`deploy/db_on_server.sh`, uploaded with the dump)
   into a new database `mastr_next` **next to the live one** — the website keeps
   running meanwhile — in parallel, then `ANALYZE`. The materialized views are
   computed anew. The server's update history (`meta.update_runs`, the
   Datenstand) is carried over. Then every table's row count has to match the
   manifest, or it stops and `mastr` stays live.
5. **Switch:** backend stopped for a few seconds, `mastr` → `mastr_prev`,
   `mastr_next` → `mastr`, backend started, public API checked.

The previous database stays as `mastr_prev` until the next push. Back to it:

```bash
./deploy/rollback_db.sh
```

It swaps `mastr` and `mastr_prev` (run it again to swap back). Disk needed on
the server: about 1.3 × the database plus the dump, next to the live database.
Afterwards the nightly update fetches every change since the state of the
pushed database, the Datenstand follows with its next complete run.

## Known gaps (not fixed by this deploy, by design)

- `/solar/dashboard-stats` depends on `mrt.solar_rollup_stats` /
  `mrt.solar_units_bundesland_agg`, which don't exist yet — the SQL to
  build them exists (`backend/app/etl/queries/aggregate_pv_by_*.sql`) but
  nothing runs it yet. This is the "whole update pipeline" to build later.
- `/solar/` (unfiltered list endpoint) has a pre-existing bug — not called
  by the current frontend, so left alone.
- `MapPage.jsx` / `MapPage2.jsx` (`/map`, `/map2` routes) call backend
  endpoints that don't exist — they look superseded by `MapPage3` (`/map3`)
  and weren't touched.
