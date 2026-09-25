-- ============================================================================
-- ANNASETU — ADMIN PROVISIONING DATABASE TESTS (pgTAP)
-- Run via: supabase start && npm run test:db
-- Self-contained (same create_test_auth_user/act_as pattern as
-- booking_and_procurement.test.sql) so it works whether or not the runner
-- shares session state across test files.
-- ============================================================================

begin;
select * from no_plan();

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

-- ----------------------------------------------------------------------------
-- 1. MOBILE NUMBER NORMALIZATION
-- ----------------------------------------------------------------------------

select is(
  normalize_mobile_number('+91', '98765 43210'),
  '+919876543210',
  'Indian number normalizes to canonical +91 form, stripping spaces'
);

select is(
  normalize_mobile_number('91', '9876543210'),
  '+919876543210',
  'a bare country code (no leading +) is corrected before normalizing'
);

select throws_like(
  $$ select normalize_mobile_number('+91', '12345') $$,
  '%INVALID_MOBILE_NUMBER%',
  'an Indian number that is too short and does not start 6-9 is rejected'
);

select throws_like(
  $$ select normalize_mobile_number('+91', '5876543210') $$,
  '%INVALID_MOBILE_NUMBER%',
  'an Indian number starting with 5 (outside 6-9) is rejected'
);

select is(
  normalize_mobile_number('+1', '4155551234'),
  '+14155551234',
  'a non-Indian number within the generic length check normalizes correctly'
);

-- ----------------------------------------------------------------------------
-- 2. INITIAL PASSWORD GENERATION
-- ----------------------------------------------------------------------------

select is(length(generate_initial_password()), 8, 'generated password is exactly 8 characters');

select ok(
  generate_initial_password() ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$',
  'generated password uses only the uppercase alphanumeric alphabet (ambiguous chars excluded)'
);

select isnt(
  generate_initial_password(), generate_initial_password(),
  'two consecutive calls produce different passwords (basic non-determinism smoke test)'
);

-- ----------------------------------------------------------------------------
-- 3. JURISDICTION (fixtures: one district, one sub-district within it)
-- ----------------------------------------------------------------------------

insert into states (id, name, code) values
  ('c0000000-0000-0000-0000-000000000001', 'Juris State', 'JS') on conflict do nothing;
insert into districts (id, state_id, name) values
  ('c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Juris District'),
  ('c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'Other District')
on conflict do nothing;
insert into sub_districts (id, district_id, name) values
  ('c0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'Juris Block'),
  ('c0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'Other Block In Same District')
on conflict do nothing;

select create_test_auth_user('c0000000-0000-0000-0000-000000000010', 'sdo@test.local');
select create_test_auth_user('c0000000-0000-0000-0000-000000000011', 'bdo@test.local');
select create_test_auth_user('c0000000-0000-0000-0000-000000000012', 'noscope-admin@test.local');

insert into users (id, role, full_name) values
  ('c0000000-0000-0000-0000-000000000010', 'government_admin', 'Test SDO'),
  ('c0000000-0000-0000-0000-000000000011', 'government_admin', 'Test BDO'),
  ('c0000000-0000-0000-0000-000000000012', 'government_admin', 'No-scope Admin')
on conflict do nothing;

insert into government_admins (user_id, admin_role, jurisdiction_district_id) values
  ('c0000000-0000-0000-0000-000000000010', 'sdo', 'c0000000-0000-0000-0000-000000000002')
on conflict (user_id) do update set admin_role = excluded.admin_role, jurisdiction_district_id = excluded.jurisdiction_district_id;

insert into government_admins (user_id, admin_role, jurisdiction_sub_district_id) values
  ('c0000000-0000-0000-0000-000000000011', 'bdo', 'c0000000-0000-0000-0000-000000000004')
on conflict (user_id) do update set admin_role = excluded.admin_role, jurisdiction_sub_district_id = excluded.jurisdiction_sub_district_id;

insert into government_admins (user_id, admin_role) values
  ('c0000000-0000-0000-0000-000000000012', 'bdo')
on conflict (user_id) do update set admin_role = excluded.admin_role;

select act_as('c0000000-0000-0000-0000-000000000010');
select ok(
  admin_jurisdiction_covers(null, 'c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004'),
  'an SDO covers any sub-district within their assigned district'
);
select ok(
  not admin_jurisdiction_covers(null, 'c0000000-0000-0000-0000-000000000003', null),
  'an SDO does NOT cover a different district'
);

select act_as('c0000000-0000-0000-0000-000000000011');
select ok(
  admin_jurisdiction_covers(null, 'c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004'),
  'a BDO covers their own assigned sub-district'
);
select ok(
  not admin_jurisdiction_covers(null, 'c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000005'),
  'a BDO does NOT cover a different sub-district in the same district'
);

select act_as('c0000000-0000-0000-0000-000000000012');
select ok(
  not admin_jurisdiction_covers(null, 'c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004'),
  'an admin with no jurisdiction configured is denied by default (fail-closed)'
);

-- ----------------------------------------------------------------------------
-- 4. NULL-SAFE / FAIL-CLOSED JURISDICTION (regression: `if not NULL` used to pass)
-- ----------------------------------------------------------------------------

select act_as('c0000000-0000-0000-0000-000000000010');
select is(
  admin_jurisdiction_covers(null, null, null), false,
  'an SDO''s jurisdiction check on an all-NULL location is FALSE, never NULL'
);
select throws_like(
  $$ select assert_gov_admin_jurisdiction(null, null, null) $$,
  'OUTSIDE_JURISDICTION%',
  'asserting jurisdiction over an unknown location is denied, not silently allowed'
);

select act_as('c0000000-0000-0000-0000-000000000011');
select is(
  admin_jurisdiction_covers(null, null, null), false,
  'a BDO''s jurisdiction check on an all-NULL location is FALSE'
);

-- ----------------------------------------------------------------------------
-- 5. ACCOUNT LIFECYCLE COLUMNS ARE PROTECTED BY THE TRIGGER (current_user based)
-- Simulated with a direct role switch, as PostgREST does for a client request.
-- ----------------------------------------------------------------------------

select create_test_auth_user('c0000000-0000-0000-0000-000000000020', 'protect-test@test.local');
insert into users (id, role, full_name, must_change_password) values
  ('c0000000-0000-0000-0000-000000000020', 'farmer', 'Protect Test', true)
on conflict (id) do update set must_change_password = true;

select act_as('c0000000-0000-0000-0000-000000000020');
set local role authenticated;
select throws_like(
  $$ update users set must_change_password = false where id = 'c0000000-0000-0000-0000-000000000020' $$,
  'permission denied%',
  'a client cannot clear its own must_change_password flag'
);
reset role;
select is(
  (select must_change_password from users where id = 'c0000000-0000-0000-0000-000000000020'),
  true,
  'the flag is unchanged'
);

-- The service-side path (clear_must_change_password) still works.
select clear_must_change_password('c0000000-0000-0000-0000-000000000020');
select is(
  (select must_change_password from users where id = 'c0000000-0000-0000-0000-000000000020'),
  false,
  'clear_must_change_password() (service role only) clears the flag'
);

select * from finish();
rollback;
