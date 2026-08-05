# Supabase setup

NestWorth uses Supabase purely as a managed Postgres database — not Supabase Auth (the
app has its own invite-only login system, see `backend/app/routers/auth.py`).

## 1. Create the project

If you don't already have one: [supabase.com](https://supabase.com) → New project. Pick a
strong database password and save it somewhere safe — you'll need it below.

## 2. Run the schema

Open the Supabase dashboard → **SQL Editor** → paste the entire contents of
[`backend/sql/schema.sql`](../backend/sql/schema.sql) → Run.

Before running, replace the placeholder password in this line near the bottom of the file:

```sql
create role app_user with login password 'CHANGE_ME_STRONG_PASSWORD';
```

with a real, strong password of your choosing. You'll use it to build `TENANT_DATABASE_URL`
below. The script is safe to re-run (every statement is guarded with `IF NOT EXISTS` /
`DROP ... IF EXISTS`).

**Why two roles?** The default `postgres` connection (the "owner" role) bypasses Row Level
Security entirely — it's only used for the pre-login lookups (checking a username before any
household session exists) and the admin invite endpoint. Every other request runs as
`app_user`, a role with `FORCE ROW LEVEL SECURITY` on the tenant-data tables (`accounts`,
`income`, `balances`, `transactions`, `scenarios`, `household_settings`). The backend opens
one transaction per request on that connection and runs
`SELECT set_config('app.current_household_id', '<uuid>', true)` before the real query, and
Postgres itself blocks any row whose `household_id` doesn't match — even if application code
has a bug and forgets a `WHERE household_id = ...` clause. The `users` table is intentionally
exempt from that per-household filter (a login-by-username lookup has no household session
yet — that's inherent to bootstrapping any custom auth system, not a tenant-isolation gap).

Alternative to the SQL Editor: if you'd rather run it via a script (also lets a random
password be auto-generated for `app_user` instead of hand-editing the file), see
`backend/scripts/apply_schema.py` — it reads `DATABASE_URL` from `backend/.env` and applies
`schema.sql` directly.

**`username` and `household_name` are anonymized at rest**, the same way `password_hash`
already is: `username` is stored only as a deterministic HMAC-SHA256 (`username_lookup_hash`,
keyed with `USERNAME_HASH_PEPPER`) plus a separately-encrypted copy (`username_encrypted`)
used only to display it back on the admin Invites page; `household_name` is stored as Fernet
ciphertext (`PII_ENCRYPTION_KEY`). Neither is ever stored as plaintext, so browsing the raw
table doesn't tell you which household is which — see `backend/app/security.py`
(`hash_username`/`encrypt_pii`/`decrypt_pii`) and the comment above the `users` table in
`schema.sql`. Both env vars are required (fill them into `backend/.env`, generation commands
are in `.env.example`). If you're upgrading an existing deployment that predates this (its
`users` table still has a plaintext `username` column), run
`python scripts/migrate_anonymize_users.py` once, after backing up the database — it backfills
the new columns and drops the plaintext one.

## 3. Get your connection strings

Project Settings → Database → Connection string:

- **`DATABASE_URL`** — the default `postgres` role connection string (Session pooler or
  Direct connection both work; Direct is IPv6-only unless you're on the IPv4 add-on, so
  Session pooler is the safer default if you're not sure). Example:
  `postgresql://postgres:<password>@<host>:5432/postgres`
- **`TENANT_DATABASE_URL`** — the same host, but username `app_user` and the password you
  set in step 2:
  `postgresql://app_user:<password>@<host>:5432/postgres`

Put both into `backend/.env` (copy `backend/.env.example` if you haven't already).

## 4. Seed demo data (optional, recommended for first run)

From `backend/`, with your conda env active:

```bash
python scripts/apply_schema.py   # only if you haven't run the SQL manually
python scripts/seed.py
```

`seed.py` creates one demo household ("The Harts", username `harts`, status `invited`),
seven accounts (including a renamed and a closed one, to show off the Type-2 history), four
income records, ~3 years of monthly balance snapshots, and a sample EveryDollar-format CSV
at `backend/scripts/sample_everydollar_export.csv` for testing the import pipeline. It
prints a `household_id` — put that in `backend/.env` as `OWNER_HOUSEHOLD_ID` (this is the
household allowed to see `/admin/invites`).

Visit `/setup` in the running app and activate the `harts` account with a password of your
choosing to log in for the first time.

## 5. Inviting other households

Once the app owner's household is set up, invite friends either from the in-app
**More → Invites** page (owner-only — anyone else hitting that route gets a 404, not a 403)
or via the CLI:

```bash
python scripts/invite.py --household-name "Nguyen family" --username nguyens
```

Either way, this only creates a `status = 'invited'` row — the invitee still has to visit
`/setup` themselves and choose their own password and security question. Give them their
username out of band (text, call, etc.) — there's no email/SMS integration.
