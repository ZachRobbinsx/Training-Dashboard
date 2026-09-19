# Training dashboard

Garmin Connect -> Neon Postgres (via GitHub Actions, every 3 hours) -> Next.js site on Vercel (password protected).

```
sync/   Python: pulls activities, FIT files, sleep, HRV, stats, weight from Garmin
web/    Next.js dashboards (Overview, Recovery, Running, Cycling, Swimming, Activities,
        a full breakdown page per session, and side-by-side comparison of 2-6 sessions)
.github/workflows/sync.yml   the schedule
```

## One-time setup

### 1. Save your Garmin login token (on your Mac)
```bash
cd sync
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL='paste-your-neon-connection-string-here'
python login.py        # asks for Garmin email + password (hidden), saves a token to the database
```

### 2. Backfill history (also on your Mac, same terminal)
```bash
python sync.py --since 2025-01-01     # change the date; safe to stop and re-run, it resumes
```
Each day needs several Garmin calls, so a year takes roughly 20-40 minutes.

If you already synced activities before, build the per-km / per-length analysis for them too:
```bash
python reanalyse.py          # only activities that don't have it yet
python reanalyse.py --all    # recompute everything (after editing analyse.py)
```

### 3. Push to GitHub
Create a **private** repo, then from the project root:
```bash
git init && git add . && git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
In the repo: Settings -> Secrets and variables -> Actions -> New repository secret:
- `DATABASE_URL` = your Neon connection string

Then Actions tab -> "Garmin sync" -> Run workflow, to check it works. It then runs every 3 hours.

### 4. Deploy the site on Vercel
Vercel -> Add New -> Project -> import the repo -> set **Root Directory** to `web` -> add environment variables:
- `DATABASE_URL` = Neon connection string
- `DASHBOARD_PASSWORD` = the password you'll sign in with
- `AUTH_SECRET` = any long random string (`openssl rand -hex 32`)

Deploy. Open the URL, sign in.

## Using the site
- **Running / Cycling / Swimming**: progress trends across all sessions, plus a list of every session.
- **Click a session**: per-km (or per-length) charts, pacing thirds, laps, swim sets, and a notes box.
- **Compare**: tick 2-6 sessions of one sport on a sport page and press *Compare selected*.
- Your settings (max HR, swim stroke-distance target) live in `web/lib/config.ts`.

## If something breaks
- **Sync says it can't log in / token expired**: re-run `python login.py` (step 1).
- **Garmin rate limits (429)**: wait an hour; the backfill resumes where it stopped.
- **A session says 'detailed charts aren't available'**: its FIT file hasn't been analysed yet. Run `python reanalyse.py`.
- **A chart is empty**: that field may not exist for your watch. Raw Garmin JSON is stored in
  `activities.summary` and `daily_metrics.payload`, so anything can be charted later without re-syncing.
- **garminconnect is unofficial**: if Garmin changes their login, upgrade with `pip install -U garminconnect`.

## Security
Never commit connection strings or passwords. The site is gated by one password (cookie stores a hash, not the password).
