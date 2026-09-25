-- ============================================================================
-- ANNASETU — BOOKING, QUEUE & PROCESSING ENGINE (Migration 008)
-- Rewrites the 002 functions with: IST business dates, account-state checks,
-- fixed search_path, farmer↔centre eligibility, operating hours / working days,
-- 30-minute slot capacity, per-crop quantity limits, live queue positions on
-- every state change, staged weighing → grading → receipt → (mock) payment
-- data capture, notifications, and no-show close-out.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. SCHEMA ADDITIONS
-- ----------------------------------------------------------------------------

create sequence if not exists application_id_seq;
create sequence if not exists receipt_number_seq;

alter table procurement_records
  add column if not exists weighed_quantity_quintal numeric(10,2),
  add column if not exists remarks text;

do $$
begin
  alter table procurement_records
    add constraint procurement_records_weighed_positive
    check (weighed_quantity_quintal is null or weighed_quantity_quintal > 0) not valid;
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table procurement_records
    add constraint procurement_records_grade_valid
    check (quality_grade is null or quality_grade in ('A', 'B', 'C')) not valid;
exception when duplicate_object then null;
end
$$;

-- ----------------------------------------------------------------------------
-- 1. SMALL INTERNAL HELPERS
-- ----------------------------------------------------------------------------

create or replace function notify_user(
  p_user uuid, p_type text, p_title text, p_body text, p_data jsonb default null
) returns void language sql security definer set search_path = public, pg_temp as $$
  insert into notifications (user_id, type, title, body, data)
  values (p_user, p_type, p_title, p_body, p_data)
$$;

-- Numeric value of a JSON key, or NULL when absent / not a plain number.
create or replace function jsonb_num(p_data jsonb, p_key text)
returns numeric language sql immutable set search_path = pg_catalog as $$
  select case when (p_data ->> p_key) ~ '^[0-9]+(\.[0-9]+)?$'
              then (p_data ->> p_key)::numeric
              else null end
$$;

-- ----------------------------------------------------------------------------
-- 2. BOOKING WINDOW TRIGGER (IST)
-- ----------------------------------------------------------------------------

create or replace function enforce_booking_window()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_today date := app_today();
begin
  if new.procurement_date < v_today then
    raise exception 'PAST_DATE: cannot book a procurement date in the past';
  end if;
  if v_today < (new.procurement_date - 14) then
    raise exception 'BOOKING_WINDOW_CLOSED: booking opens 14 days before the procurement date';
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. ELIGIBLE CENTRES + SLOT PREVIEW
-- A centre is eligible when it is active, in the farmer's state, and either in
-- the farmer's district or (when the farmer's district has no active centre)
-- anywhere in the same state.
-- ----------------------------------------------------------------------------

create or replace function centre_is_eligible(p_centre uuid, p_farmer uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from farmer_profiles fp
      join procurement_centres pc on pc.id = p_centre and pc.is_active
     where fp.user_id = p_farmer
       and pc.state_id = fp.state_id
       and (pc.district_id = fp.district_id
            or not exists (select 1 from procurement_centres pc2
                            where pc2.is_active and pc2.district_id = fp.district_id)))
$$;

create or replace function list_eligible_centres()
returns table (
  centre_id uuid, centre_name text, centre_code text, centre_address text,
  opens_at time, closes_at time, open_days text[],
  daily_capacity numeric, counters integer, avg_processing_seconds numeric
) language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_farmer() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
    select pc.id, pc.name, pc.code, pc.address,
           pc.operating_start_time, pc.operating_end_time, pc.working_days,
           pc.daily_capacity_quintal, pc.counters_count, pc.avg_processing_time_seconds
      from procurement_centres pc
     where pc.is_active and centre_is_eligible(pc.id, auth.uid())
     order by pc.name;
end;
$$;

-- Live capacity / queue / slot availability for one centre and date.
create or replace function get_slot_preview(p_centre_id uuid, p_date date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_c procurement_centres%rowtype;
  v_cap centre_daily_capacity%rowtype;
  v_avg numeric;
  v_counters integer;
  v_slot_capacity integer;
  v_queue_len integer;
  v_first time;
  v_span numeric;
  v_slots jsonb;
  v_total numeric;
  v_booked numeric;
  v_today date := app_today();
begin
  if auth.uid() is null or not account_is_usable(auth.uid()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_c from procurement_centres where id = p_centre_id and is_active;
  if not found then
    raise exception 'CENTRE_NOT_FOUND';
  end if;

  v_avg := coalesce(v_c.avg_processing_time_seconds, 900);
  v_counters := greatest(v_c.counters_count, 1);
  v_slot_capacity := greatest(1, floor(v_counters * 1800.0 / greatest(v_avg, 60))::integer);

  select * into v_cap from centre_daily_capacity
   where centre_id = p_centre_id and capacity_date = p_date;
  v_total := coalesce(v_cap.total_capacity_quintal, v_c.daily_capacity_quintal);
  v_booked := coalesce(v_cap.booked_quantity_quintal, 0);

  select count(*) into v_queue_len
    from queue_entries
   where centre_id = p_centre_id and queue_date = p_date
     and status in ('waiting', 'checked_in', 'called', 'in_progress');

  v_first := make_time(
    extract(hour from v_c.operating_start_time)::integer,
    (extract(minute from v_c.operating_start_time)::integer / 30) * 30,
    0);
  v_span := extract(epoch from (v_c.operating_end_time - v_first));

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'start', substr(x.slot::text, 1, 5),
             'used', x.used,
             'capacity', v_slot_capacity,
             'past', x.is_past)
           order by x.slot), '[]'::jsonb)
    into v_slots
    from (
      select s.slot,
             (select count(*) from appointments a
               where a.centre_id = p_centre_id
                 and a.procurement_date = p_date
                 and a.status in ('booked', 'confirmed', 'checked_in', 'in_progress', 'completed')
                 and a.procurement_time >= s.slot
                 and (a.procurement_time - s.slot) < interval '30 minutes') as used,
             (p_date = v_today and (s.slot + interval '30 minutes') <= app_now_local()::time) as is_past
        from (select v_first + (n * interval '30 minutes') as slot
                from generate_series(0, 47) n
               where n * 1800 < v_span) s
    ) x;

  return jsonb_build_object(
    'centre_id', p_centre_id,
    'date', p_date,
    'total_capacity_quintal', v_total,
    'booked_quintal', v_booked,
    'remaining_quintal', greatest(v_total - v_booked, 0),
    'queue_length', v_queue_len,
    'counters', v_counters,
    'avg_processing_seconds', v_avg,
    'estimated_wait_seconds', ceil(v_queue_len::numeric / v_counters) * v_avg,
    'opens_at', substr(v_c.operating_start_time::text, 1, 5),
    'closes_at', substr(v_c.operating_end_time::text, 1, 5),
    'open_days', to_jsonb(v_c.working_days),
    'is_open_day', ((array['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow from p_date)::integer]
                     = any (v_c.working_days)),
    'slots', v_slots);
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. QUEUE POSITIONS + ETA
-- Order = scheduled slot, then booking time. Live on every change (booking,
-- cancellation, check-in, call, completion): positions are (re)written for
-- everyone still to be served and CLEARED for everyone who is not.
-- ----------------------------------------------------------------------------

create or replace function recalculate_queue_positions(p_centre_id uuid, p_queue_date date)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_avg numeric;
  v_counters integer;
begin
  select coalesce(avg_processing_time_seconds, 900), greatest(coalesce(counters_count, 1), 1)
    into v_avg, v_counters
    from procurement_centres where id = p_centre_id;
  if not found then
    return;
  end if;

  with ordered as (
    select qe.id,
           row_number() over (order by a.procurement_time, qe.created_at, qe.id) as rn
      from queue_entries qe
      join appointments a on a.id = qe.appointment_id
     where qe.centre_id = p_centre_id
       and qe.queue_date = p_queue_date
       and qe.status in ('waiting', 'checked_in', 'called')
  )
  update queue_entries qe
     set queue_position = o.rn,
         estimated_wait_seconds = ceil((o.rn - 1)::numeric / v_counters) * v_avg,
         estimated_processing_seconds = v_avg,
         assigned_counter = ((o.rn - 1) % v_counters) + 1
    from ordered o
   where qe.id = o.id;

  update queue_entries
     set queue_position = null,
         estimated_wait_seconds = null,
         assigned_counter = null
   where centre_id = p_centre_id
     and queue_date = p_queue_date
     and status not in ('waiting', 'checked_in', 'called')
     and (queue_position is not null or estimated_wait_seconds is not null or assigned_counter is not null);
end;
$$;

-- Rolling average of the LAST 15 completed procurements, per centre.
create or replace function update_centre_rolling_average(p_centre_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_avg numeric;
begin
  select avg(l.processing_time_seconds) into v_avg
    from (
      select pr.processing_time_seconds
        from procurement_records pr
       where pr.centre_id = p_centre_id
         and pr.stage = 'completed'
         and pr.processing_time_seconds is not null
       order by pr.processing_completed_at desc
       limit 15
    ) l;

  update procurement_centres set avg_processing_time_seconds = v_avg where id = p_centre_id;
end;
$$;

create or replace function on_procurement_completed()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.stage = 'completed' and old.stage is distinct from 'completed' then
    perform update_centre_rolling_average(new.centre_id);
    perform recalculate_queue_positions(new.centre_id, app_today());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_on_procurement_completed on procurement_records;
create trigger trg_on_procurement_completed
  after update on procurement_records
  for each row execute function on_procurement_completed();

-- ----------------------------------------------------------------------------
-- 5. create_booking
-- ----------------------------------------------------------------------------

create or replace function create_booking(
  p_farmer_id uuid,
  p_centre_id uuid,
  p_procurement_crop_id uuid,
  p_quantity numeric,
  p_harvest_date date,
  p_procurement_date date,
  p_procurement_time time
) returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_today date := app_today();
  v_farmer_status verification_status;
  v_crop procurement_crops%rowtype;
  v_centre procurement_centres%rowtype;
  v_cap centre_daily_capacity%rowtype;
  v_appointment_id uuid;
  v_token_seq integer;
  v_token text;
  v_already numeric;
  v_avg numeric;
  v_slot_capacity integer;
  v_slot_start time;
  v_slot_used integer;
begin
  if v_uid is null or p_farmer_id is distinct from v_uid then
    raise exception 'NOT_AUTHORIZED: cannot book on behalf of another farmer';
  end if;
  if not is_farmer() then
    raise exception 'NOT_AUTHORIZED: only an active farmer account can book';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;
  if p_harvest_date is null or p_procurement_date is null or p_procurement_time is null then
    raise exception 'INVALID_INPUT: harvest date, procurement date and time are required';
  end if;

  select fp.verification_status into v_farmer_status
    from farmer_profiles fp where fp.user_id = v_uid;
  if not found then
    raise exception 'FARMER_NOT_FOUND';
  end if;
  if v_farmer_status <> 'approved' then
    raise exception 'FARMER_NOT_APPROVED: verification status is %', v_farmer_status;
  end if;

  -- Lock the crop row first (consistent lock order: crop, then capacity).
  select * into v_crop from procurement_crops where id = p_procurement_crop_id for update;
  if not found then
    raise exception 'CROP_NOT_FOUND';
  end if;
  if v_crop.farmer_id_user <> v_uid then
    raise exception 'CROP_NOT_OWNED: procurement crop does not belong to this farmer';
  end if;
  if v_crop.status not in ('approved', 'locked') then
    raise exception 'CROP_NOT_APPROVED: crop status is %', v_crop.status;
  end if;

  select * into v_centre from procurement_centres where id = p_centre_id;
  if not found then
    raise exception 'CENTRE_NOT_FOUND';
  end if;
  if not v_centre.is_active then
    raise exception 'CENTRE_INACTIVE';
  end if;
  if not centre_is_eligible(p_centre_id, v_uid) then
    raise exception 'CENTRE_NOT_ELIGIBLE: this centre does not serve your district';
  end if;

  if p_procurement_date < v_today then
    raise exception 'PAST_DATE: procurement date cannot be in the past';
  end if;
  if p_procurement_date < p_harvest_date then
    raise exception 'INVALID_DATES: procurement date cannot be before harvest date';
  end if;
  if p_harvest_date > v_today then
    raise exception 'INVALID_DATES: harvest date cannot be in the future';
  end if;
  if v_today < (p_procurement_date - 14) then
    raise exception 'BOOKING_WINDOW_CLOSED: booking opens 14 days before the procurement date';
  end if;

  if not ((array['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow from p_procurement_date)::integer]
          = any (v_centre.working_days)) then
    raise exception 'CENTRE_CLOSED: the centre does not operate on that day';
  end if;
  if p_procurement_time < v_centre.operating_start_time
     or p_procurement_time >= v_centre.operating_end_time then
    raise exception 'OUTSIDE_OPERATING_HOURS: centre is open % to %',
      substr(v_centre.operating_start_time::text, 1, 5), substr(v_centre.operating_end_time::text, 1, 5);
  end if;
  if p_procurement_date = v_today and p_procurement_time <= app_now_local()::time then
    raise exception 'SLOT_IN_PAST: choose a later time today';
  end if;

  -- Total booked for this crop may never exceed what the government approved.
  select coalesce(sum(a.quantity_quintal), 0) into v_already
    from appointments a
   where a.procurement_crop_id = p_procurement_crop_id
     and a.status in ('booked', 'confirmed', 'checked_in', 'in_progress', 'completed');
  if v_already + p_quantity > v_crop.expected_quantity then
    raise exception 'QUANTITY_EXCEEDS_APPROVED: only % quintal of this crop remains bookable',
      greatest(v_crop.expected_quantity - v_already, 0);
  end if;

  if exists (
    select 1 from appointments a
     where a.farmer_id_user = v_uid
       and a.procurement_crop_id = p_procurement_crop_id
       and a.procurement_date = p_procurement_date
       and a.status in ('booked', 'confirmed', 'checked_in', 'in_progress')
  ) then
    raise exception 'DUPLICATE_BOOKING: you already have a booking for this crop on that date';
  end if;

  -- Safe upsert-then-lock on the day's capacity row.
  insert into centre_daily_capacity (centre_id, capacity_date, total_capacity_quintal, booked_quantity_quintal, next_token_seq)
    values (p_centre_id, p_procurement_date, v_centre.daily_capacity_quintal, 0, 0)
    on conflict (centre_id, capacity_date) do nothing;

  select * into v_cap from centre_daily_capacity
   where centre_id = p_centre_id and capacity_date = p_procurement_date
   for update;

  if v_cap.booked_quantity_quintal + p_quantity > v_cap.total_capacity_quintal then
    raise exception 'CAPACITY_FULL: the centre has % quintal left on that date',
      greatest(v_cap.total_capacity_quintal - v_cap.booked_quantity_quintal, 0);
  end if;

  -- 30-minute slot throughput (serialised by the capacity row lock above).
  v_avg := coalesce(v_centre.avg_processing_time_seconds, 900);
  v_slot_capacity := greatest(1, floor(greatest(v_centre.counters_count, 1) * 1800.0 / greatest(v_avg, 60))::integer);
  v_slot_start := make_time(
    extract(hour from p_procurement_time)::integer,
    (extract(minute from p_procurement_time)::integer / 30) * 30,
    0);
  select count(*) into v_slot_used
    from appointments a
   where a.centre_id = p_centre_id
     and a.procurement_date = p_procurement_date
     and a.status in ('booked', 'confirmed', 'checked_in', 'in_progress', 'completed')
     and a.procurement_time >= v_slot_start
     and (a.procurement_time - v_slot_start) < interval '30 minutes';
  if v_slot_used >= v_slot_capacity then
    raise exception 'SLOT_FULL: that time slot is fully booked, choose another';
  end if;

  insert into appointments (
    farmer_id_user, centre_id, procurement_crop_id, quantity_quintal,
    harvest_date, procurement_date, procurement_time, status
  ) values (
    v_uid, p_centre_id, p_procurement_crop_id, p_quantity,
    p_harvest_date, p_procurement_date, p_procurement_time, 'booked'
  ) returning id into v_appointment_id;

  update centre_daily_capacity
     set booked_quantity_quintal = booked_quantity_quintal + p_quantity,
         next_token_seq = next_token_seq + 1
   where id = v_cap.id
   returning next_token_seq into v_token_seq;

  v_token := lpad(v_token_seq::text, 4, '0');

  -- qr_payload_hash: a random, unguessable bearer value shown only to the
  -- owning farmer (as a QR). The database — not the QR — is the authority:
  -- validate_and_checkin_token() re-checks everything on every scan.
  insert into queue_entries (appointment_id, centre_id, token_number, qr_payload_hash, queue_date, status)
    values (v_appointment_id, p_centre_id, v_token, encode(gen_random_bytes(24), 'hex'), p_procurement_date, 'waiting');

  perform recalculate_queue_positions(p_centre_id, p_procurement_date);

  perform notify_user(
    v_uid, 'booking_confirmed', 'Booking confirmed',
    format('Token %s at %s on %s, %s. Show your QR code at the centre.',
           v_token, v_centre.name, to_char(p_procurement_date, 'DD Mon YYYY'),
           substr(p_procurement_time::text, 1, 5)),
    jsonb_build_object('appointment_id', v_appointment_id));

  return v_appointment_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. cancel_appointment (48h rule evaluated in IST)
-- ----------------------------------------------------------------------------

create or replace function cancel_appointment(p_appointment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_appt appointments%rowtype;
begin
  if v_uid is null or not is_farmer() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_appt from appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;
  if v_appt.farmer_id_user is distinct from v_uid then
    raise exception 'NOT_AUTHORIZED: not your appointment';
  end if;
  if v_appt.status not in ('booked', 'confirmed') then
    raise exception 'INVALID_STATUS: appointment cannot be cancelled from status %', v_appt.status;
  end if;
  if now() > app_local_ts(v_appt.procurement_date, v_appt.procurement_time) - interval '48 hours' then
    raise exception 'CANCELLATION_WINDOW_PASSED: bookings can only be cancelled at least 48 hours before the slot';
  end if;

  update appointments
     set status = 'cancelled', cancelled_at = now(),
         cancellation_reason = left(coalesce(p_reason, ''), 500)
   where id = p_appointment_id;

  update queue_entries
     set status = 'cancelled', queue_position = null, estimated_wait_seconds = null, assigned_counter = null
   where appointment_id = p_appointment_id;

  update centre_daily_capacity
     set booked_quantity_quintal = greatest(0, booked_quantity_quintal - v_appt.quantity_quintal)
   where centre_id = v_appt.centre_id and capacity_date = v_appt.procurement_date;

  perform recalculate_queue_positions(v_appt.centre_id, v_appt.procurement_date);

  perform notify_user(
    v_uid, 'booking_cancelled', 'Booking cancelled',
    format('Your booking on %s has been cancelled.', to_char(v_appt.procurement_date, 'DD Mon YYYY')),
    jsonb_build_object('appointment_id', p_appointment_id));
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. CHECK-IN BY QR
-- ----------------------------------------------------------------------------

create or replace function validate_and_checkin_token(p_queue_entry_id uuid, p_scanned_hash text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_entry queue_entries%rowtype;
  v_appt appointments%rowtype;
  v_operator_centre uuid := current_operator_centre_id();
begin
  if v_operator_centre is null then
    raise exception 'NOT_AN_OPERATOR';
  end if;

  select * into v_entry from queue_entries where id = p_queue_entry_id for update;
  if not found then
    raise exception 'TOKEN_NOT_FOUND';
  end if;
  if p_scanned_hash is null or v_entry.qr_payload_hash <> p_scanned_hash then
    raise exception 'TOKEN_HASH_MISMATCH';
  end if;
  if v_entry.centre_id <> v_operator_centre then
    raise exception 'WRONG_CENTRE';
  end if;
  if v_entry.queue_date <> app_today() then
    raise exception 'WRONG_DATE';
  end if;
  if v_entry.used then
    raise exception 'TOKEN_ALREADY_USED';
  end if;
  if v_entry.status not in ('waiting', 'called') then
    raise exception 'TOKEN_NOT_ACTIVE: token status is %', v_entry.status;
  end if;

  select * into v_appt from appointments where id = v_entry.appointment_id for update;
  if v_appt.status = 'cancelled' then
    raise exception 'BOOKING_CANCELLED';
  end if;
  if v_appt.status not in ('booked', 'confirmed') then
    raise exception 'BOOKING_NOT_VALID_FOR_CHECKIN';
  end if;

  update queue_entries set used = true, status = 'checked_in' where id = p_queue_entry_id;
  update appointments set status = 'checked_in' where id = v_entry.appointment_id;

  insert into procurement_records (appointment_id, centre_id, stage, checked_in_at)
    values (v_entry.appointment_id, v_entry.centre_id, 'checked_in', now())
    on conflict (appointment_id) do nothing;

  insert into queue_events (queue_entry_id, event_type, actor_user_id)
    values (p_queue_entry_id, 'checked_in', auth.uid());

  perform recalculate_queue_positions(v_entry.centre_id, v_entry.queue_date);

  perform notify_user(
    v_appt.farmer_id_user, 'checked_in', 'Checked in',
    format('You are checked in with token %s. Please wait to be called.', v_entry.token_number),
    jsonb_build_object('appointment_id', v_entry.appointment_id));

  return v_entry.appointment_id;
end;
$$;

-- Operator calls a checked-in farmer to a counter.
create or replace function call_queue_token(p_queue_entry_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_centre uuid := current_operator_centre_id();
  v_entry queue_entries%rowtype;
  v_farmer uuid;
begin
  if v_centre is null then
    raise exception 'NOT_AN_OPERATOR';
  end if;

  select * into v_entry from queue_entries where id = p_queue_entry_id for update;
  if not found then
    raise exception 'TOKEN_NOT_FOUND';
  end if;
  if v_entry.centre_id <> v_centre then
    raise exception 'WRONG_CENTRE';
  end if;
  if v_entry.status <> 'checked_in' then
    raise exception 'INVALID_STATUS: only checked-in tokens can be called';
  end if;

  update queue_entries set status = 'called' where id = p_queue_entry_id;
  insert into queue_events (queue_entry_id, event_type, actor_user_id)
    values (p_queue_entry_id, 'called', auth.uid());

  select a.farmer_id_user into v_farmer from appointments a where a.id = v_entry.appointment_id;
  perform notify_user(
    v_farmer, 'token_called', 'Your token was called',
    format('Token %s: please proceed to counter %s.', v_entry.token_number, coalesce(v_entry.assigned_counter, 1)),
    jsonb_build_object('appointment_id', v_entry.appointment_id));

  perform recalculate_queue_positions(v_entry.centre_id, v_entry.queue_date);
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. PROCUREMENT STAGE TRANSITIONS — with the data each stage must capture.
--
--   quality_check      needs  weighed_quantity_quintal
--   accepted           needs  quality_grade (A/B/C) and accepted_quantity_quintal
--                             (> 0, <= weighed, <= booked quantity)
--   receipt_generated  generates the receipt number
--   payment_initiated  creates the (MOCK) payment: accepted qty × crop MSP
--   completed          completes the (MOCK) payment, updates rolling average
-- ----------------------------------------------------------------------------

drop function if exists transition_procurement_stage(uuid, procurement_stage);

create or replace function transition_procurement_stage(
  p_procurement_record_id uuid,
  p_next_stage procurement_stage,
  p_data jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_operator_centre uuid := current_operator_centre_id();
  v_record procurement_records%rowtype;
  v_appt appointments%rowtype;
  v_stage_order procurement_stage[] := array[
    'scheduled','checked_in','document_verified','weighing','quality_check',
    'accepted','unloading','receipt_generated','payment_initiated','completed'
  ]::procurement_stage[];
  v_current_idx integer;
  v_next_idx integer;
  v_queue_entry_id uuid;
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_weighed numeric;
  v_accepted numeric;
  v_grade text;
  v_receipt text;
  v_msp numeric;
  v_amount numeric;
  v_crop_name text;
begin
  if v_operator_centre is null then
    raise exception 'NOT_AN_OPERATOR';
  end if;

  select * into v_record from procurement_records where id = p_procurement_record_id for update;
  if not found then
    raise exception 'PROCUREMENT_RECORD_NOT_FOUND';
  end if;
  if v_record.centre_id <> v_operator_centre then
    raise exception 'WRONG_CENTRE: operator is not assigned to this procurement''s centre';
  end if;
  if v_record.stage = 'completed' then
    raise exception 'ALREADY_COMPLETED: cannot transition a completed procurement';
  end if;

  v_current_idx := array_position(v_stage_order, v_record.stage);
  v_next_idx := array_position(v_stage_order, p_next_stage);
  if v_current_idx is null or v_next_idx is null or v_next_idx <> v_current_idx + 1 then
    raise exception 'INVALID_TRANSITION: cannot move from % to %', v_record.stage, p_next_stage;
  end if;

  select * into v_appt from appointments where id = v_record.appointment_id for update;

  -- ---- stage-specific validation / data ------------------------------------
  if p_next_stage = 'quality_check' then
    v_weighed := jsonb_num(v_data, 'weighed_quantity_quintal');
    if v_weighed is null or v_weighed <= 0 then
      raise exception 'WEIGHT_REQUIRED: enter the weighed quantity (quintal) to continue';
    end if;
  elsif p_next_stage = 'accepted' then
    v_grade := upper(coalesce(v_data ->> 'quality_grade', ''));
    v_accepted := jsonb_num(v_data, 'accepted_quantity_quintal');
    if v_grade not in ('A', 'B', 'C') then
      raise exception 'GRADE_REQUIRED: quality grade must be A, B or C';
    end if;
    if v_accepted is null or v_accepted <= 0 then
      raise exception 'ACCEPTED_QUANTITY_REQUIRED: enter the accepted quantity (quintal)';
    end if;
    if v_accepted > coalesce(v_record.weighed_quantity_quintal, 0) then
      raise exception 'ACCEPTED_EXCEEDS_WEIGHED: accepted quantity cannot exceed the weighed quantity';
    end if;
    if v_accepted > v_appt.quantity_quintal then
      raise exception 'ACCEPTED_EXCEEDS_BOOKED: accepted quantity cannot exceed the booked quantity (% quintal)',
        v_appt.quantity_quintal;
    end if;
  elsif p_next_stage = 'receipt_generated' then
    if v_record.accepted_quantity_quintal is null then
      raise exception 'ACCEPTED_QUANTITY_REQUIRED: nothing has been accepted yet';
    end if;
    v_receipt := 'RCPT-' || to_char(app_today(), 'YYYYMMDD') || '-' || lpad(nextval('receipt_number_seq')::text, 6, '0');
  end if;

  update procurement_records
     set stage = p_next_stage,
         operator_id = coalesce(operator_id, auth.uid()),
         document_verified_at = case when p_next_stage = 'document_verified' then now() else document_verified_at end,
         processing_started_at = case when p_next_stage = 'weighing' then now() else processing_started_at end,
         processing_completed_at = case when p_next_stage = 'completed' then now() else processing_completed_at end,
         weighed_quantity_quintal = case when p_next_stage = 'quality_check' then v_weighed else weighed_quantity_quintal end,
         quality_grade = case when p_next_stage = 'accepted' then v_grade else quality_grade end,
         accepted_quantity_quintal = case when p_next_stage = 'accepted' then v_accepted else accepted_quantity_quintal end,
         receipt_number = case when p_next_stage = 'receipt_generated' then v_receipt else receipt_number end,
         remarks = case when (v_data ->> 'remarks') is not null then left(v_data ->> 'remarks', 500) else remarks end
   where id = p_procurement_record_id;

  select c.name, coalesce(c.msp_per_quintal, 0)
    into v_crop_name, v_msp
    from procurement_crops pc join crops c on c.id = pc.crop_id
   where pc.id = v_appt.procurement_crop_id;

  if p_next_stage = 'payment_initiated' then
    v_amount := round(v_record.accepted_quantity_quintal * v_msp, 2);
    insert into payment_records (procurement_record_id, farmer_id_user, amount, status, is_mock, reference_code, initiated_at)
      values (v_record.id, v_appt.farmer_id_user, v_amount, 'payment_initiated', true,
              'MOCK-' || upper(encode(gen_random_bytes(5), 'hex')), now());
  elsif p_next_stage = 'completed' then
    update payment_records
       set status = 'payment_completed', completed_at = now()
     where procurement_record_id = v_record.id and status <> 'payment_completed';
  end if;

  -- ---- queue entry + appointment status -------------------------------------
  select id into v_queue_entry_id from queue_entries where appointment_id = v_record.appointment_id;

  if v_queue_entry_id is not null then
    insert into queue_events (queue_entry_id, event_type, event_data, actor_user_id)
      values (v_queue_entry_id, 'stage_' || p_next_stage::text,
              jsonb_strip_nulls(jsonb_build_object(
                'weighed_quantity_quintal', v_weighed,
                'quality_grade', v_grade,
                'accepted_quantity_quintal', v_accepted,
                'receipt_number', v_receipt)),
              auth.uid());

    if p_next_stage = 'weighing' then
      update queue_entries set status = 'in_progress' where id = v_queue_entry_id;
    elsif p_next_stage = 'completed' then
      update queue_entries set status = 'completed' where id = v_queue_entry_id;
    end if;
  end if;

  if p_next_stage = 'completed' then
    update appointments set status = 'completed' where id = v_record.appointment_id;
  else
    update appointments set status = 'in_progress'
     where id = v_record.appointment_id and status not in ('completed', 'cancelled');
  end if;

  -- The queue is re-ranked when someone leaves it (weighing starts / completion).
  if p_next_stage in ('weighing', 'completed') then
    perform recalculate_queue_positions(v_record.centre_id, v_appt.procurement_date);
  end if;

  -- ---- farmer notifications --------------------------------------------------
  if p_next_stage = 'accepted' then
    perform notify_user(v_appt.farmer_id_user, 'produce_accepted', 'Produce accepted',
      format('%s quintal of %s accepted, grade %s.', v_accepted, v_crop_name, v_grade),
      jsonb_build_object('appointment_id', v_record.appointment_id));
  elsif p_next_stage = 'receipt_generated' then
    perform notify_user(v_appt.farmer_id_user, 'receipt_generated', 'Receipt generated',
      format('Your receipt number is %s.', v_receipt),
      jsonb_build_object('appointment_id', v_record.appointment_id));
  elsif p_next_stage = 'payment_initiated' then
    perform notify_user(v_appt.farmer_id_user, 'payment_initiated', 'Payment initiated',
      format('A payment of Rs %s has been initiated (prototype: simulated payment).', v_amount),
      jsonb_build_object('appointment_id', v_record.appointment_id));
  elsif p_next_stage = 'completed' then
    perform notify_user(v_appt.farmer_id_user, 'procurement_completed', 'Procurement completed',
      'Your procurement is complete and the (simulated) payment is marked completed.',
      jsonb_build_object('appointment_id', v_record.appointment_id));
  end if;

  return p_procurement_record_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. OPERATOR READ MODELS (minimal farmer detail, centre-scoped)
-- ----------------------------------------------------------------------------

create or replace function operator_queue(p_date date default null)
returns table (
  queue_entry_id uuid, appointment_id uuid, token text, entry_status queue_status,
  queue_pos integer, counter integer, eta_seconds numeric, scheduled_time time,
  farmer_name text, crop_name text, quantity numeric,
  record_id uuid, record_stage procurement_stage
) language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_centre uuid := current_operator_centre_id();
begin
  if v_centre is null then
    raise exception 'NOT_AN_OPERATOR';
  end if;
  return query
    select qe.id, qe.appointment_id, qe.token_number, qe.status,
           qe.queue_position, qe.assigned_counter, qe.estimated_wait_seconds, a.procurement_time,
           (fp.first_name || ' ' || fp.last_name), c.name, a.quantity_quintal,
           pr.id, pr.stage
      from queue_entries qe
      join appointments a on a.id = qe.appointment_id
      join farmer_profiles fp on fp.user_id = a.farmer_id_user
      join procurement_crops pcr on pcr.id = a.procurement_crop_id
      join crops c on c.id = pcr.crop_id
      left join procurement_records pr on pr.appointment_id = a.id
     where qe.centre_id = v_centre
       and qe.queue_date = coalesce(p_date, app_today())
     order by (qe.status in ('completed', 'cancelled', 'no_show')),
              qe.queue_position nulls last, a.procurement_time, qe.token_number;
end;
$$;

create or replace function operator_booking_details(p_appointment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_centre uuid := current_operator_centre_id();
  v_result jsonb;
begin
  if v_centre is null then
    raise exception 'NOT_AN_OPERATOR';
  end if;

  select jsonb_build_object(
           'appointment_id', a.id,
           'queue_entry_id', qe.id,
           'token', qe.token_number,
           'queue_status', qe.status,
           'procurement_date', a.procurement_date,
           'procurement_time', substr(a.procurement_time::text, 1, 5),
           'farmer_name', fp.first_name || ' ' || fp.last_name,
           'farmer_category', fp.farmer_category,
           'crop_name', c.name,
           'msp_per_quintal', c.msp_per_quintal,
           'booked_quantity_quintal', a.quantity_quintal,
           'record_id', pr.id,
           'stage', pr.stage,
           'weighed_quantity_quintal', pr.weighed_quantity_quintal,
           'accepted_quantity_quintal', pr.accepted_quantity_quintal,
           'quality_grade', pr.quality_grade,
           'receipt_number', pr.receipt_number,
           'payment_status', pay.status,
           'payment_amount', pay.amount,
           'payment_reference', pay.reference_code)
    into v_result
    from appointments a
    join queue_entries qe on qe.appointment_id = a.id
    join farmer_profiles fp on fp.user_id = a.farmer_id_user
    join procurement_crops pcr on pcr.id = a.procurement_crop_id
    join crops c on c.id = pcr.crop_id
    left join procurement_records pr on pr.appointment_id = a.id
    left join payment_records pay on pay.procurement_record_id = pr.id
   where a.id = p_appointment_id and a.centre_id = v_centre;

  if v_result is null then
    raise exception 'BOOKING_NOT_FOUND: no such booking at your centre';
  end if;
  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. NO-SHOW CLOSE-OUT (service role only; run daily by the cron route)
-- ----------------------------------------------------------------------------

create or replace function mark_no_shows()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  with upd as (
    update appointments
       set status = 'no_show'
     where procurement_date < app_today()
       and status in ('booked', 'confirmed')
    returning id, farmer_id_user, procurement_date
  ), q as (
    update queue_entries qe
       set status = 'no_show', queue_position = null, estimated_wait_seconds = null, assigned_counter = null
      from upd
     where qe.appointment_id = upd.id
    returning qe.id
  ), n as (
    insert into notifications (user_id, type, title, body)
      select upd.farmer_id_user, 'booking_no_show', 'Booking missed',
             'You did not visit the centre on ' || to_char(upd.procurement_date, 'DD Mon YYYY')
             || '. Please book a new slot if you still want to sell.'
        from upd
    returning id
  )
  select count(*) into v_count from upd;

  return v_count;
end;
$$;
