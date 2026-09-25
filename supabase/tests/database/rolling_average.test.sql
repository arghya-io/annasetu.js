-- ============================================================================
-- ANNASETU — ROLLING PROCESSING-TIME AVERAGE TESTS (pgTAP)
-- Exercises update_centre_rolling_average() directly against controlled
-- fixture rows, independent of the trigger-firing mechanics already covered
-- in booking_and_procurement.test.sql. Uses the exact worked example from
-- spec §10 (times summing to 298 minutes over 15 records -> 19.8667 min avg)
-- plus the fewer-than-15 and 16th-completion rollover cases.
-- ============================================================================

begin;
select * from no_plan();

insert into states (id, name, code) values
  ('b0000000-0000-0000-0000-000000000001', 'Avg Test State', 'AT') on conflict do nothing;
insert into districts (id, state_id, name) values
  ('b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Avg Test District') on conflict do nothing;

insert into procurement_centres (id, name, code, state_id, district_id, daily_capacity_quintal, is_active) values
  ('b0000000-0000-0000-0000-000000000010', 'Rolling Avg Centre', 'RAC-1',
   'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 1000, true),
  ('b0000000-0000-0000-0000-000000000011', 'Other Centre', 'RAC-2',
   'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 1000, true)
on conflict do nothing;

-- Helper: inserts a directly-completed procurement_record fixture (no
-- appointment/queue plumbing needed — this file tests the aggregate function
-- in isolation, not the full booking/check-in flow).
create or replace function insert_completed_fixture(
  p_centre_id uuid, p_seq int, p_minutes int, p_completed_at timestamptz
) returns void language plpgsql as $$
declare
  v_appt_id uuid := gen_random_uuid();
begin
  -- Fixture only: skip FK / trigger enforcement so we don't need a whole
  -- farmer + booking graph just to create a completed record.
  set local session_replication_role = replica;
  insert into procurement_records (
    appointment_id, centre_id, stage, processing_started_at, processing_completed_at
  ) values (
    v_appt_id, p_centre_id, 'completed',
    p_completed_at - (p_minutes || ' minutes')::interval, p_completed_at
  );
  set local session_replication_role = origin;
end;
$$;

-- ----------------------------------------------------------------------------
-- Fewer than 15 completed records: average must be over just what exists.
-- ----------------------------------------------------------------------------
select insert_completed_fixture('b0000000-0000-0000-0000-000000000010', 1, 18, now() - interval '14 days');
select insert_completed_fixture('b0000000-0000-0000-0000-000000000010', 2, 22, now() - interval '13 days');
select insert_completed_fixture('b0000000-0000-0000-0000-000000000010', 3, 15, now() - interval '12 days');
select update_centre_rolling_average('b0000000-0000-0000-0000-000000000010');

select ok(
  abs((select avg_processing_time_seconds from procurement_centres where id = 'b0000000-0000-0000-0000-000000000010')
      - (18+22+15)::numeric / 3 * 60) < 0.01,
  'with fewer than 15 completions, average is over the available records only'
);

-- ----------------------------------------------------------------------------
-- Exactly 15 completions: spec §10 worked example.
-- 18, 22, 15, 20, 17, 25, 19, 21, 23, 16, 18, 20, 24, 19, 21 -> sum 298, avg 19.8667 min
-- (continuing on from the 3 already inserted above means we need 12 more to
-- reach 15 total; to keep the numbers matching the spec exactly, this block
-- resets onto a clean centre instead.)
-- ----------------------------------------------------------------------------
insert into procurement_centres (id, name, code, state_id, district_id, daily_capacity_quintal, is_active) values
  ('b0000000-0000-0000-0000-000000000012', 'Exact 15 Centre', 'RAC-3',
   'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 1000, true)
on conflict do nothing;

do $$
declare
  v_times int[] := array[18,22,15,20,17,25,19,21,23,16,18,20,24,19,21];
  v_base timestamptz := now() - interval '20 days';
begin
  for i in 1..15 loop
    perform insert_completed_fixture(
      'b0000000-0000-0000-0000-000000000012', i, v_times[i], v_base + (i || ' hours')::interval
    );
  end loop;
end $$;

select update_centre_rolling_average('b0000000-0000-0000-0000-000000000012');

select ok(
  abs((select avg_processing_time_seconds from procurement_centres where id = 'b0000000-0000-0000-0000-000000000012')
      - (298.0 / 15 * 60)) < 0.01,
  'exactly 15 completions match the spec §10 worked example (298/15 = 19.8667 min)'
);

-- ----------------------------------------------------------------------------
-- 16th completion: oldest (seq 1, 18 min) rolls off; average now covers
-- seq 2..16 only.
-- ----------------------------------------------------------------------------
select insert_completed_fixture(
  'b0000000-0000-0000-0000-000000000012', 16, 30, now() - interval '20 days' + interval '16 hours'
);
select update_centre_rolling_average('b0000000-0000-0000-0000-000000000012');

select ok(
  abs((select avg_processing_time_seconds from procurement_centres where id = 'b0000000-0000-0000-0000-000000000012')
      - ((298 - 18 + 30)::numeric / 15 * 60)) < 0.01,
  '16th completion drops the oldest (seq 1) and includes the newest (seq 16)'
);

-- ----------------------------------------------------------------------------
-- Centre-specific: the "Other Centre" fixture (no completions) must be null,
-- proving no cross-centre bleed into a shared/global average.
-- ----------------------------------------------------------------------------
select update_centre_rolling_average('b0000000-0000-0000-0000-000000000011');
select is(
  (select avg_processing_time_seconds from procurement_centres where id = 'b0000000-0000-0000-0000-000000000011'),
  null,
  'a centre with zero completions has a null average, unaffected by other centres'' history'
);

select * from finish();
rollback;
