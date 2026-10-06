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


**Processed GeoJSON files** (what the old `/plz2_solar_brutto` and
`/plz5_solar_brutto` serve; the website doesn't use them any more; `data/raw` is
not needed at runtime, skip it):

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

This first time the server builds the image itself. From then on the pipeline
deploys (§10): it builds the image on GitHub and the server only pulls it.

## 7. Cloudflare (Cloudflare dashboard)

For the `mastr-data.de` zone → SSL/TLS → Overview: set encryption mode to
**Full (strict)**. This is safe as soon as Caddy is running, since Caddy
gets a real Let's Encrypt cert automatically on first request to
`api.mastr-data.de` (DNS is already proxied there, which is what lets the
ACME challenge reach the origin).

## 8. Verify

```bash
curl https://api.mastr-data.de/health
./deploy/smoke_test.sh   # every route the website reads, from your machine
```

Both should succeed. Then open the Vercel site and check the map, also with
Räumliche Auflösung → Kontinuierlich (Heatmap).

## 9. Vercel env var (Vercel dashboard)

Project Settings → Environment Variables → add for **Production**:

```
VITE_API_URL=https://api.mastr-data.de
```

Redeploy the frontend (or just push — see below) for it to take effect.
`frontend/.env.production` is gitignored, so this dashboard setting is the
only place this value actually lives for the deployed site.

## 10. The pipeline: checks and deploys on every push to `main` (GitHub)

`.github/workflows/pipeline.yml`. Every push to `main` runs it (Actions tab on
GitHub, about 5 minutes); nothing reaches the website unless every check is
green, and the backend always goes live before the frontend that needs it.

```
push to main
  ├─ Backend checks    ruff (lint + format, security rules) → pytest
  ├─ Frontend checks   eslint → vite build
  ├─ Security checks   gitleaks (secrets in any commit) → zizmor (the workflows)
  └─ Backend image     docker build → stored on ghcr.io
         │ all green
         ▼
  Deploy backend       server pulls the image → builds the views it needs → restart → /health → smoke test
         │ healthy       (else: back to the previous version, run turns red)
         ▼
  Deploy frontend      Vercel production → the website renders with data from the API
```

| Job | Step | What it does |
|---|---|---|
| Backend checks | `uv sync --locked` | installs exactly the versions in `uv.lock`; fails if `uv.lock` doesn't match `pyproject.toml` |
| | `ruff check` | finds bugs without running the code: undefined names, unused variables, likely mistakes, and security problems (Bandit's rules: SQL built from strings in the API, requests without a timeout, passwords in the code; rules in `pyproject.toml`) |
| | `ruff format --check` | the code is formatted as `ruff format` would (120 columns) |
| | `pytest` | the tests in `backend/tests` |
| Frontend checks | `npm ci`, `npm run lint`, `npm run build` | the same for the frontend: exact versions from `package-lock.json`, ESLint, Vite build |
| Security checks | gitleaks | searches every commit of the history for secrets: API keys, tokens, passwords, private keys. A finding is on GitHub already: replace that secret (new key, new password), then remove it from the code. A false alarm: its fingerprint (in the log) into `.gitleaksignore` |
| | zizmor | the security of the workflows themselves, which hold the keys to the server and to Vercel: injection through `${{ }}` expressions, too broad permissions, credentials left on disk, actions not pinned. Online it also checks that each pinned commit belongs to its action and that no action in use has a known vulnerability, also for Dependabot's updates |
| Backend image | build, store | builds the `Dockerfile` once and stores it on ghcr.io (GitHub's registry), named by the commit: what was checked is exactly what runs. Layers that didn't change come from a cache, so a code change rebuilds in about a minute |
| Deploy backend | `deploy/deploy_backend.sh` | on the server: notes the running version as the way back, sets the repo files (compose.yml, Caddyfile) to the commit, **builds the views the new version needs** (below), swaps in the new image and waits until `/health` answers (it checks the database too). Not healthy within 2 minutes: back to the previous version. Caddy holds requests during the swap, so visitors see no errors. Last, it sets up the nightly update (§11) |
| | `deploy/smoke_test.sh` | calls every route the website uses, through Cloudflare. Fails: `deploy/rollback_backend.sh` |
| Deploy frontend | `vercel deploy --prod` | Vercel builds and publishes the frontend, as it used to on every push; its own deploys of `main` are off (`frontend/vercel.json`), so the website changes only here |
| | `deploy/check_website.sh` | opens www.mastr-data.de in a headless Chrome like a visitor: the app has to render and show the four figures of the start page, which it loads from the API. A blank page (a broken bundle) or a frontend that can't reach the backend fails here; a plain HTTP check would let both pass |

Pull requests (Dependabot's) run only the four checks. `Run workflow` on
the Actions tab runs it for `main` again, e.g. when a deploy met the nightly
update.

### The views: built by the deploy

The dashboard reads its numbers from materialized views (schema `mrt`, the
SQL in `backend/app/etl/queries/`). A new view or a changed SQL file needs no
step of yours: the deploy runs `app/etl/transform.py` with the new image
**before** the new version goes live, and it builds exactly the views whose
file is new or changed (each view notes the SHA-256 of its file in its
comment). It builds a view beside the live one, which keeps answering, and
swaps them in one short transaction. If a build fails, the deploy stops: the
previous version keeps running (views built before the failure are new
already; views only grow, so it works with them).

- Usually it builds one or two views, a minute or two each. The first deploy
  after this was introduced builds all of them, as none carries its note yet:
  about 15–30 minutes, once (the job waits up to 90).
- While the nightly update runs (from 1:00, usually minutes), the deploy
  refuses: run it again later (Actions → Pipeline → Run workflow).
- Views only grow from one version to the next (new views, new columns): the
  version before keeps working with them, also after a rollback. A column or
  view that goes: first a version whose code no longer reads it, then one
  without it in the SQL.
- Locally the same, after changing a file: `cd backend`, then
  `uv run python -m app.etl.transform` (no arguments).

### Once: secrets (GitHub → repo → Settings → Secrets and variables → Actions)

| Secret | Value |
|---|---|
| `NETCUP_HOST` | `152.53.185.75` |
| `NETCUP_SSH_USER` | the ssh user on the server (`root`) |
| `NETCUP_SSH_KEY` | a **private** key only for the pipeline, see below |
| `NETCUP_KNOWN_HOSTS` | the server's host key, see below: ssh then refuses any other machine posing as the server |
| `NETCUP_DEPLOY_PATH` | `/opt/mastr` |
| `VERCEL_TOKEN` | vercel.com → Account Settings → Tokens → Create (scope: the project's team; it expires, renew it then) |
| `VERCEL_ORG_ID` | the team's ID: Team Settings → General → Team ID (personal account: Account Settings → General → Vercel ID) |
| `VERCEL_PROJECT_ID` | Project → Settings → General → Project ID |

The deploy key, on your machine (no passphrase: the pipeline can't type one):

```bash
ssh-keygen -t ed25519 -N "" -C "github-actions" -f ~/.ssh/mastr_deploy
```

```bash
ssh-copy-id -i ~/.ssh/mastr_deploy.pub root@152.53.185.75
```

```bash
cat ~/.ssh/mastr_deploy
```

The last one prints the private key: all of it, from `-----BEGIN` to
`-----END ... KEY-----`, is the value of `NETCUP_SSH_KEY`. Then delete it
locally (`rm ~/.ssh/mastr_deploy`); the server only needs the public half.

The host key: the line your own ssh trusts since your first login:

```bash
ssh-keygen -F 152.53.185.75 | grep -v '^#'
```

Its output is the value of `NETCUP_KNOWN_HOSTS`.

The images on ghcr.io stay private: the server pulls with the run's own token,
which expires when the run ends. After the first deploy, the old locally built
image can go: `docker image rm mastr-backend` on the server (the deploy keeps
it as `mastr-api:previous` until the next one).

### When it turns red

GitHub sends an email; the run's page shows which step failed and why.

- **Checks:** fix it locally, push again. Most of it the pre-commit hook
  catches before (below); `uv run ruff check --fix` and `uv run ruff format`
  fix most lint and format findings.
- **Security checks:** gitleaks found a secret: it is on GitHub, so replace
  it first (new key or password where it is used), then remove it from the
  code. zizmor: its message names the line of the workflow and the fix.
- **Deploy backend:** the previous version keeps running (or runs again). The
  log says where: the views (an error in a SQL file: fix it, push), the
  nightly update was running (`Run workflow` later), the health check or the
  smoke test (the step names the route).
- **Deploy frontend:** the backend is already new (and compatible with the old
  frontend, as long as routes are only added); fix and push, or `Re-run
  failed jobs`.

### Going back by hand

- Backend, one deploy back: on the server `/opt/mastr/deploy/rollback_backend.sh`.
- Further back: Actions → the run of an older commit → `Re-run all jobs`; it
  deploys that commit again (its image is still on ghcr.io).
- Frontend: Vercel → Deployments → the previous one → Instant Rollback.

### Dependabot (`.github/dependabot.yml`)

Mondays at 6:00 it opens pull requests for newer versions: one for the Python
packages, one for npm, one for the GitHub Actions (minor and patch updates
together; a major update alone, it may need code changes). It waits until a
release is 7 days old. The pipeline checks each pull request; merge it when
it's green, and it deploys like any push.

### Checks before committing (`.pre-commit-config.yaml`)

Once per clone:

```bash
uv run pre-commit install
```

From then on, `git commit` runs ruff (the same version as the pipeline, from
`uv.lock`) on the changed Python files, fixes and formats them, and stops the
commit if it changed something: look at it, `git add`, commit again. It also
stops secrets (gitleaks: API keys, tokens, passwords, private keys) before
they ever reach GitHub, files over 25 MB, and, when a workflow changed,
checks it (zizmor for its security, actionlint for mistakes). gitleaks and
actionlint are built once on first use, which needs Go installed.

### Every morning: the live check (`.github/workflows/monitor.yml`)

At 07:17 UTC GitHub checks the live site the way the pipeline checks a
deploy: every API route (`deploy/smoke_test.sh`), the website in Chrome
(`deploy/check_website.sh`), and that the data is fresh: the Datenstand may
be one day old (a night cut short by the API quota), not two. When something
fails, GitHub emails you. `Run workflow` on Actions → Monitor checks right
now.

### Once: in the repository's settings

- Settings → Advanced Security → **Dependabot alerts** and **security
  updates** on (security fixes as pull requests right away).
- If the repository is public: **Secret scanning** with **Push protection**
  on (free there): GitHub then refuses a push that contains a known kind of
  token, before anyone can see it.
- Settings → Rules → Rulesets → New branch ruleset for `main`: **Block force
  pushes** and **Restrict deletions**: the history the deploys come from can't
  be rewritten or lost by mistake.

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

Afterwards it refreshes the dashboard's materialized views (schema `mrt`, built
by the deploy with `transform.py`), so the website shows the new data. If nothing failed, it
notes the **Datenstand** in `meta.update_runs`: the day up to which the data
includes every change of the register. The API serves the newest one at
`GET /meta/datenstand`, and the website shows it wherever it says "Datenstand"
(until the first run, the fallback date in `frontend/src/config/site.js`). A failed
run keeps the previous Datenstand and exits with an error, visible in
`systemctl status mastr-update.service`.

**The deploy sets it up** (`deploy/deploy_backend.sh`, at its end): it
installs `deploy/mastr-update.service` and `.timer` into systemd when they
changed, with the repo folder as their working directory, and switches the
timer on. It needs `webservice_key` in `backend/.env.production` (step 3).

A run that hangs is stopped after 20 hours (`TimeoutStartSec`): while one runs,
the timer starts no other, so a hung run would block every night after it.
Its container has a fixed name, so two runs can't overlap.

By hand, only before the pipeline's first deploy (as root on the server):

```bash
cp /opt/mastr/deploy/mastr-update.service /opt/mastr/deploy/mastr-update.timer /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now mastr-update.timer
```

Useful afterwards:

```bash
systemctl list-timers mastr-update.timer     # when it runs next / ran last
sudo systemctl start mastr-update.service    # run it right now
docker compose run --rm backend python -m app.etl.update --dry-run   # only show what the next run would fetch
journalctl -u mastr-update.service -e        # the log of the last runs
curl -s https://api.mastr-data.de/meta/datenstand   # the Datenstand the website shows
```

The refresh keeps each view's definition; a new or changed view comes with
the deploy (section 10).

## 12. Push the local database to the server

For new **data**, not for views (those come with the deploy, section 10):
after loading a new bulk export locally, or new tables such as the gas ones.

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

## 13. Who visits the site: analytics and access logs

**Website (Vercel dashboard, project → Analytics / Speed Insights):** Web
Analytics is enabled once (Analytics → Enable; done for mastr-data.de: the site
serves `/_vercel/insights/script.js`), Speed Insights needs no switch: every
deployment brings its routes. The frontend sends a page view per page with its route (`/erzeuger/[land]/[kreis]`
adds up all Kreise) and the loading times of real visitors. Visitors, pages,
referrers, countries, browsers, systems and devices are there; IP addresses are
not (Vercel only keeps a daily hash). The IP addresses of the last 24 hours that
reached the site are under project → **Firewall → Traffic** (by IP, user agent,
country, path, network).

Custom events (map and table exports, technology, filters, map settings) need
the Pro plan. Then set the environment variable `VITE_ANALYTICS_EVENTS=true` in
the Vercel project (Production) and redeploy; without it they are not sent, so
on Hobby they don't use up the 50,000 events a month.

**API (this server):** Caddy writes an access log, a JSON line per request with
the visitor's IP (from Cloudflare's `CF-Connecting-IP`, trusted only from
Cloudflare's addresses), country, path, status, time, browser. A new file every
day, kept 7 days, in `logs/caddy/` (gitignored). The pipeline (§10) brings it
with a deploy: the Caddyfile and compose.yml of the commit, the pinned
`caddy:2.11-alpine`, and Caddy restarted when its Caddyfile changed.

Then, on your machine, whenever you like:

```bash
./deploy/api_report.sh
```

It fetches the logs, builds a GoAccess report (visitors and requests per day and
hour, IP addresses, browsers, systems, endpoints, status codes, slow requests,
crawlers) in a temporary folder of your session and opens it in the browser.
The IP addresses are personal data: say so in the Datenschutzerklärung (done,
section 3) and don't keep the logs or reports longer than needed.
