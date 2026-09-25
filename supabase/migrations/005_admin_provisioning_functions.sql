-- ============================================================================
-- ANNASETU — ADMIN PROVISIONING FUNCTIONS (Migration 005)
-- All SECURITY DEFINER functions here re-derive the caller's role and
-- jurisdiction from the database itself via auth.uid() — never from a
-- client-supplied admin id, role, centre id, or jurisdiction (spec §25).
--
-- Supabase Auth account creation (the actual phone+password identity) is
-- NOT done in SQL — it goes through supabase.auth.admin.createUser() from a
-- server action using the service-role client (see
-- services/admin/provisioning-service.ts), because that's the only
-- correct way to get Auth's own secure password hashing (spec §29). The
-- functions here cover everything around that: authorization, jurisdiction,
-- mobile normalization, password format generation, and account lifecycle
-- metadata — the pieces that must never be trusted from the client.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. JURISDICTION (spec §19)
-- sdo: authorized across their whole jurisdiction_district_id.
-- bdo: authorized across their one jurisdiction_sub_district_id.
-- An admin row with neither set (and no jurisdiction_state_id) is denied by
-- default — fail-closed, not fail-open.
-- ----------------------------------------------------------------------------

create or replace function admin_jurisdiction_covers(
  p_state_id uuid, p_district_id uuid, p_sub_district_id uuid
) returns boolean language plpgsql stable as $$
declare
  v_admin government_admins%rowtype;
begin
  select * into v_admin from government_admins where user_id = auth.uid();
  if not found then
    return false;
  end if;

  if v_admin.admin_role = 'sdo' and v_admin.jurisdiction_district_id is not null then
    return v_admin.jurisdiction_district_id = p_district_id;
  end if;

  if v_admin.admin_role = 'bdo' and v_admin.jurisdiction_sub_district_id is not null then
    return v_admin.jurisdiction_sub_district_id = p_sub_district_id;
  end if;

  if v_admin.jurisdiction_state_id is not null then
    return v_admin.jurisdiction_state_id = p_state_id;
  end if;

  return false; -- fail-closed: no jurisdiction configured, no access
end;
$$;

create or replace function assert_gov_admin_jurisdiction(
  p_state_id uuid, p_district_id uuid, p_sub_district_id uuid
) returns void language plpgsql stable as $$
begin
  if not exists (select 1 from users where id = auth.uid() and role = 'government_admin' and is_active) then
    raise exception 'NOT_A_GOVERNMENT_ADMIN';
  end if;
  if not admin_jurisdiction_covers(p_state_id, p_district_id, p_sub_district_id) then
    raise exception 'OUTSIDE_JURISDICTION: you are not authorized to manage this location';
  end if;
end;
$$;

-- Resolves an existing account's location for jurisdiction checks on
-- suspend/activate/regenerate, independent of which role it is.
create or replace function resolve_account_jurisdiction(p_user_id uuid)
returns table(state_id uuid, district_id uuid, sub_district_id uuid)
language plpgsql stable as $$
declare
  v_role app_role;
begin
  select role into v_role from users where id = p_user_id;

  if v_role = 'farmer' then
    return query select fp.state_id, fp.district_id, fp.sub_district_id
      from farmer_profiles fp where fp.user_id = p_user_id;
  elsif v_role = 'csc_operator' then
    return query select null::uuid, co.district_id, co.sub_district_id
      from csc_operators co where co.user_id = p_user_id;
  elsif v_role = 'centre_operator' then
    return query select pc.state_id, pc.district_id, pc.sub_district_id
      from centre_operators cop
      join procurement_centres pc on pc.id = cop.centre_id
      where cop.user_id = p_user_id;
  else
    return query select null::uuid, null::uuid, null::uuid;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. MOBILE NUMBER NORMALIZATION (spec §9, §27)
-- Pure, side-effect-free — safe to call from the client for live validation
-- feedback, but the RESULT must still be what gets stored, never a
-- client-constructed string (services/admin/provisioning-service.ts always
-- calls this before persisting anything).
-- ----------------------------------------------------------------------------

create or replace function normalize_mobile_number(p_country_code text, p_raw_number text)
returns text language plpgsql stable as $$
declare
  v_digits text;
  v_code text := regexp_replace(coalesce(p_country_code, ''), '[^0-9+]', '', 'g');
begin
  if left(v_code, 1) <> '+' then
    v_code := '+' || v_code;
  end if;

  v_digits := regexp_replace(coalesce(p_raw_number, ''), '[^0-9]', '', 'g');

  if v_code = '+91' then
    if v_digits !~ '^[6-9][0-9]{9}$' then
      raise exception 'INVALID_MOBILE_NUMBER: Indian mobile numbers must be 10 digits starting 6-9';
    end if;
  else
    -- Generic international sanity check (E.164 payload is 4-14 digits after
    -- the country code). Countries needing stricter rules can get a branch
    -- added here without changing callers.
    if length(v_digits) < 4 or length(v_digits) > 14 then
      raise exception 'INVALID_MOBILE_NUMBER: unexpected length for country code %', v_code;
    end if;
  end if;

  return v_code || v_digits;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. INITIAL PASSWORD GENERATION (spec §10)
-- 8 uppercase alphanumeric characters, drawn from pgcrypto's
-- gen_random_bytes() (a cryptographically secure source), with visually
-- ambiguous characters (0/O, 1/I) excluded. This never touches any table —
-- the caller (a server action using the service-role Auth client) is
-- responsible for handing the result straight to
-- supabase.auth.admin.createUser({ password }) and never persisting it.
-- ----------------------------------------------------------------------------

create or replace function generate_initial_password()
returns text language plpgsql as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_result text := '';
  v_bytes bytea := gen_random_bytes(8);
  i int;
begin
  for i in 0..7 loop
    v_result := v_result || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
  end loop;
  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. FIRST-LOGIN PASSWORD CHANGE (spec §13)
-- Called immediately after a successful supabase.auth.updateUser({password})
-- on the client's active session. Clears must_change_password for the
-- CALLING user only (auth.uid()) — never accepts a target user id, so it
-- can't be used to clear the flag on someone else's account.
-- ----------------------------------------------------------------------------

create or replace function complete_first_login_password_change()
returns void language plpgsql security definer as $$
begin
  perform set_config('app.bypass_protected_columns', 'true', true);
  update users set must_change_password = false where id = auth.uid();

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, after_data)
    select auth.uid(), role, 'account.first_login_password_changed', 'users', auth.uid(), '{}'::jsonb
    from users where id = auth.uid();
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. ACCOUNT STATUS MANAGEMENT (spec §15, §18)
-- ----------------------------------------------------------------------------

create or replace function suspend_account(p_user_id uuid, p_reason text)
returns void language plpgsql security definer as $$
declare
  v_juris record;
begin
  select * into v_juris from resolve_account_jurisdiction(p_user_id);
  perform assert_gov_admin_jurisdiction(v_juris.state_id, v_juris.district_id, v_juris.sub_district_id);

  perform set_config('app.bypass_protected_columns', 'true', true);
  update users set account_status = 'suspended', suspended_at = now() where id = p_user_id;

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, jurisdiction_id, after_data)
    values (auth.uid(), 'government_admin', 'account.suspended', 'users', p_user_id,
            v_juris.district_id, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function activate_account(p_user_id uuid)
returns void language plpgsql security definer as $$
declare
  v_juris record;
begin
  select * into v_juris from resolve_account_jurisdiction(p_user_id);
  perform assert_gov_admin_jurisdiction(v_juris.state_id, v_juris.district_id, v_juris.sub_district_id);

  perform set_config('app.bypass_protected_columns', 'true', true);
  update users set account_status = 'active', activated_at = now(), suspended_at = null where id = p_user_id;

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, jurisdiction_id)
    values (auth.uid(), 'government_admin', 'account.activated', 'users', p_user_id, v_juris.district_id);
end;
$$;

-- Metadata half of "regenerate initial password" (spec §26). The new
-- plaintext password itself is generated by generate_initial_password() and
-- pushed into Supabase Auth via admin.auth.admin.updateUserById() in the
-- server action — this function only re-arms the first-login requirement
-- and logs the event, and never receives or stores the password.
create or replace function mark_password_regenerated(p_user_id uuid)
returns void language plpgsql security definer as $$
declare
  v_juris record;
begin
  select * into v_juris from resolve_account_jurisdiction(p_user_id);
  perform assert_gov_admin_jurisdiction(v_juris.state_id, v_juris.district_id, v_juris.sub_district_id);

  perform set_config('app.bypass_protected_columns', 'true', true);
  update users set must_change_password = true where id = p_user_id;

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, jurisdiction_id)
    values (auth.uid(), 'government_admin', 'account.password_regenerated', 'users', p_user_id, v_juris.district_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. PROCUREMENT CENTRE CREATION BY ADMIN (spec §7)
-- Unlike farmer/CSC/operator accounts, a centre has no Auth identity, so its
-- full creation — jurisdiction check + insert — happens in one atomic RPC.
-- ----------------------------------------------------------------------------

create or replace function create_procurement_centre_admin(
  p_name text, p_code text, p_state_id uuid, p_district_id uuid, p_sub_district_id uuid,
  p_address text, p_centre_type text, p_daily_capacity_quintal numeric, p_counters_count integer,
  p_controlling_authority text, p_contact_number text, p_official_email text
) returns uuid language plpgsql security definer as $$
declare
  v_centre_id uuid;
begin
  perform assert_gov_admin_jurisdiction(p_state_id, p_district_id, p_sub_district_id);

  insert into procurement_centres (
    name, code, state_id, district_id, sub_district_id, address, centre_type,
    daily_capacity_quintal, counters_count, controlling_authority, contact_number,
    official_email, verification_status, created_by
  ) values (
    p_name, p_code, p_state_id, p_district_id, p_sub_district_id, p_address, p_centre_type,
    p_daily_capacity_quintal, coalesce(p_counters_count, 1), p_controlling_authority, p_contact_number,
    p_official_email, 'pending', auth.uid()
  ) returning id into v_centre_id;

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, jurisdiction_id)
    values (auth.uid(), 'government_admin', 'centre.created', 'procurement_centres', v_centre_id, p_district_id);

  return v_centre_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. FARMER VERIFICATION REVIEW (jurisdiction-scoped replacement for the
-- Phase-3 review-service.ts direct table update, which RLS never actually
-- granted — gov_admin had no UPDATE policy on farmer_profiles, only SELECT,
-- so that call was silently a no-op). This RPC is the real, working, audited,
-- jurisdiction-checked path; services/gov-admin/review-service.ts is updated
-- to call it instead of .update().
-- ----------------------------------------------------------------------------

create or replace function review_farmer_verification_admin(
  p_farmer_id uuid, p_decision verification_status, p_notes text
) returns void language plpgsql security definer as $$
declare
  v_juris record;
begin
  select state_id, district_id, sub_district_id into v_juris
    from farmer_profiles where user_id = p_farmer_id;
  if not found then
    raise exception 'FARMER_NOT_FOUND';
  end if;

  perform assert_gov_admin_jurisdiction(v_juris.state_id, v_juris.district_id, v_juris.sub_district_id);

  update farmer_profiles set verification_status = p_decision where user_id = p_farmer_id;

  insert into farmer_verification (farmer_id_user, status, reviewed_by, review_notes, reviewed_at)
    values (p_farmer_id, p_decision, auth.uid(), p_notes, now());

  insert into notifications (user_id, type, title, body)
    values (
      p_farmer_id,
      case p_decision when 'approved' then 'verification_approved'
                       when 'correction_required' then 'correction_required'
                       else 'verification_rejected' end,
      case p_decision when 'approved' then 'Your registration was approved'
                       when 'correction_required' then 'Correction required'
                       else 'Registration rejected' end,
      p_notes
    );

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, jurisdiction_id, after_data)
    values (auth.uid(), 'government_admin', 'farmer.review', 'farmer_profiles', p_farmer_id,
            v_juris.district_id, jsonb_build_object('decision', p_decision));
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. DOCUMENT VERIFICATION (spec §5)
-- ----------------------------------------------------------------------------

create or replace function review_farmer_document_admin(
  p_document_id uuid, p_status document_status, p_reason text
) returns void language plpgsql security definer as $$
declare
  v_farmer uuid;
  v_juris record;
begin
  select farmer_id_user into v_farmer from farmer_documents where id = p_document_id;
  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  select state_id, district_id, sub_district_id into v_juris
    from farmer_profiles where user_id = v_farmer;
  perform assert_gov_admin_jurisdiction(v_juris.state_id, v_juris.district_id, v_juris.sub_district_id);

  update farmer_documents
    set status = p_status, verified_by = auth.uid(), verified_at = now(),
        rejection_reason = case when p_status in ('rejected','correction_required') then p_reason else null end
    where id = p_document_id;

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, jurisdiction_id, after_data)
    values (auth.uid(), 'government_admin', 'document.review', 'farmer_documents', p_document_id,
            v_juris.district_id, jsonb_build_object('status', p_status));
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. GENERIC PROVISIONING AUDIT HELPER, used by services/admin/provisioning-service.ts
-- after each server-side account creation (auth user + app metadata are both
-- created there, outside SQL, so the audit entry is written from the
-- server action too — this function just gives it a jurisdiction-checked,
-- consistent shape to call rather than inserting into audit_logs directly).
-- ----------------------------------------------------------------------------

create or replace function log_account_provisioned(
  p_account_type text, p_account_id uuid, p_state_id uuid, p_district_id uuid, p_sub_district_id uuid
) returns void language plpgsql security definer as $$
begin
  perform assert_gov_admin_jurisdiction(p_state_id, p_district_id, p_sub_district_id);
  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, jurisdiction_id, after_data)
    values (auth.uid(), 'government_admin', 'account.created', 'users', p_account_id, p_district_id,
            jsonb_build_object('account_type', p_account_type));
end;
$$;
