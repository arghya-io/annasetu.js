-- ============================================================================
-- ANNASETU — BOOKING, QUEUE & PROCUREMENT PROCESSING TESTS (pgTAP)
-- Run via: supabase start && npm run test:db
-- Exercises migration 008 end-to-end: eligibility, operating hours, working
-- days, per-crop quantity, duplicate + capacity + slot limits, the 48-hour
-- cancellation rule (IST), QR check-in, the staged weighing → grading →
-- receipt → (mock) payment flow, live queue re-ranking and no-show close-out.
-- ============================================================================

begin;
select * from no_plan();

create or replace function tid(n int) returns uuid language sql immutable as $$
  select ('e0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
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

-- First non-Sunday date at least p_n days from today (centres default to Mon–Sat).
create or replace function tnextday(p_n int) returns date language sql stable as $$
  select d::date from generate_series(app_today() + p_n, app_today() + p_n + 6, interval '1 day') d
   where extract(isodow from d) <> 7 order by d limit 1
$$;

-- The next Sunday within the 14-day booking window.
create or replace function tsunday() returns date language sql stable as $$
  select d::date from generate_series(app_today() + 1, app_today() + 8, interval '1 day') d
   where extract(isodow from d) = 7 order by d limit 1
$$;

create or replace function tmk_farmer(p_id uuid, p_district uuid, p_sub uuid, p_state uuid, p_status verification_status)
returns void language plpgsql as $$
begin
  perform create_test_auth_user(p_id, p_id::text || '@test.local');
  insert into users (id, role, full_name) values (p_id, 'farmer', 'Farmer ' || left(p_id::text, 4));
  insert into farmer_profiles (user_id, farmer_category, first_name, last_name, date_of_birth, gender,
                               mobile_number, address_line, state_id, district_id, sub_district_id, verification_status)
  values (p_id, 'owner_cultivator', 'Test', 'Farmer', '1990-01-01', 'male', '9876543210', 'Addr',
          p_state, p_district, p_sub, p_status);
end;
$$;

-- ---- fixtures ----------------------------------------------------------------
insert into states (id, name, code) values (tid(1), 'Book State', 'BS'), (tid(4), 'Far State', 'FS');
insert into districts (id, state_id, name) values (tid(2), tid(1), 'Book District'), (tid(5), tid(4), 'Far District');
insert into sub_districts (id, district_id, name) values (tid(3), tid(2), 'Book Block'), (tid(6), tid(5), 'Far Block');

insert into crops (id, name, msp_per_quintal) values (tid(30), 'Book Wheat', 2000);

insert into procurement_centres (id, name, code, state_id, district_id, sub_district_id, daily_capacity_quintal, counters_count) values
  (tid(10), 'Centre A',      'BK-A', tid(1), tid(2), tid(3), 100, 1),
  (tid(11), 'Centre B tiny', 'BK-B', tid(1), tid(2), tid(3), 5,   1),
  (tid(13), 'Centre far',    'BK-D', tid(4), tid(5), tid(6), 100, 1);
insert into procurement_centres (id, name, code, state_id, district_id, sub_district_id, daily_capacity_quintal, counters_count, avg_processing_time_seconds) values
  (tid(12), 'Centre C slow', 'BK-C', tid(1), tid(2), tid(3), 100, 1, 1800);  -- 1 booking per 30-minute slot

select tmk_farmer(tid(20), tid(2), tid(3), tid(1), 'approved');
select tmk_farmer(tid(21), tid(2), tid(3), tid(1), 'approved');
select tmk_farmer(tid(22), tid(2), tid(3), tid(1), 'under_verification');

insert into procurement_crops (id, farmer_id_user, crop_id, expected_quantity, status) values
  (tid(40), tid(20), tid(30), 50, 'locked'),
  (tid(41), tid(21), tid(30), 50, 'locked');

select create_test_auth_user(tid(50), 'op-a@test.local');
select create_test_auth_user(tid(51), 'op-b@test.local');
insert into users (id, role, full_name) values (tid(50), 'centre_operator', 'Operator A'), (tid(51), 'centre_operator', 'Operator B');
insert into centre_operators (user_id, centre_id) values (tid(50), tid(10)), (tid(51), tid(11));

-- ============================================================================
-- 1. BOOKING
-- ============================================================================
select act_as(tid(20));

select lives_ok(
  $$ select create_booking(tid(20), tid(10), tid(40), 10, app_today() - 1, tnextday(5), '10:00') $$,
  'an approved farmer can book a slot at an eligible centre'
);
select is(
  (select token_number from queue_entries where appointment_id = (select id from appointments where farmer_id_user = tid(20))),
  '0001', 'the first booking of the day gets token 0001'
);
select is(
  (select booked_quantity_quintal from centre_daily_capacity where centre_id = tid(10) and capacity_date = tnextday(5)),
  10.00::numeric, 'centre capacity is reserved atomically with the booking'
);
select is(
  (select queue_position from queue_entries where appointment_id = (select id from appointments where farmer_id_user = tid(20))),
  1, 'the new booking is ranked first in the queue'
);
select is((select count(*) from notifications where user_id = tid(20) and type = 'booking_confirmed'), 1::bigint, 'the farmer is notified of the booking');

select throws_like(
  $$ select create_booking(tid(20), tid(10), tid(40), 5, app_today() - 1, tnextday(5), '11:00') $$,
  'DUPLICATE_BOOKING%', 'the same crop cannot be booked twice for one date'
);
select throws_like(
  $$ select create_booking(tid(20), tid(10), tid(40), 5, app_today() - 1, tnextday(6), '20:00') $$,
  'OUTSIDE_OPERATING_HOURS%', 'a time outside the centre''s operating hours is refused'
);
select throws_like(
  $$ select create_booking(tid(20), tid(10), tid(40), 5, app_today() - 1, tsunday(), '10:00') $$,
  'CENTRE_CLOSED%', 'a day the centre does not work is refused'
);
select throws_like(
  $$ select create_booking(tid(20), tid(10), tid(40), 45, app_today() - 1, tnextday(7), '10:00') $$,
  'QUANTITY_EXCEEDS_APPROVED%', 'total booked quantity cannot exceed the approved crop quantity (10 already booked of 50)'
);
select throws_like(
  $$ select create_booking(tid(20), tid(13), tid(40), 5, app_today() - 1, tnextday(7), '10:00') $$,
  'CENTRE_NOT_ELIGIBLE%', 'a centre in another state does not serve this farmer'
);
select throws_like(
  $$ select create_booking(tid(21), tid(10), tid(41), 5, app_today() - 1, tnextday(7), '10:00') $$,
  'NOT_AUTHORIZED%', 'a farmer cannot book on behalf of someone else'
);
select throws_like(
  $$ select create_booking(tid(20), tid(10), tid(40), 5, app_today() - 1, app_today() + 15, '10:00') $$,
  'BOOKING_WINDOW_CLOSED%', 'booking opens only 14 days ahead'
);
select throws_like(
  $$ select create_booking(tid(20), tid(10), tid(40), 5, app_today() - 1, app_today() - 1, '10:00') $$,
  'PAST_DATE%', 'a past procurement date is refused'
);

select act_as(tid(22));
select throws_like(
  $$ select create_booking(tid(22), tid(10), tid(40), 5, app_today() - 1, tnextday(7), '10:00') $$,
  'FARMER_NOT_APPROVED%', 'a farmer whose registration is not approved cannot book'
);

-- Capacity + slot limits (farmer two)
select act_as(tid(21));
select throws_like(
  $$ select create_booking(tid(21), tid(11), tid(41), 6, app_today() - 1, tnextday(6), '10:00') $$,
  'CAPACITY_FULL%', 'a booking larger than the centre''s remaining capacity is refused'
);

select act_as(tid(20));
select lives_ok(
  $$ select create_booking(tid(20), tid(12), tid(40), 1, app_today() - 1, tnextday(8), '10:00') $$,
  'the first booking in a slot at a slow centre succeeds'
);
select act_as(tid(21));
select throws_like(
  $$ select create_booking(tid(21), tid(12), tid(41), 1, app_today() - 1, tnextday(8), '10:15') $$,
  'SLOT_FULL%', 'a second booking in an already-full 30-minute slot is refused'
);
select lives_ok(
  $$ select create_booking(tid(21), tid(12), tid(41), 1, app_today() - 1, tnextday(8), '10:30') $$,
  'the next slot at the same centre is still bookable'
);

-- ============================================================================
-- 2. CANCELLATION (48h rule, evaluated in IST)
-- ============================================================================
select act_as(tid(20));
select lives_ok(
  $$ select cancel_appointment((select id from appointments where farmer_id_user = tid(20) and centre_id = tid(10)), 'plans changed') $$,
  'a booking more than 48 hours away can be cancelled'
);
select is((select status::text from appointments where farmer_id_user = tid(20) and centre_id = tid(10)), 'cancelled', 'the appointment is cancelled');
select is(
  (select booked_quantity_quintal from centre_daily_capacity where centre_id = tid(10) and capacity_date = tnextday(5)),
  0.00::numeric, 'cancellation releases the reserved capacity'
);
select is((select status::text from queue_entries where appointment_id = (select id from appointments where farmer_id_user = tid(20) and centre_id = tid(10))),
  'cancelled', 'the queue entry is cancelled');

-- A booking inside the 48h window: move the slot to tomorrow, then try to cancel.
update appointments set procurement_date = app_today() + 1
 where farmer_id_user = tid(20) and centre_id = tid(12);
select throws_like(
  $$ select cancel_appointment((select id from appointments where farmer_id_user = tid(20) and centre_id = tid(12)), 'too late') $$,
  'CANCELLATION_WINDOW_PASSED%', 'a booking within 48 hours of the slot cannot be cancelled'
);
select act_as(tid(21));
select throws_like(
  $$ select cancel_appointment((select id from appointments where farmer_id_user = tid(20) and centre_id = tid(12)), 'not mine') $$,
  'NOT_AUTHORIZED%', 'a farmer cannot cancel someone else''s booking'
);

-- ============================================================================
-- 3. QUEUE ORDER (by slot, then booking time) + re-ranking
-- ============================================================================
insert into appointments (id, farmer_id_user, centre_id, procurement_crop_id, quantity_quintal, harvest_date, procurement_date, procurement_time, status) values
  (tid(60), tid(21), tid(10), tid(41), 12, app_today() - 1, app_today(), '11:00', 'booked'),
  (tid(62), tid(20), tid(10), tid(40), 8,  app_today() - 1, app_today(), '10:00', 'booked');
insert into queue_entries (id, appointment_id, centre_id, token_number, qr_payload_hash, queue_date, status) values
  (tid(61), tid(60), tid(10), '9001', 'hash-ok-123', app_today(), 'waiting'),
  (tid(63), tid(62), tid(10), '9002', 'hash-two-456', app_today(), 'waiting');
select recalculate_queue_positions(tid(10), app_today());

select is((select queue_position from queue_entries where id = tid(63)), 1, 'the earlier SLOT is ranked first even though it was booked later');
select is((select queue_position from queue_entries where id = tid(61)), 2, 'the later slot is ranked second');

update queue_entries set status = 'cancelled' where id = tid(63);
select recalculate_queue_positions(tid(10), app_today());
select is((select queue_position from queue_entries where id = tid(61)), 1, 'when someone leaves the queue, everyone behind moves up');
select is((select queue_position from queue_entries where id = tid(63)), null, 'a cancelled entry no longer holds a position');

-- ============================================================================
-- 4. CHECK-IN BY QR
-- ============================================================================
select act_as(tid(50));
select throws_like($$ select validate_and_checkin_token(tid(61), 'wrong-hash') $$, 'TOKEN_HASH_MISMATCH%', 'a wrong QR secret is refused');

select act_as(tid(51));
select throws_like($$ select validate_and_checkin_token(tid(61), 'hash-ok-123') $$, 'WRONG_CENTRE%', 'an operator of another centre cannot check the farmer in');

select act_as(tid(20));
select throws_like($$ select validate_and_checkin_token(tid(61), 'hash-ok-123') $$, 'NOT_AN_OPERATOR%', 'a farmer cannot check anyone in');

select act_as(tid(50));
select is((select validate_and_checkin_token(tid(61), 'hash-ok-123')), tid(60), 'the right operator checks the farmer in');
select is((select stage::text from procurement_records where appointment_id = tid(60)), 'checked_in', 'a procurement record is created at the checked_in stage');
select is((select status::text from queue_entries where id = tid(61)), 'checked_in', 'the queue entry is checked in');
select is((select status::text from appointments where id = tid(60)), 'checked_in', 'the appointment is checked in');
select throws_like($$ select validate_and_checkin_token(tid(61), 'hash-ok-123') $$, 'TOKEN_ALREADY_USED%', 'a token cannot be used twice');

select lives_ok($$ select call_queue_token(tid(61)) $$, 'the operator can call a checked-in token to a counter');
select is((select status::text from queue_entries where id = tid(61)), 'called', 'the token is now called');

-- ============================================================================
-- 5. STAGED PROCESSING: weighing → grading → receipt → (mock) payment
-- ============================================================================
create temp table t_rec as select id from procurement_records where appointment_id = tid(60);
grant all on t_rec to public;

select throws_like(
  $$ select transition_procurement_stage((select id from t_rec), 'weighing') $$,
  'INVALID_TRANSITION%', 'stages cannot be skipped'
);
select lives_ok($$ select transition_procurement_stage((select id from t_rec), 'document_verified') $$, 'documents verified');
select lives_ok($$ select transition_procurement_stage((select id from t_rec), 'weighing') $$, 'weighing started');
select is((select status::text from queue_entries where id = tid(61)), 'in_progress', 'the queue entry is in progress once weighing starts');
select throws_like(
  $$ select transition_procurement_stage((select id from t_rec), 'quality_check') $$,
  'WEIGHT_REQUIRED%', 'the weighed quantity is mandatory'
);
select lives_ok(
  $$ select transition_procurement_stage((select id from t_rec), 'quality_check', '{"weighed_quantity_quintal": 11.5}'::jsonb) $$,
  'weight recorded'
);
select throws_like(
  $$ select transition_procurement_stage((select id from t_rec), 'accepted', '{"quality_grade":"A","accepted_quantity_quintal":12}'::jsonb) $$,
  'ACCEPTED_EXCEEDS_WEIGHED%', 'accepted quantity cannot exceed the weighed quantity'
);
select throws_like(
  $$ select transition_procurement_stage((select id from t_rec), 'accepted', '{"quality_grade":"Z","accepted_quantity_quintal":10}'::jsonb) $$,
  'GRADE_REQUIRED%', 'the grade must be A, B or C'
);
select lives_ok(
  $$ select transition_procurement_stage((select id from t_rec), 'accepted', '{"quality_grade":"B","accepted_quantity_quintal":11}'::jsonb) $$,
  'produce accepted with a grade and quantity'
);
select lives_ok($$ select transition_procurement_stage((select id from t_rec), 'unloading') $$, 'unloading');
select lives_ok($$ select transition_procurement_stage((select id from t_rec), 'receipt_generated') $$, 'receipt generated');
select ok((select receipt_number from procurement_records where id = (select id from t_rec)) like 'RCPT-%', 'a receipt number is issued');
select lives_ok($$ select transition_procurement_stage((select id from t_rec), 'payment_initiated') $$, 'payment initiated');
select is(
  (select amount from payment_records where procurement_record_id = (select id from t_rec)),
  22000.00::numeric, 'the (mock) payment is accepted quantity × MSP: 11 × 2000'
);
select is((select is_mock from payment_records where procurement_record_id = (select id from t_rec)), true, 'the payment is flagged as a simulation');
select lives_ok($$ select transition_procurement_stage((select id from t_rec), 'completed') $$, 'procurement completed');

select is((select status::text from payment_records where procurement_record_id = (select id from t_rec)), 'payment_completed', 'the mock payment completes');
select is((select status::text from appointments where id = tid(60)), 'completed', 'the appointment is completed');
select is((select status::text from queue_entries where id = tid(61)), 'completed', 'the queue entry is completed');
select ok((select avg_processing_time_seconds from procurement_centres where id = tid(10)) is not null, 'the centre''s rolling average was updated');
select is((select count(*) from notifications where user_id = tid(21) and type in ('produce_accepted','receipt_generated','payment_initiated','procurement_completed')),
  4::bigint, 'the farmer is notified at each milestone');
select throws_like($$ select transition_procurement_stage((select id from t_rec), 'completed') $$, 'ALREADY_COMPLETED%', 'a completed procurement is final');

-- ============================================================================
-- 6. NO-SHOW CLOSE-OUT
-- ============================================================================
set local session_replication_role = replica;  -- fixture only: bypass the past-date trigger and FKs
insert into appointments (id, farmer_id_user, centre_id, procurement_crop_id, quantity_quintal, harvest_date, procurement_date, procurement_time, status)
  values (tid(70), tid(20), tid(10), tid(40), 5, app_today() - 5, app_today() - 2, '10:00', 'booked');
insert into queue_entries (id, appointment_id, centre_id, token_number, qr_payload_hash, queue_date, status)
  values (tid(71), tid(70), tid(10), '9101', 'hash-old', app_today() - 2, 'waiting');
set local session_replication_role = origin;

select is(mark_no_shows(), 1, 'exactly the one missed booking is closed out');
select is((select status::text from appointments where id = tid(70)), 'no_show', 'the missed booking is marked no_show');
select is((select status::text from queue_entries where id = tid(71)), 'no_show', 'its queue entry is marked no_show');
select is((select count(*) from notifications where user_id = tid(20) and type = 'booking_no_show'), 1::bigint, 'the farmer is told');
select is(mark_no_shows(), 0, 'running the close-out again is a no-op');

select * from finish();
rollback;
