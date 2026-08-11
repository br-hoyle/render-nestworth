# NestWorth

*Where every dollar becomes your nest egg.*

A multi-tenant household net-worth and budgeting app: net worth tracking with forward-filled
balance history, an 11-metric financial health scorecard, EveryDollar CSV import, 7
financial calculators, and saved/comparable retirement and house-affordability scenarios.
Full spec in [`CLAUDE.md`](CLAUDE.md).

## Stack

- **Backend**: FastAPI (Python), SQLAlchemy Core over `psycopg` (v3), Supabase Postgres
- **Frontend**: Next.js (TypeScript, App Router), Tailwind CSS, Recharts
- **Auth**: custom invite-only login (bcrypt + signed JWT session cookie), not Supabase Auth
- **Hosting**: two Render Web Services (backend + frontend) from this one repo

Frontend and backend are separate origins — the browser calls the API directly
(`credentials: 'include'`), so there's no server-side proxying between them. See
`frontend/lib/api.ts` and `backend/app/deps.py` for the session-cookie handling this implies.

## Repo layout

```
backend/    FastAPI app — see backend/app/routers, backend/app/services (pure calc logic)
frontend/   Next.js app — see frontend/app/(auth) and frontend/app/(app)
docs/       Setup guides and KPI formula reference
.github/    Keep-alive GitHub Action
```

## Local development

**Backend** (conda + Poetry — `poetry config virtualenvs.create false` is already set in
`backend/poetry.toml`, so Poetry installs into whatever Python is active rather than making
its own venv):

```bash
conda create -n nestworth python=3.12
conda activate nestworth
cd backend
poetry install
cp .env.example .env   # fill in your Supabase connection strings, see docs/SETUP_SUPABASE.md
python scripts/apply_schema.py   # or run sql/schema.sql manually in the Supabase SQL editor
python scripts/seed.py           # optional demo data
uvicorn app.main:app --reload --port 8000
```

**Frontend**:

```bash
cd frontend
npm install
cp .env.local.example .env.local   # points at http://localhost:8000 by default
npm run dev
```

**Tests** (pure calculation logic — forward-fill, effective-date overlap checks, KPI
formulas, calculators, CSV dedup fingerprinting — no DB required):

```bash
cd backend
pytest
```

## Inviting friends & family

Self-serve signup (`/signup`, and the "Create account" tab on the marketing page) is gated
behind a shared invite code rather than being fully open — `POST /auth/signup` rejects any
request whose `friends_family_code` doesn't match the hardcoded value below
(`backend/app/routers/auth.py`, `FRIENDS_FAMILY_CODE`):

```
24527
```

Share this code directly with whoever you want to invite (text, email, whatever) — it isn't
shown anywhere in the app's own UI. It's a soft, plain-text gate against random signups, not a
real secret: anyone with the code can create a household, and the code itself grants no other
access. Rotate it by changing the constant in `auth.py` and redeploying if it ever leaks further
than intended.

## Deployment

See [`docs/SETUP_SUPABASE.md`](docs/SETUP_SUPABASE.md) and
[`docs/SETUP_RENDER.md`](docs/SETUP_RENDER.md) for the full manual-action checklists.

## Documentation

- [`docs/SETUP_SUPABASE.md`](docs/SETUP_SUPABASE.md) — schema, RLS pattern, seeding, invites
- [`docs/SETUP_RENDER.md`](docs/SETUP_RENDER.md) — the two Web Services, env vars, keep-alive
- [`docs/KPI_FORMULAS.md`](docs/KPI_FORMULAS.md) — all 11 scorecard formulas and thresholds
