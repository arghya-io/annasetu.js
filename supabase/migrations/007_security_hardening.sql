-- ============================================================================
-- ANNASETU — SECURITY HARDENING (Migration 007)
-- Additive/corrective over 001–006. Safe to run once, after 006.
--
-- What this fixes (see README §"Security model" for the full list):
--   1. users.role / is_active / mobile columns were client-updatable via
--      users_update_self -> any signed-in user could make themselves a
--      government admin. Now: column grants + trigger (current_user based).
--   2. Farmers could set their own farmer_profiles.verification_status
--      (FOR ALL owner policy). Now: every farmer write goes through a
--      SECURITY DEFINER RPC (008); clients keep SELECT only.
--   3. admin_jurisdiction_covers() returned NULL for targets without a
--      location and `if not NULL` did not raise -> jurisdiction checks
--      failed OPEN (e.g. any BDO could reset any admin's password). Now
--      null-safe and fail-closed, and admins can no longer act on admins.
--   4. Suspended / must-change-password accounts were only blocked by the
--      Next.js middleware. Now every RLS helper and RPC checks account state.
--   5. Gov-admin / CSC reads were country-wide. Now jurisdiction-scoped.
--   6. `current_date` (UTC on Supabase) was used for IST business dates,
--      and a non-immutable CHECK on appointments broke UPDATEs after the
--      procurement date. Now IST helpers and no CHECK on current_date.
--   7. SECURITY DEFINER functions had no fixed search_path and PUBLIC
--      EXECUTE. Now pinned and explicitly granted (grants block in 008).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. TIME HELPERS — all business dates are Indian Standard Time.
-- ----------------------------------------------------------------------------

create or replace function app_today()
returns date language sql stable set search_path = pg_catalog as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

create or replace function app_now_local()
returns timestamp language sql stable set search_path = pg_catalog as $$
  select now() at time zone 'Asia/Kolkata'
$$;

create or replace function app_local_ts(p_date date, p_time time)
returns timestamptz language sql stable set search_path = pg_catalog as $$
  select (p_date + p_time) at time zone 'Asia/Kolkata'
$$;

-- ----------------------------------------------------------------------------
-- 1. SCHEMA FIXES
-- ----------------------------------------------------------------------------

-- The original CHECK (procurement_date >= current_date) is re-evaluated on
-- EVERY update of the row, so once the date passed, nothing (no_show,
-- completion across midnight, backfills) could update the appointment, and
-- pg_dump/restore of old rows fails. The window is enforced at INSERT time by
-- enforce_booking_window() + create_booking() instead.
do $$
declare
  r record;
begin
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.appointments'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%current_date%'
  loop
    execute format('alter table public.appointments drop constraint %I', r.conname);
  end loop;
end
$$;

-- One active booking per farmer + crop + date (stops capacity hoarding).
create unique index if not exists uq_appointments_farmer_crop_date_active
  on appointments (farmer_id_user, procurement_crop_id, procurement_date)
  where status in ('booked', 'confirmed', 'checked_in', 'in_progress');

alter table audit_logs
  add column if not exists jurisdiction_sub_district_id uuid;

-- Help requests are routed to CSC operators by DISTRICT so that a farmer who
-- has not finished registration (and therefore has no farmer_profiles row)
-- can still reach the CSC office serving them.
-- Officer-recorded identity document note for admin-provisioned farmers (the
-- old flow wrote a bogus farmer_documents row with a fake storage path).
alter table farmer_id_records
  add column if not exists identity_document_note text;

alter table help_requests
  add column if not exists district_id uuid references districts(id),
  add column if not exists resolution_note text;

-- ----------------------------------------------------------------------------
-- 2. ROLE / ACCOUNT-STATE HELPERS
-- All are SECURITY DEFINER with a pinned search_path so they can read `users`
-- without recursing through its own RLS policies, and so a hostile
-- search_path can never redirect them. Every helper treats an account that is
-- suspended / pending / disabled / must-change-password as having NO role.
-- ----------------------------------------------------------------------------

create or replace function account_is_usable(p_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select u.is_active and u.account_status = 'active' and not u.must_change_password
       from users u where u.id = p_user),
    false)
$$;

create or replace function current_role_is(p_role app_role)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select u.role = p_role and u.is_active and u.account_status = 'active' and not u.must_change_password
       from users u where u.id = auth.uid()),
    false)
$$;

create or replace function is_farmer()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select current_role_is('farmer')
$$;

-- A government_admin is only real if a government_admins row exists (the row
-- carries the jurisdiction). Role alone is never enough.
create or replace function is_gov_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select current_role_is('government_admin')
     and exists (select 1 from government_admins g where g.user_id = auth.uid())
$$;

-- SDO or a state-wide admin: may edit master data such as crops / MSP.
create or replace function is_senior_gov_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select is_gov_admin()
     and exists (
       select 1 from government_admins g
        where g.user_id = auth.uid()
          and (g.admin_role = 'sdo' or g.jurisdiction_state_id is not null))
$$;

create or replace function is_centre_operator()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select current_role_is('centre_operator')
     and exists (select 1 from centre_operators c where c.user_id = auth.uid())
$$;

create or replace function is_csc_operator()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select current_role_is('csc_operator')
     and exists (select 1 from csc_operators c where c.user_id = auth.uid())
$$;

create or replace function current_operator_centre_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select c.centre_id
    from centre_operators c
   where c.user_id = auth.uid()
     and current_role_is('centre_operator')
$$;

-- ----------------------------------------------------------------------------
-- 3. JURISDICTION — null-safe and fail-closed.
-- ----------------------------------------------------------------------------

create or replace function admin_jurisdiction_covers(
  p_state_id uuid, p_district_id uuid, p_sub_district_id uuid
) returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_admin government_admins%rowtype;
  v_district uuid := p_district_id;
  v_state uuid := p_state_id;
begin
  select * into v_admin from government_admins where user_id = auth.uid();
  if not found then
    return false;
  end if;

  -- Fill in the missing ancestors from the most specific id we were given.
  if v_district is null and p_sub_district_id is not null then
    select sd.district_id into v_district from sub_districts sd where sd.id = p_sub_district_id;
  end if;
  if v_state is null and v_district is not null then
    select d.state_id into v_state from districts d where d.id = v_district;
  end if;

  if v_admin.admin_role = 'sdo' and v_admin.jurisdiction_district_id is not null then
    return v_district is not null and v_admin.jurisdiction_district_id = v_district;
  end if;

  if v_admin.admin_role = 'bdo' and v_admin.jurisdiction_sub_district_id is not null then
    return p_sub_district_id is not null and v_admin.jurisdiction_sub_district_id = p_sub_district_id;
  end if;

  if v_admin.jurisdiction_state_id is not null then
    return v_state is not null and v_admin.jurisdiction_state_id = v_state;
  end if;

  return false; -- fail-closed: no jurisdiction configured, no access
end;
$$;

create or replace function assert_gov_admin_jurisdiction(
  p_state_id uuid, p_district_id uuid, p_sub_district_id uuid
) returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_gov_admin() then
    raise exception 'NOT_A_GOVERNMENT_ADMIN';
  end if;
  -- coalesce: a NULL result must DENY, never fall through `if not NULL`.
  if not coalesce(admin_jurisdiction_covers(p_state_id, p_district_id, p_sub_district_id), false) then
    raise exception 'OUTSIDE_JURISDICTION: you are not authorized to manage this location';
  end if;
end;
$$;

-- Raises INVALID_LOCATION unless state > district > sub-district (> village/town) is a real chain.
create or replace function validate_location_chain(
  p_state_id uuid, p_district_id uuid, p_sub_district_id uuid,
  p_village_or_town_id uuid default null, p_kind text default null
) returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from districts d where d.id = p_district_id and d.state_id = p_state_id) then
    raise exception 'INVALID_LOCATION: district does not belong to the selected state';
  end if;
  if p_sub_district_id is not null
     and not exists (select 1 from sub_districts s where s.id = p_sub_district_id and s.district_id = p_district_id) then
    raise exception 'INVALID_LOCATION: sub-district does not belong to the selected district';
  end if;
  if p_village_or_town_id is not null then
    if p_kind = 'village' then
      if not exists (select 1 from villages v where v.id = p_village_or_town_id and v.sub_district_id = p_sub_district_id) then
        raise exception 'INVALID_LOCATION: village does not belong to the selected sub-district';
      end if;
    elsif p_kind = 'town' then
      if not exists (select 1 from towns t where t.id = p_village_or_town_id and t.sub_district_id = p_sub_district_id) then
        raise exception 'INVALID_LOCATION: town does not belong to the selected sub-district';
      end if;
    else
      raise exception 'INVALID_LOCATION: village/town kind is required';
    end if;
  end if;
end;
$$;

-- Location of a NON-ADMIN account (farmer / CSC operator / centre operator).
-- Returns no rows for government admins or unknown users, so callers that
-- `if not found` fail closed.
create or replace function resolve_account_jurisdiction(p_user_id uuid)
returns table(state_id uuid, district_id uuid, sub_district_id uuid)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_role app_role;
begin
  select u.role into v_role from users u where u.id = p_user_id;
  if not found then
    return;
  end if;

  if v_role = 'farmer' then
    return query select fp.state_id, fp.district_id, fp.sub_district_id
      from farmer_profiles fp where fp.user_id = p_user_id;
  elsif v_role = 'csc_operator' then
    return query select d.state_id, co.district_id, co.sub_district_id
      from csc_operators co
      join districts d on d.id = coalesce(co.district_id, co.jurisdiction_district_id)
      where co.user_id = p_user_id;
  elsif v_role = 'centre_operator' then
    return query select pc.state_id, pc.district_id, pc.sub_district_id
      from centre_operators cop
      join procurement_centres pc on pc.id = cop.centre_id
      where cop.user_id = p_user_id;
  end if;
  -- government_admin: intentionally no rows.
end;
$$;

create or replace function account_in_admin_jurisdiction(p_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select is_gov_admin()
     and exists (
       select 1 from resolve_account_jurisdiction(p_user) j
        where admin_jurisdiction_covers(j.state_id, j.district_id, j.sub_district_id))
$$;

create or replace function admin_covers_farmer(p_farmer uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select is_gov_admin()
     and exists (
       select 1 from farmer_profiles fp
        where fp.user_id = p_farmer
          and admin_jurisdiction_covers(fp.state_id, fp.district_id, fp.sub_district_id))
$$;

create or replace function admin_covers_centre(p_centre uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select is_gov_admin()
     and exists (
       select 1 from procurement_centres pc
        where pc.id = p_centre
          and admin_jurisdiction_covers(pc.state_id, pc.district_id, pc.sub_district_id))
$$;

create or replace function csc_covers_farmer(p_farmer uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select is_csc_operator()
     and exists (
       select 1
         from csc_operators c
         join farmer_profiles fp on fp.user_id = p_farmer
        where c.user_id = auth.uid()
          and coalesce(c.district_id, c.jurisdiction_district_id) is not null
          and coalesce(c.district_id, c.jurisdiction_district_id) = fp.district_id)
$$;

-- ----------------------------------------------------------------------------
-- 4. PROTECT users COLUMNS
-- Clients (roles `authenticated` / `anon`) may change ONLY full_name and
-- face_verification_enabled. Enforced twice: column-level GRANTs below, and
-- this trigger (which keys off current_user, so it cannot be bypassed by a
-- session setting the way the old app.bypass_protected_columns flag could).
-- SECURITY DEFINER RPCs run as the function owner, so they pass.
-- ----------------------------------------------------------------------------

create or replace function protect_account_lifecycle_columns()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email
       or new.phone is distinct from old.phone
       or new.account_status is distinct from old.account_status
       or new.must_change_password is distinct from old.must_change_password
       or new.created_by is distinct from old.created_by
       or new.activated_at is distinct from old.activated_at
       or new.suspended_at is distinct from old.suspended_at
       or new.mobile_country_code is distinct from old.mobile_country_code
       or new.mobile_number_normalized is distinct from old.mobile_number_normalized then
      raise exception 'PROTECTED_COLUMN: this account attribute can only be changed by an administrator'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_account_lifecycle on users;
create trigger trg_protect_account_lifecycle
  before update on users
  for each row execute function protect_account_lifecycle_columns();

-- ----------------------------------------------------------------------------
-- 5. ACCOUNT LIFECYCLE RPCs (rewritten: null-safe, no admin-on-admin, no
-- self-targeting, account state enforced)
-- ----------------------------------------------------------------------------

create or replace function assert_admin_can_manage_account(p_user_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_role app_role;
  v_j record;
begin
  if not is_gov_admin() then
    raise exception 'NOT_A_GOVERNMENT_ADMIN';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'CANNOT_MANAGE_SELF';
  end if;

  select u.role into v_role from users u where u.id = p_user_id;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;
  if v_role = 'government_admin' then
    raise exception 'CANNOT_MANAGE_ADMIN_ACCOUNT: administrator accounts are not managed here';
  end if;

  select * into v_j from resolve_account_jurisdiction(p_user_id);
  if not found then
    raise exception 'OUTSIDE_JURISDICTION: this account has no location on record';
  end if;

  perform assert_gov_admin_jurisdiction(v_j.state_id, v_j.district_id, v_j.sub_district_id);
  return v_j.district_id;
end;
$$;

create or replace function suspend_account(p_user_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_district uuid;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED: enter a reason for the suspension';
  end if;
  v_district := assert_admin_can_manage_account(p_user_id);

  update users set account_status = 'suspended', suspended_at = now() where id = p_user_id;

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, jurisdiction_id, after_data)
    values (auth.uid(), 'government_admin', 'account.suspended', 'users', p_user_id,
            v_district, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function activate_account(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_district uuid;
begin
  v_district := assert_admin_can_manage_account(p_user_id);

  update users
     set account_status = 'active', activated_at = now(), suspended_at = null
   where id = p_user_id;

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, jurisdiction_id)
    values (auth.uid(), 'government_admin', 'account.activated', 'users', p_user_id, v_district);
end;
$$;

-- Step 1 of "regenerate initial password": authorization only, NO state change.
-- The server action runs this, then rotates the password via the Auth admin
-- API, then calls mark_password_regenerated() — so a failed rotation never
-- leaves an account flagged as if it had been reset.
create or replace function authorize_password_regeneration(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin_can_manage_account(p_user_id);
end;
$$;

create or replace function mark_password_regenerated(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_district uuid;
begin
  v_district := assert_admin_can_manage_account(p_user_id);

  update users set must_change_password = true where id = p_user_id;

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, jurisdiction_id)
    values (auth.uid(), 'government_admin', 'account.password_regenerated', 'users', p_user_id, v_district);
end;
$$;

-- First-login password change. The old complete_first_login_password_change()
-- was callable by ANY signed-in user without changing anything, which let a
-- must-change account skip the forced change. The replacement is callable by
-- the service role ONLY, from services/auth/first-login-service.ts, after that
-- action has verified the current password and rotated it.
drop function if exists complete_first_login_password_change();

create or replace function clear_must_change_password(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update users
     set must_change_password = false,
         activated_at = coalesce(activated_at, now())
   where id = p_user_id and must_change_password;

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, after_data)
    select u.id, u.role, 'account.first_login_password_changed', 'users', u.id, '{}'::jsonb
      from users u where u.id = p_user_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. PROVISIONING RPCs (jurisdiction check now runs BEFORE any account exists)
-- ----------------------------------------------------------------------------

-- Called by the provisioning server actions FIRST. Derives the state from the
-- district (never trusts a client-supplied state), validates the location
-- chain, and checks the caller's jurisdiction. Returns the derived state id.
create or replace function authorize_provisioning(
  p_district_id uuid, p_sub_district_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_state uuid;
begin
  if not is_gov_admin() then
    raise exception 'NOT_A_GOVERNMENT_ADMIN';
  end if;
  select d.state_id into v_state from districts d where d.id = p_district_id;
  if not found then
    raise exception 'INVALID_LOCATION: unknown district';
  end if;
  perform validate_location_chain(v_state, p_district_id, p_sub_district_id, null, null);
  perform assert_gov_admin_jurisdiction(v_state, p_district_id, p_sub_district_id);
  return v_state;
end;
$$;

-- Mobile uniqueness check for admins (the `users` table is now jurisdiction
-- scoped for reads, so a plain SELECT can no longer prove global uniqueness).
create or replace function mobile_number_in_use(p_normalized text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_gov_admin() then
    raise exception 'NOT_A_GOVERNMENT_ADMIN';
  end if;
  return exists (select 1 from users u where u.mobile_number_normalized = p_normalized);
end;
$$;

create or replace function log_account_provisioned(
  p_account_type text, p_account_id uuid, p_state_id uuid, p_district_id uuid, p_sub_district_id uuid
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_gov_admin_jurisdiction(p_state_id, p_district_id, p_sub_district_id);
  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id,
                          jurisdiction_id, jurisdiction_sub_district_id, after_data)
    values (auth.uid(), 'government_admin', 'account.created', 'users', p_account_id,
            p_district_id, p_sub_district_id, jsonb_build_object('account_type', p_account_type));
end;
$$;

drop function if exists create_procurement_centre_admin(
  text, text, uuid, uuid, uuid, text, text, numeric, integer, text, text, text);

create or replace function create_procurement_centre_admin(
  p_name text, p_code text, p_state_id uuid, p_district_id uuid, p_sub_district_id uuid,
  p_address text, p_centre_type text, p_daily_capacity_quintal numeric, p_counters_count integer,
  p_controlling_authority text, p_contact_number text, p_official_email text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_centre_id uuid;
  v_state uuid;
begin
  -- Derive + validate the location instead of trusting p_state_id.
  v_state := authorize_provisioning(p_district_id, p_sub_district_id);
  if p_state_id is not null and p_state_id <> v_state then
    raise exception 'INVALID_LOCATION: state does not match the selected district';
  end if;

  if coalesce(btrim(p_name), '') = '' or coalesce(btrim(p_code), '') = '' then
    raise exception 'INVALID_INPUT: centre name and code are required';
  end if;

  insert into procurement_centres (
    name, code, state_id, district_id, sub_district_id, address, centre_type,
    daily_capacity_quintal, counters_count, controlling_authority, contact_number,
    official_email, verification_status, created_by
  ) values (
    btrim(p_name), btrim(p_code), v_state, p_district_id, p_sub_district_id, p_address, p_centre_type,
    p_daily_capacity_quintal, greatest(coalesce(p_counters_count, 1), 1), p_controlling_authority, p_contact_number,
    p_official_email, 'verified', auth.uid()
  ) returning id into v_centre_id;

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id,
                          jurisdiction_id, jurisdiction_sub_district_id)
    values (auth.uid(), 'government_admin', 'centre.created', 'procurement_centres', v_centre_id,
            p_district_id, p_sub_district_id);

  return v_centre_id;
end;
$$;

-- Centre activate/deactivate + capacity edits by a jurisdiction-covered admin.
create or replace function update_centre_admin(
  p_centre_id uuid, p_is_active boolean, p_daily_capacity_quintal numeric, p_counters_count integer
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_c procurement_centres%rowtype;
begin
  select * into v_c from procurement_centres where id = p_centre_id for update;
  if not found then
    raise exception 'CENTRE_NOT_FOUND';
  end if;
  perform assert_gov_admin_jurisdiction(v_c.state_id, v_c.district_id, v_c.sub_district_id);

  if p_daily_capacity_quintal is not null and p_daily_capacity_quintal <= 0 then
    raise exception 'INVALID_INPUT: capacity must be positive';
  end if;
  if p_counters_count is not null and p_counters_count <= 0 then
    raise exception 'INVALID_INPUT: counters must be positive';
  end if;

  update procurement_centres
     set is_active = coalesce(p_is_active, is_active),
         daily_capacity_quintal = coalesce(p_daily_capacity_quintal, daily_capacity_quintal),
         counters_count = coalesce(p_counters_count, counters_count)
   where id = p_centre_id;

  -- Already-materialised daily capacity rows for today onwards follow the new
  -- capacity (never below what is already booked, to keep the CHECK valid).
  if p_daily_capacity_quintal is not null then
    update centre_daily_capacity
       set total_capacity_quintal = greatest(p_daily_capacity_quintal, booked_quantity_quintal)
     where centre_id = p_centre_id and capacity_date >= app_today();
  end if;

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id,
                          jurisdiction_id, jurisdiction_sub_district_id, after_data)
    values (auth.uid(), 'government_admin', 'centre.updated', 'procurement_centres', p_centre_id,
            v_c.district_id, v_c.sub_district_id,
            jsonb_build_object('is_active', p_is_active, 'daily_capacity_quintal', p_daily_capacity_quintal,
                               'counters_count', p_counters_count));
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY — rewrites
-- Principle: clients READ through RLS; every WRITE goes through a SECURITY
-- DEFINER RPC that validates input, checks account state and jurisdiction, and
-- writes the audit trail. So the old "owner FOR ALL" and "gov_admin FOR ALL"
-- policies are dropped and replaced with scoped SELECT policies.
-- ----------------------------------------------------------------------------

-- users -----------------------------------------------------------------
drop policy if exists users_select_self on users;
drop policy if exists users_update_self on users;
create policy users_select_scoped on users
  for select using (id = auth.uid() or account_in_admin_jurisdiction(id));
create policy users_update_self on users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- role tables ------------------------------------------------------------
drop policy if exists government_admins_self_and_peers_read on government_admins;
create policy government_admins_self_read on government_admins
  for select using (user_id = auth.uid());

drop policy if exists csc_operators_self_read on csc_operators;
create policy csc_operators_scoped_read on csc_operators
  for select using (user_id = auth.uid() or account_in_admin_jurisdiction(user_id));

drop policy if exists centre_operators_self_read on centre_operators;
create policy centre_operators_scoped_read on centre_operators
  for select using (user_id = auth.uid() or account_in_admin_jurisdiction(user_id));

-- farmer profile + related ----------------------------------------------
drop policy if exists farmer_profiles_owner_rw on farmer_profiles;
drop policy if exists farmer_profiles_gov_admin_read on farmer_profiles;
drop policy if exists farmer_profiles_csc_read on farmer_profiles;
create policy farmer_profiles_owner_select on farmer_profiles
  for select using (user_id = auth.uid());
create policy farmer_profiles_gov_admin_read on farmer_profiles
  for select using (admin_covers_farmer(user_id));
create policy farmer_profiles_csc_read on farmer_profiles
  for select using (csc_covers_farmer(user_id));

drop policy if exists farmer_id_records_owner_rw on farmer_id_records;
drop policy if exists farmer_id_records_gov_csc_read on farmer_id_records;
create policy farmer_id_records_owner_select on farmer_id_records
  for select using (farmer_id_user = auth.uid());
create policy farmer_id_records_gov_read on farmer_id_records
  for select using (admin_covers_farmer(farmer_id_user));
create policy farmer_id_records_csc_read on farmer_id_records
  for select using (csc_covers_farmer(farmer_id_user));

drop policy if exists farmer_verification_gov_admin_rw on farmer_verification;
create policy farmer_verification_gov_read on farmer_verification
  for select using (admin_covers_farmer(farmer_id_user));

drop policy if exists farmer_documents_owner_rw on farmer_documents;
drop policy if exists farmer_documents_gov_read on farmer_documents;
drop policy if exists farmer_documents_csc_read on farmer_documents;
drop policy if exists farmer_documents_gov_csc_read on farmer_documents;
create policy farmer_documents_owner_select on farmer_documents
  for select using (farmer_id_user = auth.uid());
create policy farmer_documents_gov_read on farmer_documents
  for select using (admin_covers_farmer(farmer_id_user));
create policy farmer_documents_csc_read on farmer_documents
  for select using (csc_covers_farmer(farmer_id_user));

drop policy if exists land_owner_details_owner_rw on land_owner_details;
drop policy if exists land_owner_details_gov_read on land_owner_details;
create policy land_owner_details_owner_select on land_owner_details
  for select using (farmer_id_user = auth.uid());
create policy land_owner_details_gov_read on land_owner_details
  for select using (admin_covers_farmer(farmer_id_user));

drop policy if exists land_records_owner_rw on land_records;
drop policy if exists land_records_gov_read on land_records;
create policy land_records_owner_select on land_records
  for select using (farmer_id_user = auth.uid());
create policy land_records_gov_read on land_records
  for select using (admin_covers_farmer(farmer_id_user));

drop policy if exists cultivation_records_owner_rw on cultivation_records;
drop policy if exists cultivation_records_gov_read on cultivation_records;
create policy cultivation_records_owner_select on cultivation_records
  for select using (farmer_id_user = auth.uid());
create policy cultivation_records_gov_read on cultivation_records
  for select using (admin_covers_farmer(farmer_id_user));

-- crops ------------------------------------------------------------------
drop policy if exists crops_gov_admin_write on crops;
drop policy if exists crops_gov_admin_update on crops;
create policy crops_senior_admin_insert on crops
  for insert with check (is_senior_gov_admin());
create policy crops_senior_admin_update on crops
  for update using (is_senior_gov_admin()) with check (is_senior_gov_admin());

drop policy if exists farmer_crops_owner_rw on farmer_crops;
drop policy if exists farmer_crops_gov_read on farmer_crops;
create policy farmer_crops_owner_select on farmer_crops
  for select using (farmer_id_user = auth.uid());
create policy farmer_crops_gov_read on farmer_crops
  for select using (admin_covers_farmer(farmer_id_user));

drop policy if exists procurement_crops_owner_insert_pending on procurement_crops;
drop policy if exists procurement_crops_gov_admin_rw on procurement_crops;
create policy procurement_crops_gov_read on procurement_crops
  for select using (admin_covers_farmer(farmer_id_user));

drop policy if exists crop_change_requests_owner_insert on crop_change_requests;
drop policy if exists crop_change_requests_gov_admin_rw on crop_change_requests;
create policy crop_change_requests_gov_read on crop_change_requests
  for select using (admin_covers_farmer(farmer_id_user));

-- centres ------------------------------------------------------------------
drop policy if exists procurement_centres_public_read on procurement_centres;
drop policy if exists procurement_centres_gov_admin_update on procurement_centres;
drop policy if exists procurement_centres_gov_admin_write on procurement_centres;
create policy procurement_centres_read on procurement_centres
  for select using (is_active or admin_covers_centre(id));
-- Centre edits go through update_centre_admin() (audited, jurisdiction-checked).

drop policy if exists centre_resources_gov_admin_write on centre_resources;
create policy centre_resources_gov_write on centre_resources
  for all using (admin_covers_centre(centre_id)) with check (admin_covers_centre(centre_id));

-- bookings / queue / processing (gov admin reads scoped by centre) ----------
drop policy if exists appointments_gov_admin_read on appointments;
create policy appointments_gov_admin_read on appointments
  for select using (admin_covers_centre(centre_id));

drop policy if exists queue_entries_gov_admin_read on queue_entries;
create policy queue_entries_gov_admin_read on queue_entries
  for select using (admin_covers_centre(centre_id));

drop policy if exists queue_events_gov_admin_read on queue_events;
create policy queue_events_gov_admin_read on queue_events
  for select using (
    exists (select 1 from queue_entries qe
             where qe.id = queue_events.queue_entry_id and admin_covers_centre(qe.centre_id)));

drop policy if exists procurement_records_gov_admin_read on procurement_records;
create policy procurement_records_gov_admin_read on procurement_records
  for select using (admin_covers_centre(centre_id));

drop policy if exists payment_records_gov_admin_read on payment_records;
create policy payment_records_gov_admin_read on payment_records
  for select using (
    exists (select 1 from procurement_records pr
             where pr.id = payment_records.procurement_record_id and admin_covers_centre(pr.centre_id)));

-- help requests / acknowledgements / audit ---------------------------------
drop policy if exists help_requests_farmer_rw on help_requests;
drop policy if exists help_requests_csc_rw on help_requests;
drop policy if exists help_requests_gov_admin_read on help_requests;
create policy help_requests_farmer_select on help_requests
  for select using (farmer_id_user = auth.uid() or raised_by = auth.uid());
create policy help_requests_csc_select on help_requests
  for select using (
    is_csc_operator()
    and (handled_by = auth.uid()
         or (district_id is not null
             and district_id = (select coalesce(c.district_id, c.jurisdiction_district_id)
                                  from csc_operators c where c.user_id = auth.uid()))));
create policy help_requests_gov_admin_read on help_requests
  for select using (
    (farmer_id_user is not null and admin_covers_farmer(farmer_id_user))
    or (district_id is not null and is_gov_admin() and admin_jurisdiction_covers(null, district_id, null)));

drop policy if exists acknowledgements_owner_insert on acknowledgements;
drop policy if exists acknowledgements_gov_admin_read on acknowledgements;
create policy acknowledgements_gov_admin_read on acknowledgements
  for select using (admin_covers_farmer(farmer_id_user));

drop policy if exists audit_logs_gov_admin_read on audit_logs;
create policy audit_logs_gov_admin_read on audit_logs
  for select using (
    is_gov_admin()
    and (actor_user_id = auth.uid()
         or admin_jurisdiction_covers(null, jurisdiction_id, jurisdiction_sub_district_id)));

-- ----------------------------------------------------------------------------
-- 8. TABLE PRIVILEGES — second layer under RLS.
-- Clients get SELECT (through RLS) and nothing else, except:
--   users          UPDATE (full_name, face_verification_enabled)
--   notifications  UPDATE (is_read)
--   face_templates full access to the owner's own row (feature disabled)
-- ----------------------------------------------------------------------------

revoke insert, update, delete, truncate on
  government_admins, csc_operators, centre_operators,
  farmer_profiles, farmer_id_records, farmer_verification, farmer_documents,
  land_owner_details, land_records, cultivation_records,
  crops, farmer_crops, procurement_crops, crop_change_requests,
  states, districts, sub_districts, villages, towns,
  procurement_centres, centre_resources, centre_daily_capacity,
  appointments, queue_entries, queue_events, procurement_records, payment_records,
  help_requests, acknowledgements, audit_logs
from anon, authenticated;

-- crops / centre_resources keep their (senior-admin / covered-admin) write policies,
-- so those two tables still need the privileges for `authenticated`.
grant insert, update on crops to authenticated;
grant insert, update, delete on centre_resources to authenticated;

revoke insert, update, delete, truncate on users, notifications from anon, authenticated;
grant update (full_name, face_verification_enabled) on users to authenticated;
grant update (is_read) on notifications to authenticated;

revoke insert, update, delete, truncate on face_templates from anon;
