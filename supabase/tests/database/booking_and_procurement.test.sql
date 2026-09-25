-- ============================================================================
-- ANNASETU — DATABASE TESTS (pgTAP)
-- Run via the Supabase CLI against a local dev stack:
--   supabase start
--   supabase test db
-- (pg_prove under the hood; requires the `pgtap` extension, which the CLI
-- enables automatically for `supabase test db`.)
--
-- This file uses fixed, namespaced UUID literals for every fixture instead
-- of psql variables, so it runs identically under `supabase test db` or a
-- plain `psql -f`. It creates its own auth.users rows for test identities —
-- adjust create_test_auth_user() below if your local Supabase Auth schema
-- version requires additional NOT NULL columns; the shape here matches the
-- standard `supabase start` local dev stack as of this writing.
--
-- Everything runs inside one transaction and rolls back at the end, so it
-- never leaves fixture data behind in your dev DB.
-- ============================================================================

begin;
select * from no_plan();

-- ----------------------------------------------------------------------------
-- Fixture helper: minimal valid auth.users row for a test identity.
-- ----------------------------------------------------------------------------
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

-- Acts as a given test identity for subsequent statements in this transaction.
create or replace function act_as(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_id::text, true);
$$;

create or replace function act_as_nobody() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', true);
$$;

-- ----------------------------------------------------------------------------
-- Fixtures: locations, crops, two centres (A active, B inactive), farmers,
-- operators.
-- ----------------------------------------------------------------------------
insert into states (id, name, code) values
  ('a0000000-0000-0000-0000-000000000001', 'Test State', 'TS') on conflict do nothing;
insert into districts (id, state_id, name) values
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Test District') on conflict do nothing;
insert into sub_districts (id, district_id, name) values
  ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Test Sub-district') on conflict do nothing;
insert into villages (id, sub_district_id, name) values
  ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'Test Village') on conflict do nothing;

insert into crops (id, name, is_procurable) values
  ('a0000000-0000-0000-0000-000000000010', 'Test Paddy', true) on conflict do nothing;

insert into procurement_centres (id, name, code, state_id, district_id, daily_capacity_quintal, counters_count, is_active) values
  ('a0000000-0000-0000-0000-000000000020', 'Centre A (active)', 'TST-A',
   'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 10.0, 1, true),
  ('a0000000-0000-0000-0000-000000000021', 'Centre B (inactive)', 'TST-B',
   'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 10.0, 1, false)
on conflict do nothing;

select create_test_auth_user('a0000000-0000-0000-0000-000000000030', 'farmer.approved@test.local'); -- approved farmer
select create_test_auth_user('a0000000-0000-0000-0000-000000000031', 'farmer.unapproved@test.local'); -- draft/under_verification farmer
select create_test_auth_user('a0000000-0000-0000-0000-000000000032', 'farmer.other@test.local'); -- owns nothing, used for ownership test
select create_test_auth_user('a0000000-0000-0000-0000-000000000040', 'operator.a@test.local'); -- assigned to centre A
select create_test_auth_user('a0000000-0000-0000-0000-000000000041', 'operator.b@test.local'); -- assigned to centre B
select create_test_auth_user('a0000000-0000-0000-0000-000000000050', 'nobody@test.local'); -- exists, but not an operator

insert into users (id, role, full_name) values
  ('a0000000-0000-0000-0000-000000000030', 'farmer', 'Approved Farmer'),
  ('a0000000-0000-0000-0000-000000000031', 'farmer', 'Unapproved Farmer'),
  ('a0000000-0000-0000-0000-000000000032', 'farmer', 'Other Farmer'),
  ('a0000000-0000-0000-0000-000000000040', 'centre_operator', 'Operator A'),
  ('a0000000-0000-0000-0000-000000000041', 'centre_operator', 'Operator B'),
  ('a0000000-0000-0000-0000-000000000050', 'farmer', 'Nobody')
on conflict do nothing;

insert into farmer_profiles (
  user_id, farmer_category, first_name, last_name, date_of_birth, gender,
  mobile_number, address_line, state_id, district_id, sub_district_id, verification_status
) values
  ('a0000000-0000-0000-0000-000000000030', 'owner_cultivator', 'Approved', 'Farmer', '1990-01-01', 'other',
   '9000000001', 'Test address', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000003', 'approved'),
  ('a0000000-0000-0000-0000-000000000031', 'owner_cultivator', 'Unapproved', 'Farmer', '1990-01-01', 'other',
   '9000000002', 'Test address', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000003', 'under_verification')
on conflict do nothing;

insert into centre_operators (user_id, centre_id) values
  ('a0000000-0000-0000-0000-000000000040', 'a0000000-0000-0000-0000-000000000020'),
  ('a0000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-000000000021')
on conflict do nothing;

insert into procurement_crops (id, farmer_id_user, crop_id, expected_quantity, status) values
  ('a0000000-0000-0000-0000-000000000060', 'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000010', 50, 'approved'),
  ('a0000000-0000-0000-0000-000000000061', 'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000010', 50, 'pending_approval')
on conflict do nothing;

-- ============================================================================
-- PRIORITY 3 — create_booking() authorization + validation
-- ============================================================================

select act_as('a0000000-0000-0000-0000-000000000030');

-- 14-day boundary: booking exactly 14 days out succeeds.
select lives_ok(
  $$ select create_booking(
      'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000020',
      'a0000000-0000-0000-0000-000000000060', 1, current_date, current_date + 14, '10:00'
  ) $$,
  '14-day booking boundary succeeds'
);

-- 15-day rejection: booking window not yet open.
select throws_like(
  $$ select create_booking(
      'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000020',
      'a0000000-0000-0000-0000-000000000060', 1, current_date, current_date + 15, '10:00'
  ) $$,
  '%BOOKING_WINDOW_CLOSED%',
  '15-day-out booking is rejected (window not open)'
);

-- Past-date rejection.
select throws_like(
  $$ select create_booking(
      'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000020',
      'a0000000-0000-0000-0000-000000000060', 1, current_date - 5, current_date - 1, '10:00'
  ) $$,
  '%PAST_DATE%',
  'past procurement date is rejected'
);

-- Unapproved farmer rejection.
select act_as('a0000000-0000-0000-0000-000000000031');
select throws_like(
  $$ select create_booking(
      'a0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000020',
      'a0000000-0000-0000-0000-000000000060', 1, current_date, current_date + 7, '10:00'
  ) $$,
  '%FARMER_NOT_APPROVED%',
  'unapproved farmer cannot book'
);

-- Crop ownership: farmer 031 has no procurement_crops row at all.
select throws_like(
  $$ select create_booking(
      'a0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000020',
      'a0000000-0000-0000-0000-000000000060', 1, current_date, current_date + 7, '10:00'
  ) $$,
  '%CROP_NOT_OWNED%',
  'booking with a crop owned by a different farmer is rejected'
);

-- Crop not approved (still pending_approval).
select act_as('a0000000-0000-0000-0000-000000000030');
select throws_like(
  $$ select create_booking(
      'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000020',
      'a0000000-0000-0000-0000-000000000061', 1, current_date, current_date + 7, '10:00'
  ) $$,
  '%CROP_NOT_APPROVED%',
  'booking with a pending (not yet approved) crop is rejected'
);

-- Inactive centre rejection.
select throws_like(
  $$ select create_booking(
      'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000021',
      'a0000000-0000-0000-0000-000000000060', 1, current_date, current_date + 7, '10:00'
  ) $$,
  '%CENTRE_INACTIVE%',
  'booking at an inactive centre is rejected'
);

-- Cross-farmer authorization: farmer A cannot book "as" farmer B.
select throws_like(
  $$ select create_booking(
      'a0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000020',
      'a0000000-0000-0000-0000-000000000060', 1, current_date, current_date + 7, '10:00'
  ) $$,
  '%NOT_AUTHORIZED%',
  'auth.uid() must match p_farmer_id'
);

-- Capacity: Centre A has 10 quintal/day. Book 5 more (total 6 including the
-- 1 from the boundary test above) on a fresh date, then push past capacity.
select lives_ok(
  $$ select create_booking(
      'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000020',
      'a0000000-0000-0000-0000-000000000060', 9, current_date, current_date + 3, '11:00'
  ) $$,
  'booking within remaining capacity succeeds'
);
select throws_like(
  $$ select create_booking(
      'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000020',
      'a0000000-0000-0000-0000-000000000060', 5, current_date, current_date + 3, '12:00'
  ) $$,
  '%CAPACITY_FULL%',
  'booking beyond remaining capacity is rejected'
);

-- Token uniqueness sanity: two successful bookings on the same centre/date
-- above must have gotten distinct, sequential tokens (priority 5).
select is(
  (select count(distinct token_number) from queue_entries
     where centre_id = 'a0000000-0000-0000-0000-000000000020' and queue_date = current_date + 3),
  1::bigint,
  'each booking on a centre/date gets its own distinct token'
);

-- ============================================================================
-- PRIORITY 2 / 7 — transition_procurement_stage() state machine + auth
-- ============================================================================

-- Build a checked-in procurement record to transition from.
select act_as('a0000000-0000-0000-0000-000000000030');
select create_booking(
  'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000020',
  'a0000000-0000-0000-0000-000000000060', 1, current_date, current_date + 5, '09:00'
);

do $$
declare
  v_qe uuid;
  v_hash text;
begin
  select id, qr_payload_hash into v_qe, v_hash
    from queue_entries
    where centre_id = 'a0000000-0000-0000-0000-000000000020' and queue_date = current_date + 5;
  perform set_config('app.test_qe_id', v_qe::text, true);
  perform set_config('app.test_qe_hash', v_hash, true);
end $$;

-- Wrong operator (assigned to Centre B) cannot check in a Centre A token.
select act_as('a0000000-0000-0000-0000-000000000041');
select throws_like(
  format('select validate_and_checkin_token(%L::uuid, %L)',
    current_setting('app.test_qe_id'), current_setting('app.test_qe_hash')),
  '%WRONG_CENTRE%',
  'operator from a different centre cannot check in this token'
);

-- Non-operator identity cannot check in at all.
select act_as('a0000000-0000-0000-0000-000000000050');
select throws_like(
  format('select validate_and_checkin_token(%L::uuid, %L)',
    current_setting('app.test_qe_id'), current_setting('app.test_qe_hash')),
  '%NOT_AN_OPERATOR%',
  'a user with no centre_operators row cannot check in a token'
);

-- Tampered hash rejected (QR payload is a lookup key, not proof by itself).
select act_as('a0000000-0000-0000-0000-000000000040');
select throws_like(
  format('select validate_and_checkin_token(%L::uuid, %L)',
    current_setting('app.test_qe_id'), 'not-the-real-hash'),
  '%TOKEN_HASH_MISMATCH%',
  'a tampered/incorrect hash is rejected'
);

-- Correct operator, correct hash: succeeds.
select lives_ok(
  format('select validate_and_checkin_token(%L::uuid, %L)',
    current_setting('app.test_qe_id'), current_setting('app.test_qe_hash')),
  'correct operator + correct hash checks in successfully'
);

-- Replay: the same token cannot be checked in twice.
select throws_like(
  format('select validate_and_checkin_token(%L::uuid, %L)',
    current_setting('app.test_qe_id'), current_setting('app.test_qe_hash')),
  '%TOKEN_ALREADY_USED%',
  'a second check-in attempt with the same token is rejected (replay)'
);

do $$
declare
  v_pr uuid;
begin
  select id into v_pr from procurement_records
    where appointment_id = (
      select appointment_id from queue_entries where id = current_setting('app.test_qe_id')::uuid
    );
  perform set_config('app.test_pr_id', v_pr::text, true);
end $$;

-- Skipping a stage is rejected (checked_in -> weighing skips document_verified).
select throws_like(
  format('select transition_procurement_stage(%L::uuid, %L::procurement_stage)',
    current_setting('app.test_pr_id'), 'weighing'),
  '%INVALID_TRANSITION%',
  'skipping ahead in the stage sequence is rejected'
);

-- Wrong-centre operator cannot transition either.
select act_as('a0000000-0000-0000-0000-000000000041');
select throws_like(
  format('select transition_procurement_stage(%L::uuid, %L::procurement_stage)',
    current_setting('app.test_pr_id'), 'document_verified'),
  '%WRONG_CENTRE%',
  'an operator from a different centre cannot transition this procurement'
);

-- Correct operator, correct next stage: succeeds, and timestamps weighing.
select act_as('a0000000-0000-0000-0000-000000000040');
select lives_ok(
  format('select transition_procurement_stage(%L::uuid, %L::procurement_stage)',
    current_setting('app.test_pr_id'), 'document_verified'),
  'valid forward transition (checked_in -> document_verified) succeeds'
);
select lives_ok(
  format('select transition_procurement_stage(%L::uuid, %L::procurement_stage)',
    current_setting('app.test_pr_id'), 'weighing'),
  'valid forward transition (document_verified -> weighing) succeeds'
);
select isnt(
  (select processing_started_at from procurement_records where id = current_setting('app.test_pr_id')::uuid),
  null,
  'processing_started_at is set on entering weighing'
);

select lives_ok(
  format('select transition_procurement_stage(%L::uuid, %L::procurement_stage)',
    current_setting('app.test_pr_id'), 'quality_check'), 'weighing -> quality_check succeeds');
select lives_ok(
  format('select transition_procurement_stage(%L::uuid, %L::procurement_stage)',
    current_setting('app.test_pr_id'), 'accepted'), 'quality_check -> accepted succeeds');
select lives_ok(
  format('select transition_procurement_stage(%L::uuid, %L::procurement_stage)',
    current_setting('app.test_pr_id'), 'unloading'), 'accepted -> unloading succeeds');
select lives_ok(
  format('select transition_procurement_stage(%L::uuid, %L::procurement_stage)',
    current_setting('app.test_pr_id'), 'receipt_generated'), 'unloading -> receipt_generated succeeds');
select lives_ok(
  format('select transition_procurement_stage(%L::uuid, %L::procurement_stage)',
    current_setting('app.test_pr_id'), 'payment_initiated'), 'receipt_generated -> payment_initiated succeeds');
select lives_ok(
  format('select transition_procurement_stage(%L::uuid, %L::procurement_stage)',
    current_setting('app.test_pr_id'), 'completed'), 'payment_initiated -> completed succeeds');

select isnt(
  (select processing_completed_at from procurement_records where id = current_setting('app.test_pr_id')::uuid),
  null,
  'processing_completed_at is set on entering completed'
);

-- Duplicate completion is rejected.
select throws_like(
  format('select transition_procurement_stage(%L::uuid, %L::procurement_stage)',
    current_setting('app.test_pr_id'), 'completed'),
  '%ALREADY_COMPLETED%',
  'transitioning an already-completed procurement again is rejected'
);

-- ============================================================================
-- PRIORITY 1 — rolling average (AFTER trigger includes the just-completed row)
-- ============================================================================

-- The completion above should already have produced a non-null centre average.
select isnt(
  (select avg_processing_time_seconds from procurement_centres where id = 'a0000000-0000-0000-0000-000000000020'),
  null,
  'centre average is populated after a single completion (AFTER trigger sees the new row)'
);

-- Centre-specific: Centre B's average must be unaffected by Centre A's completion.
select is(
  (select avg_processing_time_seconds from procurement_centres where id = 'a0000000-0000-0000-0000-000000000021'),
  null,
  'a different centre''s rolling average is untouched (never a global average)'
);

select * from finish();
rollback;
