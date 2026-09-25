-- ============================================================================
-- ANNASETU — ADMIN PROVISIONING & ACCOUNT LIFECYCLE (Migration 004)
-- Purely additive: extends 001_schema.sql, never drops or rewrites existing
-- tables/columns. Existing Farmer/Gov-Admin/Operator/CSC/booking/queue/
-- verification/RLS/procurement behavior is unaffected.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ACCOUNT LIFECYCLE (spec §13, §15) — added to `users`, the one table
-- shared by every role, so status/first-login logic lives in exactly one
-- place regardless of role.
-- ----------------------------------------------------------------------------

create type account_status as enum ('pending', 'active', 'suspended', 'disabled', 'deactivated');

alter table users
  add column if not exists account_status account_status not null default 'active',
  add column if not exists must_change_password boolean not null default false,
  add column if not exists created_by uuid references users(id),
  add column if not exists activated_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists mobile_country_code text not null default '+91',
  add column if not exists mobile_number_normalized text;

-- One canonical number per account; null allowed for accounts that only
-- ever used email (self-registered farmers from the original signup flow).
create unique index if not exists idx_users_mobile_normalized
  on users (mobile_number_normalized) where mobile_number_normalized is not null;

-- ----------------------------------------------------------------------------
-- Column protection (audit note): must_change_password, account_status,
-- created_by, activated_at, and suspended_at must NEVER be settable by a
-- plain self-UPDATE through RLS — that would let a client clear
-- must_change_password without ever actually changing the password, or
-- self-reactivate a suspended account. RLS is row-level, not column-level,
-- so this is enforced with a trigger instead: any UPDATE on `users` reverts
-- these five columns to their previous values UNLESS the session has set
-- app.bypass_protected_columns = 'true' for the duration of the statement,
-- which only the SECURITY DEFINER functions below ever do, right before the
-- specific UPDATE that is allowed to touch them.
-- ----------------------------------------------------------------------------

create or replace function protect_account_lifecycle_columns()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.bypass_protected_columns', true), '') <> 'true' then
    new.account_status := old.account_status;
    new.must_change_password := old.must_change_password;
    new.created_by := old.created_by;
    new.activated_at := old.activated_at;
    new.suspended_at := old.suspended_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_account_lifecycle on users;
create trigger trg_protect_account_lifecycle
  before update on users
  for each row execute function protect_account_lifecycle_columns();

-- ----------------------------------------------------------------------------
-- 2. GOVERNMENT ADMIN HIERARCHY + JURISDICTION (spec §1, §19)
-- ----------------------------------------------------------------------------

create type gov_admin_role as enum ('bdo', 'sdo');

alter table government_admins
  add column if not exists admin_role gov_admin_role not null default 'bdo',
  add column if not exists jurisdiction_district_id uuid references districts(id),
  add column if not exists jurisdiction_sub_district_id uuid references sub_districts(id);

-- jurisdiction_state_id already existed (001_schema.sql). Scope semantics:
--   sdo: authorized across jurisdiction_district_id (whole district)
--   bdo: authorized across jurisdiction_sub_district_id (one block)
-- A row with neither set has no jurisdiction and is denied by default
-- (fail-closed — see admin_jurisdiction_covers() below), unless
-- jurisdiction_state_id alone is set for a deliberately state-wide account.

-- ----------------------------------------------------------------------------
-- 3. CSC / CENTRE OPERATOR WORK DETAILS (spec §6, §8)
-- ----------------------------------------------------------------------------

alter table csc_operators
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists designation text,
  add column if not exists district_id uuid references districts(id),
  add column if not exists sub_district_id uuid references sub_districts(id),
  add column if not exists village_or_town_id uuid,
  add column if not exists work_address text,
  add column if not exists joining_date date;

alter table centre_operators
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists designation text,
  add column if not exists joining_date date;

-- ----------------------------------------------------------------------------
-- 4. PROCUREMENT CENTRE OFFICIAL / VERIFICATION DETAILS (spec §7)
-- ----------------------------------------------------------------------------

create type centre_verification_status as enum ('pending', 'verified', 'rejected');

alter table procurement_centres
  add column if not exists centre_type text,
  add column if not exists controlling_authority text,
  add column if not exists contact_number text,
  add column if not exists official_email citext,
  add column if not exists working_days text[] not null default array['MO','TU','WE','TH','FR','SA'],
  add column if not exists verification_status centre_verification_status not null default 'pending',
  add column if not exists created_by uuid references users(id);

-- ----------------------------------------------------------------------------
-- 5. DOCUMENT VERIFICATION STATUS (spec §5)
-- ----------------------------------------------------------------------------

create type document_status as enum (
  'pending', 'uploaded', 'under_review', 'verified', 'rejected', 'correction_required', 'expired'
);

alter table farmer_documents
  add column if not exists status document_status not null default 'uploaded',
  add column if not exists verified_by uuid references users(id),
  add column if not exists verified_at timestamptz,
  add column if not exists rejection_reason text;

-- ----------------------------------------------------------------------------
-- 6. FARMER VERIFICATION STATUS — add SUBMITTED and SUSPENDED (spec §5)
-- Existing values (draft/under_verification/approved/correction_required/
-- rejected) are untouched; this only widens the enum.
-- ----------------------------------------------------------------------------

alter type verification_status add value if not exists 'submitted' after 'draft';
alter type verification_status add value if not exists 'suspended';

-- ----------------------------------------------------------------------------
-- 7. AUDIT LOG JURISDICTION FIELD (spec §18)
-- ----------------------------------------------------------------------------

alter table audit_logs
  add column if not exists jurisdiction_id uuid;
