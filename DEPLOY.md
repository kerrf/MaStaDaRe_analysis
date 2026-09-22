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

**Database dump:**

```bash
docker exec mastr_db pg_dump -U mastr -Fc mastr > /tmp/mastr.dump
scp /tmp/mastr.dump you@152.53.185.75:/tmp/mastr.dump
```

Then back **on the server**:

```bash
docker cp /tmp/mastr.dump mastr_db:/tmp/mastr.dump
docker exec mastr_db pg_restore -U mastr -d mastr --clean --if-exists /tmp/mastr.dump
```

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
