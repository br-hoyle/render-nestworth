# Build Prompt: Personal Finance & Net Worth Tracking Application

## Role & Objective

You are an AI coding agent tasked with building a **personal finance and net worth tracking application**. It starts as a single household's tool but must be **multi-tenant from day one**: multiple households (e.g., friends invited by the original owner) will each log in and see only their own data. The app must be **multi-tenant from day one**, deployed as a web app on **Render**, backed by a **Supabase Postgres database**.

Build this as a working, deployable application — not a prototype or mockup. Prioritize correctness of financial math and correct data isolation between households over visual polish, but the UI should still be clean and usable on desktop and mobile.

## Brand & Wireframe
See HTML document for branding and wireframe
 
---

## 1. Data Layer: Supabase (Postgres)

Use Supabase as the database (managed Postgres + REST/RPC access via `supabase-py`, or a direct Postgres connection via SQLAlchemy/`psycopg2` — agent's choice, but be consistent). All date fields are `date` type in Postgres (no more string-formatted dates).

**Multi-tenancy model**: a single Supabase project/database holds data for every household. Every data table gets a `household_id UUID` foreign key column, and **every read/write in the app must filter/scope by the logged-in user's `household_id`**. Treat this as a hard security requirement, not a cosmetic filter — a bug that lets one household see another's rows is a data leak.

**Enable Row Level Security (RLS) on every table as defense-in-depth**, in addition to application-level filtering. Since auth is custom (not Supabase Auth — see below), RLS policies should key off a `household_id` value passed via a Postgres session variable/claim set by the app on each authenticated request (e.g., using `set_config('app.current_household_id', ...)` per request, with policies like `USING (household_id = current_setting('app.current_household_id')::uuid)`). Document this pattern clearly since it's easy to get wrong.

### Table: `users` (auth / tenancy)
```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL UNIQUE, -- one-to-one: one user per household, see note below
    household_name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT,                -- bcrypt hash; NULL until status = 'active'
    security_question TEXT,
    security_answer_hash TEXT,
    status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active')),
    created_date TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
`household_id` is one-to-one with `user_id`: this app is designed as exactly one user per household (a "household" login represents the whole family/unit, not individual family members). Don't build multi-user-per-household logic; `household_id` is kept as its own column (rather than just reusing `user_id`) for schema clarity and readability in every other table, not because it's currently 1-to-many.

**Invite-only signup flow**:
1. The app owner (you) manually adds a row to `users` (via an admin utility — see Section 4) with `user_id`, `household_id`, `household_name`, `username`, `status = 'invited'`, and NULL `password_hash`/`security_answer_hash`.
2. The invited person visits a "set up your account" screen, enters their `username`, sets a password, and picks + answers a security question. The app hashes both the password and the security answer, writes them back to the row, and flips `status` to `'active'`.
3. Login only succeeds for `active` users whose password hash matches. There is **no open self-registration** — a username that doesn't already exist in `users` cannot sign up.
4. **Session duration**: once logged in, the session stays valid for **1 hour** of inactivity, then requires re-authentication. Implement with a signed session token (e.g., JWT or a server-side session store) carrying an expiry/last-activity timestamp, refreshed on each authenticated request and checked on every route.
5. **Password reset**: a "forgot password" flow lets the user enter their `username`, answer their `security_question` correctly (hash comparison), and set a new password if it matches. No email/SMS integration required.
6. All data the household subsequently creates (Accounts, Income, Balances, Transactions, Scenarios) is tagged with that user's `household_id`. Since it's one user per household, saved Retirement/House scenarios are implicitly private per household — no separate sharing logic needed.

**Note on Supabase Auth**: Supabase ships a built-in Auth system (email/password, magic links, etc.) that could replace the custom `users` table above. This prompt intentionally uses a **custom auth table** instead, to match the decided invite-only + security-question-reset flow exactly. If you (the coding agent) judge that adapting Supabase Auth to this flow is meaningfully simpler or more secure than rolling custom auth, flag that tradeoff before building rather than silently switching approaches.

### Table: `accounts` (dimension table, slowly-changing)
```sql
CREATE TABLE accounts (
    account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES users(household_id),
    balance_type TEXT NOT NULL CHECK (balance_type IN ('asset', 'liability')),
    institution_name TEXT NOT NULL,
    category TEXT NOT NULL,             -- e.g. Banking, Investments
    account_type TEXT NOT NULL,         -- e.g. Savings, Checking, Credit, Brokerage, Roth IRA, Traditional IRA, Roth 401K
    account_name TEXT NOT NULL,         -- unique within a household, not globally
    effective_start_date DATE NOT NULL,
    effective_end_date DATE NOT NULL DEFAULT '9999-12-31',
    UNIQUE (household_id, account_name, effective_start_date)
);
```
This is a **Type-2 slowly-changing dimension**: an account can be renamed or restructured over time, so joins to Balances/Transactions must respect `effective_start_date`/`effective_end_date` windows (scoped to the same `household_id`), not just name matching. Handle `'9999-12-31'` as the "still open" sentinel.

### Table: `income`
```sql
CREATE TABLE income (
    income_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES users(household_id),
    individual TEXT NOT NULL,
    company TEXT NOT NULL,
    income NUMERIC(14,2) NOT NULL,      -- annualized gross income
    effective_start_date DATE NOT NULL,
    effective_end_date DATE NOT NULL DEFAULT '9999-12-31'
);
```
Multiple individuals can have overlapping and sequential records (raises, job changes). Household income at any point in time = sum of all individuals' active income records on that date, **scoped to `household_id`**.

### Table: `balances` (irregular point-in-time snapshots)
```sql
CREATE TABLE balances (
    balance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES users(household_id),
    account_id UUID NOT NULL REFERENCES accounts(account_id),
    full_date DATE NOT NULL,
    balance NUMERIC(14,2) NOT NULL,     -- positive number; sign convention handled by accounts.balance_type
    UNIQUE (account_id, full_date)
);
CREATE INDEX idx_balances_household_date ON balances (household_id, full_date);
```
Snapshots are **irregular** — not every account has a balance for every date. The app must, per household:
- Build a daily/monthly net worth time series by **forward-filling** each account's most recent known balance until a newer snapshot exists. (This can be done efficiently in SQL with a window function like `LAST_VALUE ... IGNORE NULLS` over a generated date series, or in the app layer — pick whichever keeps the logic testable and fast.)
- Not fabricate data before an account's first snapshot or after its `effective_end_date`.
- Flag accounts that are "stale" (no snapshot in N days) so the user knows to update them.
- Support **importing any volume of historical data** (no date-range restriction on import) and provide a **date-range filter control** on dashboards so users can narrow the view without limiting what's stored.

### Table: `transactions`
Modeled on the user's EveryDollar export format (sample columns: `Group`, `Item`, `Type`, `Date`, `Merchant`, `Account`, `Amount`, `Note`). Normalize on import to:
```sql
CREATE TABLE transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES users(household_id),
    date DATE NOT NULL,
    "group" TEXT,                       -- top-level budget category
    item TEXT,                          -- sub-category
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    merchant TEXT,
    account_name TEXT,                  -- raw label from CSV; NOT a foreign key to accounts (see note below)
    amount NUMERIC(14,2) NOT NULL,      -- signed: income positive, expense negative
    note TEXT,
    source_file TEXT,                   -- import batch traceability
    dedup_fingerprint TEXT NOT NULL,    -- hash of (household_id, date, merchant, amount, note) for de-dup
    UNIQUE (household_id, dedup_fingerprint)
);
```
`account_name` is **not linked to the `accounts` table for now** — store the raw account label from the CSV as-is; do not attempt to join or validate it against `accounts`.

Build a **CSV importer** that accepts EveryDollar-style exports (comma-separated, quoted fields, header row `Group,Item,Type,Date,Merchant,Account,Amount,Note`), de-duplicates against existing rows within the same `household_id` via the `dedup_fingerprint` unique constraint, and inserts new rows into `transactions`.

**Future enhancement (not required for v1, but design so it can be added without a schema rewrite)**: a manual mapping step during import where the user picks the matching `accounts` row from a dropdown for each distinct `Account` value in the CSV, populating a proper `account_id` foreign key column added later. Leave a code comment / TODO marking where this would slot in.

### Table: `scenarios`
```sql
CREATE TABLE scenarios (
    scenario_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES users(household_id),
    scenario_type TEXT NOT NULL CHECK (scenario_type IN ('retirement', 'house')),
    scenario_name TEXT NOT NULL,
    assumptions JSONB NOT NULL,         -- flexible bag of inputs (contribution rate, return rate, etc.)
    created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_date TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
Storing `assumptions` as `JSONB` keeps the scenario planner flexible without needing a migration every time a new input is added — validate its shape in the application layer.

---

## 2. Core Application Features

### Household & Auth Model
- Multi-tenant by household; no self-serve signup — households are provisioned via invite and activated by the invitee setting their own password + security-question answer (sets `password_hash` + `answer_hash`, flips `status → active`)
- Auth error messages must not leak which field was wrong or whether a username exists (constant-time, enumeration-safe copy for login *and* forgot-password)
- Session timeout on inactivity; expiry surfaces as a modal on the current screen, not a redirect
- Only the household `owner` role can view/manage invites; non-owner access to that route must return 404, not 403

### Accounts — Slowly Changing Dimension (Type 2)
- Accounts are versioned: any edit to name/category/type/institution/asset-liability flag closes the current row (`effective_end_date`) and opens a new row starting at the edit date — never an in-place update
- Open-ended rows use a sentinel end date (e.g. `9999-12-31`) that renders as "open" in the UI and must be excluded from any chart x-axis logic
- Validation: `end_date >= start_date`, and no overlapping effective-date windows for the same account name within a household
- Closing an account sets `effective_end_date` rather than deleting; closed accounts remain visible under an "All / Closed" filter

### Balance Snapshots & Forward-Fill
- Net worth is built from discrete dated snapshots per account, not a continuous ledger
- Missing days between snapshots are forward-filled from the last known snapshot for display/aggregation purposes only — never filled *before* an account's first real snapshot, and the underlying data model must retain which points are real vs. filled so the UI can mark real snapshot dates distinctly on charts
- Staleness = no snapshot within a configurable threshold (default 30 days), computed per account, surfaced as a household-level banner and per-account in the update flow

### Income — Effective-Dated Records
- Income is per-person, per-record, with effective date ranges; a raise or job change is a **new record**, never a mutated one
- Overlap check: new record dates must not collide with an existing open/closed record for the same person; UI should offer "end the previous record the day before" as a resolvable conflict, not a hard block

### CSV Import Pipeline
- Three-phase, no-partial-write pipeline: **parse/map → preview → commit**. No rows are persisted until the final confirm step
- Deduplication fingerprint: `date + merchant + amount + note` (not a DB unique constraint alone — must be computed at preview time before any insert)
- Malformed rows are surfaced individually (not silently dropped) and downloadable as a corrected re-upload file
- Column mapping fallback needed when headers don't match the expected schema; must also support mapping distinct CSV "Account" string values to real `account_id`s
- Imports are group-undoable, scoped by `source_file` — undo must cleanly remove exactly the rows from that import batch, not touch dedup-matched pre-existing rows
- Same pipeline (and UI) must work on mobile — don't build browser-only upload assumptions (e.g., relying on drag-and-drop without a file-picker fallback)

### KPI Scorecard — Computed Metrics
11 metrics, each with: a formula, a set of inputs consumed (which accounts/date range), a household-configurable threshold set (red/yellow/green boundaries), and a history series for trend display.
- **Safety:** emergency fund (liquid balances ÷ avg monthly expense — liquid account set and expense basis window are both configurable), liquidity ratio, housing cost ratio (front-end DTI style)
- **Growth:** savings rate, retirement contribution rate, net worth growth (YoY), FI progress (current net worth ÷ FI number)
- **Debt & Mix:** debt-to-income, debt payoff runway, net worth, allocation mix
- Threshold and parameter changes must re-color the metric everywhere it's displayed (Overview tiles, Scorecard, mobile), not just in the detail panel — treat thresholds as a single source of truth, not a per-view constant

### Calculators & Scenarios
- Seven calculators share one input→result→chart→schedule layout: compound growth, debt payoff, emergency fund, mortgage/amortization, house affordability, retirement/FI, rebalancing (optional/flagged feature)
- Calculators pre-populate from live household data (real account balances, mortgage terms, income) — need a data-binding layer that maps calculator inputs to source records, plus a "reset to my numbers" that re-pulls current values
- "Save as scenario" persists the calculator's input set as a named, editable record — this is the *only* write path into the scenarios table (don't let scenario creation and calculator input duplicate schemas)
- Retirement scenarios project year-by-year balance with a depletion point; multiple scenarios render as overlaid lines for comparison
- Scenarios can parameterize the Scorecard's "at retirement" projected view, not just their own screen

### Empty States
Every data-dependent view needs an explicit empty state, not a blank chart:
- Net worth chart: fewer than 2 snapshots → prompt to record a second balance
- Cash flow: zero transactions → prompt to import CSV (net worth must still function without any transaction data)
- Balances table: zero accounts → prompt to add an account or import history

### Mobile Parity
- Mobile is not a reduced feature set — CSV import, calculators, scenarios, and settings all need mobile-equivalent flows, not "desktop only" gates
- Layout differences only: wide tables → stacked cards; comparison tables pin the label column and scroll horizontally instead of collapsing columns
- Bottom nav: Overview, Trends, Update (primary action, center-positioned), Plan, More (houses Accounts/Income/Transactions/Settings/Import)

---

## 3. Technical Stack (decided)

- **Database**: **Supabase (Postgres)**, as specified in Section 1. Use `supabase-py` or a direct Postgres connection (SQLAlchemy/`psycopg2`) — be consistent across the codebase. Enable Row Level Security on every table.
- **Application framework**: agent's choice of a Python or JS/TS web framework suited to deployment on Render (e.g., FastAPI + a lightweight frontend, or a full-stack framework like Next.js). Whatever is chosen, keep a clean separation between the data-access layer (Supabase queries) and the financial calculation logic (calculators, forward-fill, KPI formulas), so the math can be unit-tested independently of the web layer.
- **Hosting**: **Render**, deployed as a web service (or separate frontend/backend services if the chosen framework has a natural split — e.g., a Render Web Service for the API and a Render Static Site or second Web Service for the frontend). Store the Supabase connection string/API keys as Render environment variables — never commit credentials to the repo.
- **Keep-alive**: Render's free tier spins web services down after a period of inactivity, causing slow "cold start" responses on the next request — unacceptable for a daily-use household app. To prevent this:
  - Add a **GitHub Actions workflow** (e.g., `.github/workflows/keep-alive.yml`) that runs on a **daily `cron` schedule** and sends an HTTP request to the deployed app's URL (a simple `curl` or `requests.get()` against a lightweight health-check endpoint is sufficient to register activity and prevent the service from spinning down).
  - The workflow should also support `workflow_dispatch` for manual triggering/testing.
  - Document the app's public URL as a required GitHub Actions secret or repo variable (`RENDER_APP_URL`) so it isn't hardcoded, and note that the schedule should be timed to run at least once every 24 hours, comfortably inside whatever inactivity window Render's free tier currently enforces.
  - Include this workflow file as part of the deliverables (Section 4), not as an afterthought — it's required for the app to be reliably available.
- **Caching**: cache expensive read queries (e.g., the forward-filled net worth time series) at the application layer rather than recomputing on every request; invalidate on writes to `balances`/`accounts`.
- **Date handling**: use native Postgres `date` types throughout; treat `'9999-12-31'` as "open-ended," not a literal chart data point.
- **Forward-fill logic for balances** and **effective-date-window logic for Accounts/Income** are the two trickiest pieces of business logic — write these as well-tested, isolated utility functions (or well-tested SQL) before building UI on top of them.
- **Auth**: custom, invite-only, hashed-password login backed by the `users` table (see Section 1) — **not** Google OAuth and **not** a single shared password. Use `bcrypt` (or `passlib`) for hashing both passwords and security-question answers. Enforce a **1-hour inactivity session timeout**, and support security-question-based password reset (no email/SMS required).
- **Currency/rounding**: use Postgres `NUMERIC` (not `float`) for all money columns to avoid floating-point drift; keep the same precision discipline in the application layer.

---

## 4. Deliverables

1. Working application, deployed to Render (public GitHub repo), connected to a Supabase Postgres database.
2. A setup guide covering: Supabase project creation, running the SQL schema (Section 1) to create tables and RLS policies, obtaining API keys/connection string, Render deployment steps, and configuring environment variables/secrets.
3. The GitHub Actions keep-alive workflow (`.github/workflows/keep-alive.yml`), including setup instructions for the `RENDER_APP_URL` secret/variable and the health-check endpoint it pings.
4. An **admin/invite utility** (can be a simple script or an admin-only page gated to the owner's `user_id`) for adding new `users` rows (`user_id`, `household_id`, `household_name`, `username`, `status = 'invited'`) so friends can be invited without touching the database by hand.
5. Seed/example data loader compatible with the schema above (the household has historical Accounts, Income, and Balances data plus EveryDollar CSV transaction exports to import), tagged with a `household_id`.
6. Brief documentation of the KPI formulas and benchmark thresholds used, so users can audit the math.

---

## 5. Design Decisions Log (all resolved — for reference, not for the coding agent to re-litigate)

- Database: Supabase (Postgres), not Google Sheets.
- Hosting: Render, not Streamlit Community Cloud.
- Session timeout: 1 hour of inactivity.
- Password reset: security question, hashed, no email/SMS.
- Households have a display name (`household_name`) in addition to `household_id`.
- One user per household (not multi-user households) — scenarios and all other data are implicitly private per household.
- Transactions are not linked to Accounts for v1; manual mapping is a documented future enhancement.
- KPI health-indicator thresholds use standard, widely-cited personal-finance benchmarks (Section 2.6).

This prompt is considered final and ready to hand to a coding agent.