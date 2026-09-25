-- ============================================================================
-- ANNASETU — BOOTSTRAP THE FIRST GOVERNMENT ADMIN  (run ONCE, by hand)
--
-- Every other account is created by an existing admin from the app, so the very
-- first admin has to be created out-of-band:
--
--   1. Supabase Dashboard → Authentication → Users → "Add user" (email +
--      password; tick "Auto Confirm User"). Copy the new user's UUID.
--   2. Replace the three placeholders below, then run this file in the SQL Editor.
--   3. Sign in with that email/password (Login → Email tab) and change nothing —
--      must_change_password is false here because you chose the password.
--
-- The admin's JURISDICTION is what limits what they can see and do (RLS + RPCs):
--   * state-wide SDO  → jurisdiction_state_id  (leave the district/sub-district NULL)
--   * district SDO    → jurisdiction_district_id
--   * block BDO       → admin_role 'bdo' + jurisdiction_sub_district_id
-- An admin row with NO jurisdiction can do nothing (fail-closed).
-- ============================================================================

do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-000000000000';   -- <— the Auth user's UUID
  v_state_id uuid := '11111111-1111-1111-1111-111111111111';  -- <— e.g. West Bengal from seed.sql
begin
  if v_user_id = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Replace v_user_id with the UUID of the Auth user you created';
  end if;

  insert into users (id, role, full_name, email, account_status, must_change_password)
    select v_user_id, 'government_admin', 'State Administrator', au.email, 'active', false
      from auth.users au where au.id = v_user_id
    on conflict (id) do nothing;

  if not exists (select 1 from users where id = v_user_id) then
    raise exception 'No auth.users row with that id';
  end if;

  insert into government_admins (user_id, admin_role, jurisdiction_state_id, designation)
    values (v_user_id, 'sdo', v_state_id, 'State-level administrator')
    on conflict (user_id) do update
      set admin_role = excluded.admin_role, jurisdiction_state_id = excluded.jurisdiction_state_id;
end
$$;
