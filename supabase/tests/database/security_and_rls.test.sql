-- ============================================================================
-- ANNASETU — SECURITY / RLS TESTS (pgTAP)
-- Run via: supabase start && npm run test:db
--
-- Unlike the earlier suites (which ran as the superuser and therefore bypassed
-- RLS entirely), these switch to the `authenticated` / `anon` roles exactly as
-- PostgREST does, so they exercise the real policies, column grants and
-- function EXECUTE grants. Regression tests for the original findings:
--   * a user could set their own role to government_admin
--   * a farmer could approve their own verification
--   * jurisdiction checks failed OPEN on NULL
--   * suspended / must-change-password accounts kept database access
--   * gov-admin and CSC reads were country-wide
-- ============================================================================

begin;
select * from no_plan();

create or replace function tid(n int) returns uuid language sql immutable as $$
  select ('d0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;

create or replace function create_test_auth_user(p_id uuid, p_email text)
returns void language plpgsql as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    p_email, crypt('test-password-not-real', gen_salt('bf')),
    now(), now(), now(), '', ''
  ) on conflict (id) do nothing;
end;
$$;

create or replace function act_as(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_id::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- ---- geography: one state, two districts, one block each -------------------
insert into states (id, name, code) values (tid(1), 'Sec State', 'SS');
insert into districts (id, state_id, name) values (tid(2), tid(1), 'Sec District One'), (tid(3), tid(1), 'Sec District Two');
insert into sub_districts (id, district_id, name) values (tid(4), tid(2), 'Sec Block One'), (tid(5), tid(3), 'Sec Block Two');

-- ---- people ----------------------------------------------------------------
select create_test_auth_user(tid(10), 'sdo1@test.local');
select create_test_auth_user(tid(11), 'sdo2@test.local');
select create_test_auth_user(tid(12), 'csc1@test.local');
select create_test_auth_user(tid(13), 'op1@test.local');
select create_test_auth_user(tid(20), 'fa@test.local');
select create_test_auth_user(tid(21), 'fb@test.local');

insert into users (id, role, full_name) values
  (tid(10), 'government_admin', 'SDO One'),
  (tid(11), 'government_admin', 'SDO Two'),
  (tid(12), 'csc_operator', 'CSC One'),
  (tid(13), 'centre_operator', 'Operator One'),
  (tid(20), 'farmer', 'Farmer A'),
  (tid(21), 'farmer', 'Farmer B');

insert into government_admins (user_id, admin_role, jurisdiction_district_id) values
  (tid(10), 'sdo', tid(2)), (tid(11), 'sdo', tid(3));

insert into csc_operators (user_id, centre_name, jurisdiction_district_id, district_id) values
  (tid(12), 'CSC One Centre', tid(2), tid(2));

insert into procurement_centres (id, name, code, state_id, district_id, sub_district_id, daily_capacity_quintal)
  values (tid(50), 'Sec Centre', 'SEC-1', tid(1), tid(2), tid(4), 100);
insert into centre_operators (user_id, centre_id) values (tid(13), tid(50));

insert into farmer_profiles (user_id, farmer_category, first_name, last_name, date_of_birth, gender,
                             mobile_number, address_line, state_id, district_id, sub_district_id, verification_status)
values
  (tid(20), 'owner_cultivator', 'Farmer', 'A', '1990-01-01', 'male', '9876543210', 'Addr', tid(1), tid(2), tid(4), 'under_verification'),
  (tid(21), 'owner_cultivator', 'Farmer', 'B', '1990-01-01', 'male', '9876543211', 'Addr', tid(1), tid(3), tid(5), 'under_verification');

insert into crops (id, name, msp_per_quintal) values (tid(30), 'Sec Wheat', 2000);
insert into procurement_crops (id, farmer_id_user, crop_id, expected_quantity, status)
  values (tid(40), tid(20), tid(30), 20, 'pending_approval');

-- ============================================================================
-- 1. PRIVILEGE ESCALATION IS BLOCKED
-- ============================================================================
select act_as(tid(20));
set local role authenticated;

select throws_like(
  $$ update users set role = 'government_admin' where id = tid(20) $$,
  'permission denied%',
  'a signed-in user CANNOT change their own role'
);
select throws_like(
  $$ update users set account_status = 'active', must_change_password = false where id = tid(20) $$,
  'permission denied%',
  'a signed-in user cannot edit their own account lifecycle columns'
);
select lives_ok(
  $$ update users set full_name = 'Farmer A Renamed' where id = tid(20) $$,
  'a signed-in user CAN still edit their own display name'
);
select throws_like(
  $$ update farmer_profiles set verification_status = 'approved' where user_id = tid(20) $$,
  'permission denied%',
  'a farmer CANNOT approve their own verification'
);
select throws_like(
  $$ update procurement_crops set status = 'approved' where farmer_id_user = tid(20) $$,
  'permission denied%',
  'a farmer cannot approve their own procurement crops'
);
select throws_like(
  $$ insert into procurement_crops (farmer_id_user, crop_id, expected_quantity) values (tid(20), tid(30), 99) $$,
  'permission denied%',
  'a farmer cannot write procurement crops directly (must use the registration RPC)'
);
select throws_like(
  $$ select clear_must_change_password(tid(20)) $$,
  'permission denied%',
  'the first-login flag can only be cleared by the service role, not by the user'
);

-- ============================================================================
-- 2. ANON HAS NO WRITE / RPC ACCESS
-- ============================================================================
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_like(
  $$ select create_booking(tid(20), tid(50), tid(40), 1, current_date, current_date, '10:00') $$,
  'permission denied%',
  'an unauthenticated caller cannot execute create_booking'
);
select throws_like(
  $$ select cancel_appointment(gen_random_uuid(), 'x') $$,
  'permission denied%',
  'an unauthenticated caller cannot execute cancel_appointment'
);
reset role;

-- ============================================================================
-- 3. READS ARE SCOPED
-- ============================================================================
select act_as(tid(20));
set local role authenticated;
select is((select count(*) from farmer_profiles), 1::bigint, 'a farmer sees only their own farmer profile');
select is((select count(*) from users), 1::bigint, 'a farmer sees only their own users row');
reset role;

select act_as(tid(10));
set local role authenticated;
select is((select count(*) from farmer_profiles where user_id in (tid(20), tid(21))), 1::bigint,
  'SDO of district one sees only farmers in district one');
select is((select count(*) from farmer_profiles where user_id = tid(21)), 0::bigint,
  'SDO of district one cannot see a farmer in district two');
select is((select count(*) from users where id = tid(21)), 0::bigint,
  'SDO of district one cannot read a district-two user');
select is(admin_jurisdiction_covers(null, null, null), false,
  'jurisdiction check on an all-NULL target is FALSE (fail-closed), not NULL');
reset role;

select act_as(tid(11));
set local role authenticated;
select is((select count(*) from farmer_profiles where user_id = tid(20)), 0::bigint,
  'SDO of district two cannot see a district-one farmer');
reset role;

select act_as(tid(12));
set local role authenticated;
select is((select count(*) from farmer_profiles where user_id in (tid(20), tid(21))), 1::bigint,
  'a CSC operator sees only farmers in their own district');
reset role;

-- ============================================================================
-- 4. ACCOUNT STATE IS ENFORCED BY THE DATABASE (not just by middleware)
-- ============================================================================
update users set account_status = 'suspended' where id = tid(10);
select act_as(tid(10));
set local role authenticated;
select is(is_gov_admin(), false, 'a SUSPENDED government admin has no admin role at the database level');
select is((select count(*) from farmer_profiles), 0::bigint, 'a suspended admin can read nothing through RLS');
reset role;
update users set account_status = 'active' where id = tid(10);

update users set must_change_password = true where id = tid(10);
select act_as(tid(10));
set local role authenticated;
select is(is_gov_admin(), false, 'a must-change-password admin has no admin role until the password is changed');
reset role;
update users set must_change_password = false where id = tid(10);

-- ============================================================================
-- 5. ADMIN RPCs: role, jurisdiction, and admin-on-admin protections
-- ============================================================================
select act_as(tid(12));
set local role authenticated;
select throws_like(
  $$ select review_farmer_verification_admin(tid(20), 'approved', 'ok') $$,
  'NOT_A_GOVERNMENT_ADMIN%',
  'a CSC operator cannot approve a farmer'
);
select throws_like(
  $$ select authorize_provisioning(tid(2), tid(4)) $$,
  'NOT_A_GOVERNMENT_ADMIN%',
  'a non-admin cannot pass the provisioning pre-check'
);
reset role;

select act_as(tid(11));
set local role authenticated;
select throws_like(
  $$ select review_farmer_verification_admin(tid(20), 'approved', 'ok') $$,
  'OUTSIDE_JURISDICTION%',
  'an SDO cannot review a farmer outside their district'
);
select throws_like(
  $$ select authorize_provisioning(tid(2), tid(4)) $$,
  'OUTSIDE_JURISDICTION%',
  'an SDO cannot pre-authorize provisioning in another district'
);
reset role;

select act_as(tid(10));
set local role authenticated;
select throws_like($$ select suspend_account(tid(10), 'x') $$, 'CANNOT_MANAGE_SELF%', 'an admin cannot suspend themselves');
select throws_like(
  $$ select suspend_account(tid(11), 'x') $$,
  'CANNOT_MANAGE_ADMIN_ACCOUNT%',
  'an admin can never suspend another administrator (previously failed open on NULL)'
);
select throws_like(
  $$ select authorize_password_regeneration(tid(11)) $$,
  'CANNOT_MANAGE_ADMIN_ACCOUNT%',
  'an admin can never reset another administrator''s password'
);
select throws_like($$ select suspend_account(tid(21), 'x') $$, 'OUTSIDE_JURISDICTION%', 'an SDO cannot suspend a farmer outside their district');
select throws_like($$ select suspend_account(tid(20), '') $$, 'REASON_REQUIRED%', 'a suspension needs a reason');
select lives_ok($$ select authorize_provisioning(tid(2), tid(4)) $$, 'an SDO can pre-authorize provisioning inside their district');

select lives_ok($$ select review_farmer_verification_admin(tid(20), 'approved', 'looks good') $$, 'an SDO can approve a farmer inside their district');
reset role;

select is((select verification_status::text from farmer_profiles where user_id = tid(20)), 'approved', 'the farmer is approved');
select is((select status::text from procurement_crops where id = tid(40)), 'locked',
  'approving the farmer also approved (locked) their pending procurement crop');
select is((select count(*) from farmer_verification where farmer_id_user = tid(20) and status = 'approved'), 1::bigint, 'the review is recorded');
select is((select count(*) from audit_logs where action = 'farmer.review' and entity_id = tid(20)), 1::bigint, 'the review is audited');
select is((select count(*) from notifications where user_id = tid(20) and type = 'verification_approved'), 1::bigint, 'the farmer was notified');

select act_as(tid(10));
set local role authenticated;
select throws_like(
  $$ select review_farmer_verification_admin(tid(20), 'rejected', 'again') $$,
  'INVALID_STATE%',
  'an already-decided application cannot be reviewed again'
);
select lives_ok($$ select suspend_account(tid(20), 'test suspension') $$, 'an SDO can suspend a farmer inside their district');
reset role;
select is((select account_status::text from users where id = tid(20)), 'suspended', 'the farmer is suspended');

select act_as(tid(20));
set local role authenticated;
select is(is_farmer(), false, 'a suspended farmer has no farmer role at the database level');
select throws_like(
  $$ select create_booking(tid(20), tid(50), tid(40), 1, current_date - 1, current_date + 3, '10:00') $$,
  'NOT_AUTHORIZED%',
  'a suspended farmer cannot book'
);
reset role;

select * from finish();
rollback;
