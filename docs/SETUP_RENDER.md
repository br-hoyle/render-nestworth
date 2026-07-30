# Render setup

NestWorth deploys as **two separate Render Web Services** from this one GitHub repo — a
Python/FastAPI backend and a Next.js frontend. They're on different subdomains
(`*.onrender.com`), so the session cookie is set with `SameSite=None; Secure` and the
frontend calls the backend's public URL directly from the browser (see
`frontend/lib/api.ts`) — there's no server-side proxying between them.

## 1. Push this repo to GitHub

If you haven't already: create a GitHub repo and push. Render deploys from a repo, not a
local folder.

## 2. Backend service — `nestworth-api`

New → Web Service → connect the repo.

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Runtime | Python 3 |
| Build Command | `pip install poetry && poetry config virtualenvs.create false && poetry install --no-root --only main` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/health` |

Environment variables (Render → Environment):

| Key | Value |
|---|---|
| `DATABASE_URL` | Supabase owner connection string (see `docs/SETUP_SUPABASE.md`) |
| `TENANT_DATABASE_URL` | Supabase `app_user` connection string |
| `JWT_SECRET` | a long random string — e.g. output of `openssl rand -hex 32` |
| `OWNER_HOUSEHOLD_ID` | printed by `scripts/seed.py` (or `scripts/invite.py` for the first household) |
| `CORS_ALLOW_ORIGIN` | the frontend service's Render URL, e.g. `https://nestworth-web.onrender.com` |
| `ENVIRONMENT` | `production` (this switches the session cookie to `Secure`, required for `SameSite=None` to work over HTTPS) |

## 3. Frontend service — `nestworth-web`

New → Web Service → same repo.

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run start -- -p $PORT` |
| Health Check Path | `/api/health` |

Environment variables:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | the backend service's Render URL, e.g. `https://nestworth-api.onrender.com` |

Deploy the backend first (or at least know its URL) so you can fill in `CORS_ALLOW_ORIGIN`
and `NEXT_PUBLIC_API_URL` correctly — they reference each other.

## 4. Free-tier keep-alive

Render's free tier spins a Web Service down after **15 minutes** of inactivity, which means
a cold-start delay on the next request — not acceptable for a daily-use household app. This
repo includes `.github/workflows/keep-alive.yml`, a GitHub Action that pings both services'
health-check endpoints every 10 minutes (comfortably inside the 15-minute window).

To wire it up, add these as **repository variables** (Settings → Secrets and variables →
Actions → Variables, not Secrets — these aren't sensitive):

| Variable | Value |
|---|---|
| `RENDER_API_URL` | `https://nestworth-api.onrender.com` (no trailing slash) |
| `RENDER_WEB_URL` | `https://nestworth-web.onrender.com` (no trailing slash) |

The workflow also supports manual triggering (Actions tab → Keep Alive → Run workflow) for
testing. Note: GitHub's scheduler can delay cron-triggered workflows by a few minutes under
load, especially on infrequently-used repos — this is "best effort keep-warm," not a
guarantee. If it proves unreliable in practice, a dedicated uptime-ping service (e.g.
UptimeRobot) is the usual fallback, but per-repo GitHub Actions is what's wired up here.

## 5. Verify

Once both services show "Live" in the Render dashboard, visit the frontend URL, log in
(or hit `/setup` for a first-time household), and confirm data loads — that exercises the
whole chain (frontend → backend → Supabase, with RLS enforced along the way).
