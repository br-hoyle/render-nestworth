-- ============================================================================
-- NestWorth schema — run this whole file once in the Supabase SQL editor.
-- Safe to re-run: every statement is guarded (IF NOT EXISTS / DROP ... IF EXISTS).
--
-- RLS PATTERN (read this before running in a fresh project):
--   The app connects with TWO different Postgres roles:
--     1. The default `postgres` role (Supabase's connection string) — bypasses RLS by
--        virtue of being the table owner. Used ONLY for auth lookups that happen before
--        any household session exists (login, account setup, forgot-password) and for
--        admin invite creation. There's no "current household" to scope those queries to.
--     2. `app_user` — a role you create below with NO special privileges, used for every
--        other request. FORCE ROW LEVEL SECURITY is set on the tenant-data tables, so even
--        a bug in the application (a forgotten WHERE clause) cannot leak cross-household
--        rows — Postgres itself blocks it based on the `app.current_household_id` session
--        setting the backend sets at the start of every such request's transaction.
--   `users` is deliberately NOT filtered by household in RLS: a login-by-username lookup
--   happens before any household is known, which is inherent to any custom-auth system, not
--   a tenant-isolation gap. The tenant-isolation-sensitive tables are: accounts, income,
--   balances, transactions, scenarios, household_settings.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. users (auth / tenancy)
-- ----------------------------------------------------------------------------
-- household_name and username are anonymized at rest (see backend/app/security.py):
--   household_name    — Fernet ciphertext (encrypt_pii/decrypt_pii). Reversible, since the
--                        household itself still needs to see its own display name; the key
--                        lives only in backend env vars, never in the database.
--   username_lookup_hash — HMAC-SHA256(username, pepper) via hash_username(). Deterministic
--                        and one-way (unlike bcrypt), so it can back a WHERE lookup and a
--                        UNIQUE constraint. This is what every login/signup/forgot-password
--                        query matches against.
--   username_encrypted — Fernet ciphertext of the same username, decrypted only for the
--                        admin Invites page (the owner already chose these values themselves
--                        when creating an invite).
-- Nobody browsing this table directly (Supabase SQL editor, a backup, etc.) can read either
-- field back to a real username or display name without the app's own encryption key.
create table if not exists users (
    user_id uuid primary key default gen_random_uuid(),
    household_id uuid not null unique,
    household_name text not null,
    username_lookup_hash text not null unique,
    username_encrypted text not null,
    password_hash text,
    security_question text,
    security_answer_hash text,
    status text not null default 'invited' check (status in ('invited', 'active')),
    created_date timestamptz not null default now()
);

-- Upgrade path for a table created before the anonymization above (safe to re-run): add the
-- new columns as nullable so this runs cleanly against existing rows, which still have their
-- old plaintext `username` column. Do NOT add NOT NULL/UNIQUE or drop `username` here — that
-- has to wait until every row is backfilled, which is what
-- backend/scripts/migrate_anonymize_users.py does in one pass (backfill, then finalize).
alter table users add column if not exists username_lookup_hash text;
alter table users add column if not exists username_encrypted text;

-- ----------------------------------------------------------------------------
-- 2. accounts (Type-2 slowly changing dimension)
-- ----------------------------------------------------------------------------
create table if not exists accounts (
    account_id uuid primary key default gen_random_uuid(),
    household_id uuid not null references users(household_id),
    balance_type text not null check (balance_type in ('asset', 'liability')),
    institution_name text not null,
    category text not null,
    account_type text not null,
    account_name text not null,
    effective_start_date date not null,
    effective_end_date date not null default '9999-12-31',
    unique (household_id, account_name, effective_start_date)
);
create index if not exists idx_accounts_household on accounts (household_id);

-- ----------------------------------------------------------------------------
-- 3. income
-- ----------------------------------------------------------------------------
create table if not exists income (
    income_id uuid primary key default gen_random_uuid(),
    household_id uuid not null references users(household_id),
    individual text not null,
    company text not null,
    income numeric(14, 2) not null,
    effective_start_date date not null,
    effective_end_date date not null default '9999-12-31'
);
create index if not exists idx_income_household on income (household_id);

-- ----------------------------------------------------------------------------
-- 4. balances (irregular point-in-time snapshots)
-- ----------------------------------------------------------------------------
create table if not exists balances (
    balance_id uuid primary key default gen_random_uuid(),
    household_id uuid not null references users(household_id),
    account_id uuid not null references accounts(account_id),
    full_date date not null,
    balance numeric(14, 2) not null,
    unique (account_id, full_date)
);
create index if not exists idx_balances_household_date on balances (household_id, full_date);

-- ----------------------------------------------------------------------------
-- 5. transactions
-- ----------------------------------------------------------------------------
create table if not exists transactions (
    transaction_id uuid primary key default gen_random_uuid(),
    household_id uuid not null references users(household_id),
    date date not null,
    "group" text,
    item text,
    type text not null check (type in ('income', 'expense')),
    merchant text,
    account_name text,
    -- NOTE: account_name is intentionally NOT a foreign key to accounts (see CLAUDE.md).
    -- Future enhancement slot: add `account_id uuid references accounts(account_id)` here,
    -- populated by a manual mapping step during import, without touching this column.
    amount numeric(14, 2) not null,
    note text,
    source_file text,
    dedup_fingerprint text not null,
    unique (household_id, dedup_fingerprint)
);
create index if not exists idx_transactions_household_date on transactions (household_id, date);
create index if not exists idx_transactions_source_file on transactions (household_id, source_file);

-- ----------------------------------------------------------------------------
-- 6. scenarios
-- ----------------------------------------------------------------------------
create table if not exists scenarios (
    scenario_id uuid primary key default gen_random_uuid(),
    household_id uuid not null references users(household_id),
    scenario_type text not null check (scenario_type in ('retirement', 'house')),
    scenario_name text not null,
    assumptions jsonb not null,
    created_date timestamptz not null default now(),
    updated_date timestamptz not null default now()
);
create index if not exists idx_scenarios_household on scenarios (household_id);

-- ----------------------------------------------------------------------------
-- 7. household_settings — ADDITION beyond CLAUDE.md's 6 tables.
-- Single source of truth for household-configurable preferences: stale threshold, default
-- date range, liquid-account set, per-KPI thresholds, FI-number assumption, expense basis.
-- ----------------------------------------------------------------------------
create table if not exists household_settings (
    household_id uuid primary key references users(household_id),
    settings jsonb not null default '{}'::jsonb,
    updated_date timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 8. transaction_categories — ADDITION (backlog pass 2).
-- Maps a household's transaction `group`/`item` text values to a 50/30/20-style flow_type.
-- item = '' means "applies to the whole group" (no NULL-in-primary-key ambiguity).
-- Powers: the fixed/variable (needs/wants) split, the 50/30/20 rule tracking, Capital
-- Deployment Rate's "savings" bucket, and Liquid Runway's essential-expense basis.
-- ----------------------------------------------------------------------------
create table if not exists transaction_categories (
    household_id uuid not null references users(household_id),
    "group" text not null,
    item text not null default '',
    flow_type text not null check (flow_type in ('needs', 'wants', 'savings', 'transfer', 'other')),
    primary key (household_id, "group", item)
);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table users enable row level security;
alter table accounts enable row level security;
alter table income enable row level security;
alter table balances enable row level security;
alter table transactions enable row level security;
alter table scenarios enable row level security;
alter table household_settings enable row level security;
alter table transaction_categories enable row level security;

alter table accounts force row level security;
alter table income force row level security;
alter table balances force row level security;
alter table transactions force row level security;
alter table scenarios force row level security;
alter table household_settings force row level security;
alter table transaction_categories force row level security;

-- users: permissive by design (see note at top of file) — the trusted backend role needs
-- unrestricted username lookups pre-session. This is the app's own service connection, not
-- a publicly reachable Supabase anon/authenticated key.
drop policy if exists users_all on users;
create policy users_all on users for all using (true) with check (true);

drop policy if exists accounts_tenant_isolation on accounts;
create policy accounts_tenant_isolation on accounts for all
    using (household_id = current_setting('app.current_household_id', true)::uuid)
    with check (household_id = current_setting('app.current_household_id', true)::uuid);

drop policy if exists income_tenant_isolation on income;
create policy income_tenant_isolation on income for all
    using (household_id = current_setting('app.current_household_id', true)::uuid)
    with check (household_id = current_setting('app.current_household_id', true)::uuid);

drop policy if exists balances_tenant_isolation on balances;
create policy balances_tenant_isolation on balances for all
    using (household_id = current_setting('app.current_household_id', true)::uuid)
    with check (household_id = current_setting('app.current_household_id', true)::uuid);

drop policy if exists transactions_tenant_isolation on transactions;
create policy transactions_tenant_isolation on transactions for all
    using (household_id = current_setting('app.current_household_id', true)::uuid)
    with check (household_id = current_setting('app.current_household_id', true)::uuid);

drop policy if exists scenarios_tenant_isolation on scenarios;
create policy scenarios_tenant_isolation on scenarios for all
    using (household_id = current_setting('app.current_household_id', true)::uuid)
    with check (household_id = current_setting('app.current_household_id', true)::uuid);

drop policy if exists household_settings_tenant_isolation on household_settings;
create policy household_settings_tenant_isolation on household_settings for all
    using (household_id = current_setting('app.current_household_id', true)::uuid)
    with check (household_id = current_setting('app.current_household_id', true)::uuid);

drop policy if exists transaction_categories_tenant_isolation on transaction_categories;
create policy transaction_categories_tenant_isolation on transaction_categories for all
    using (household_id = current_setting('app.current_household_id', true)::uuid)
    with check (household_id = current_setting('app.current_household_id', true)::uuid);

-- ============================================================================
-- app_user role — the restricted role the backend uses for all household-scoped requests.
-- Replace the password below before running, then use it to build TENANT_DATABASE_URL.
-- ============================================================================
do $$
begin
    if not exists (select from pg_catalog.pg_roles where rolname = 'app_user') then
        create role app_user with login password 'CHANGE_ME_STRONG_PASSWORD';
    end if;
end
$$;

grant usage on schema public to app_user;
grant select, insert, update, delete on
    users, accounts, income, balances, transactions, scenarios, household_settings,
    transaction_categories
    to app_user;
