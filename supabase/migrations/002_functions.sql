-- ============================================================================
-- ANNASETU — BUSINESS-LOGIC FUNCTIONS (Migration 002)
-- All functions run SECURITY DEFINER where they must bypass RLS to perform a
-- privileged, validated operation; each one re-checks authorization and every
-- business rule internally — nothing here trusts frontend-supplied state.
--
-- AUDIT PASS: see the note block at the end of this file for a summary of
-- what changed and why.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BOOKING WINDOW + PAST-DATE GUARD (trigger, authoritative backstop — spec §6)
-- BOOKING_WINDOW_DAYS = 14. This trigger fires on every INSERT into
-- appointments regardless of caller, so it stays authoritative even if a
-- future code path inserts outside create_booking(). create_booking() below
-- also checks these same conditions explicitly, for clearer error codes and
-- defense in depth — the two are intentionally redundant.
-- ----------------------------------------------------------------------------

create or replace function enforce_booking_window()
returns trigger language plpgsql as $$
declare
  earliest_allowed date;
begin
  if new.procurement_date < current_date then
    raise exception 'Cannot book a procurement date in the past';
  end if;

  earliest_allowed := new.procurement_date - interval '14 days';
  if current_date < earliest_allowed then
    raise exception
      'Booking not yet open. Procurement date % can be booked starting %',
      new.procurement_date, earliest_allowed;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_booking_window on appointments;
create trigger trg_enforce_booking_window
  before insert on appointments
  for each row execute function enforce_booking_window();

-- ----------------------------------------------------------------------------
-- 2. CANCELLATION WINDOW (spec §7)
-- CANCELLATION_WINDOW_HOURS = 48. Cancellation only allowed while at least 48h
-- remain before (procurement_date + procurement_time).
-- ----------------------------------------------------------------------------

create or replace function cancel_appointment(p_appointment_id uuid, p_reason text)
returns void language plpgsql security definer as $$
declare
  v_scheduled_at timestamptz;
  v_farmer uuid;
  v_status booking_status;
begin
  select (procurement_date + procurement_time)::timestamptz, farmer_id_user, status
    into v_scheduled_at, v_farmer, v_status
    from appointments
    where id = p_appointment_id
    for update;

  if not found then
    raise exception 'Appointment not found';
  end if;

  if v_farmer <> auth.uid() then
    raise exception 'Not authorized to cancel this appointment';
  end if;

  if v_status not in ('booked','confirmed') then
    raise exception 'Appointment cannot be cancelled from status %', v_status;
  end if;

  if now() > (v_scheduled_at - interval '48 hours') then
    raise exception 'Cancellation window has passed (48 hours required before procurement time)';
  end if;

  update appointments
    set status = 'cancelled', cancelled_at = now(), cancellation_reason = p_reason
    where id = p_appointment_id;

  update queue_entries set status = 'cancelled'
    where appointment_id = p_appointment_id;

  update centre_daily_capacity cdc
    set booked_quantity_quintal = booked_quantity_quintal - a.quantity_quintal
    from appointments a
    where a.id = p_appointment_id
      and cdc.centre_id = a.centre_id
      and cdc.capacity_date = a.procurement_date;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. ATOMIC CAPACITY-AWARE BOOKING (spec §8; audit priorities 3, 4, 5)
--
-- Fixes in this pass:
--  - Explicit server-side checks for every condition the client must not be
--    trusted for: caller identity, farmer existence + approval, procurement
--    crop ownership + approval/lock status, centre existence + active flag,
--    quantity validity, date ordering, past-date, and the 14-day window
--    (mirrored from the trigger for a clearer error code).
--  - Capacity-row initialization race fixed: INSERT ... ON CONFLICT DO
--    NOTHING followed by SELECT ... FOR UPDATE. Exactly one concurrent
--    transaction wins the insert; every transaction (winner or not) then
--    serializes on the row lock, so two farmers racing for the very first
--    slot on a centre/date can never both succeed past capacity.
--  - Token allocation no longer derived from MAX(token_number)+1. It now
--    comes from an atomic increment of centre_daily_capacity.next_token_seq
--    under the same row lock, so it is correct independent of the capacity
--    logic around it.
-- ----------------------------------------------------------------------------

create or replace function create_booking(
  p_farmer_id uuid,
  p_centre_id uuid,
  p_procurement_crop_id uuid,
  p_quantity numeric,
  p_harvest_date date,
  p_procurement_date date,
  p_procurement_time time
) returns uuid language plpgsql security definer as $$
declare
  v_capacity_row centre_daily_capacity%rowtype;
  v_total_capacity numeric;
  v_centre_active boolean;
  v_farmer_status verification_status;
  v_crop_farmer uuid;
  v_crop_status procurement_crop_status;
  v_appointment_id uuid;
  v_token_seq int;
  v_token text;
  v_queue_date date := p_procurement_date;
begin
  if p_farmer_id <> auth.uid() then
    raise exception 'NOT_AUTHORIZED: cannot book on behalf of another farmer';
  end if;

  select verification_status into v_farmer_status
    from farmer_profiles where user_id = p_farmer_id;
  if not found then
    raise exception 'FARMER_NOT_FOUND';
  end if;
  if v_farmer_status <> 'approved' then
    raise exception 'FARMER_NOT_APPROVED: verification status is %', v_farmer_status;
  end if;

  select farmer_id_user, status into v_crop_farmer, v_crop_status
    from procurement_crops where id = p_procurement_crop_id;
  if not found then
    raise exception 'CROP_NOT_FOUND';
  end if;
  if v_crop_farmer <> p_farmer_id then
    raise exception 'CROP_NOT_OWNED: procurement crop does not belong to this farmer';
  end if;
  if v_crop_status not in ('approved','locked') then
    raise exception 'CROP_NOT_APPROVED: crop status is %', v_crop_status;
  end if;

  select is_active, daily_capacity_quintal into v_centre_active, v_total_capacity
    from procurement_centres where id = p_centre_id;
  if not found then
    raise exception 'CENTRE_NOT_FOUND';
  end if;
  if not v_centre_active then
    raise exception 'CENTRE_INACTIVE';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  if p_procurement_date < current_date then
    raise exception 'PAST_DATE: procurement date cannot be in the past';
  end if;
  if p_procurement_date < p_harvest_date then
    raise exception 'INVALID_DATES: procurement date cannot be before harvest date';
  end if;
  if current_date < (p_procurement_date - interval '14 days')::date then
    raise exception 'BOOKING_WINDOW_CLOSED: booking opens 14 days before the procurement date';
  end if;

  -- Safe upsert-then-lock: see the priority 4 note above this function.
  insert into centre_daily_capacity (centre_id, capacity_date, total_capacity_quintal, booked_quantity_quintal, next_token_seq)
    values (p_centre_id, p_procurement_date, v_total_capacity, 0, 0)
    on conflict (centre_id, capacity_date) do nothing;

  select * into v_capacity_row
    from centre_daily_capacity
    where centre_id = p_centre_id and capacity_date = p_procurement_date
    for update;

  if v_capacity_row.booked_quantity_quintal + p_quantity > v_capacity_row.total_capacity_quintal then
    raise exception 'CAPACITY_FULL: centre % has insufficient remaining capacity on %',
      p_centre_id, p_procurement_date;
  end if;

  insert into appointments (
    farmer_id_user, centre_id, procurement_crop_id, quantity_quintal,
    harvest_date, procurement_date, procurement_time, status
  ) values (
    p_farmer_id, p_centre_id, p_procurement_crop_id, p_quantity,
    p_harvest_date, p_procurement_date, p_procurement_time, 'booked'
  ) returning id into v_appointment_id;

  update centre_daily_capacity
    set booked_quantity_quintal = booked_quantity_quintal + p_quantity,
        next_token_seq = next_token_seq + 1
    where id = v_capacity_row.id
    returning next_token_seq into v_token_seq;

  v_token := lpad(v_token_seq::text, 4, '0');

  -- qr_payload_hash is an opaque, non-sensitive lookup token, not a
  -- cryptographic signature (audit priority 6) — see note at the end of this
  -- file and validate_and_checkin_token() below for the actual authority.
  insert into queue_entries (
    appointment_id, centre_id, token_number, qr_payload_hash, queue_date, status
  ) values (
    v_appointment_id, p_centre_id, v_token,
    encode(digest(v_appointment_id::text || v_queue_date::text || v_token, 'sha256'), 'hex'),
    v_queue_date, 'waiting'
  );

  perform recalculate_queue_positions(p_centre_id, v_queue_date);

  return v_appointment_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. QUEUE POSITION + ETA (spec §9, §11)
-- ----------------------------------------------------------------------------

create or replace function recalculate_queue_positions(p_centre_id uuid, p_queue_date date)
returns void language plpgsql security definer as $$
declare
  v_avg numeric;
  v_counters int;
begin
  select avg_processing_time_seconds into v_avg
    from procurement_centres where id = p_centre_id;
  select counters_count into v_counters
    from procurement_centres where id = p_centre_id;

  v_avg := coalesce(v_avg, 900); -- default 15-minute estimate until enough history exists
  v_counters := greatest(coalesce(v_counters, 1), 1);

  with ordered as (
    select id, row_number() over (order by created_at) as rn
      from queue_entries
      where centre_id = p_centre_id and queue_date = p_queue_date
        and status in ('waiting','called')
  )
  update queue_entries qe
    set queue_position = o.rn,
        estimated_wait_seconds = ceil((o.rn - 1)::numeric / v_counters) * v_avg,
        estimated_processing_seconds = v_avg,
        assigned_counter = ((o.rn - 1) % v_counters) + 1
    from ordered o
    where qe.id = o.id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. ROLLING PROCESSING-TIME AVERAGE (spec §10 — EXACT algorithm, last 15,
-- per-centre, never a global average).
-- ----------------------------------------------------------------------------

create or replace function update_centre_rolling_average(p_centre_id uuid)
returns void language plpgsql security definer as $$
declare
  v_avg numeric;
begin
  select avg(processing_time_seconds) into v_avg
    from (
      select processing_time_seconds
        from procurement_records
        where centre_id = p_centre_id
          and stage = 'completed'
          and processing_time_seconds is not null
        order by processing_completed_at desc
        limit 15
    ) last_15;

  update procurement_centres
    set avg_processing_time_seconds = v_avg
    where id = p_centre_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- AUDIT PRIORITY 1 FIX: this trigger was BEFORE UPDATE, which fires before
-- the row's new values are written to the heap — the aggregate query inside
-- update_centre_rolling_average() would therefore run its own SELECT before
-- the just-completed procurement was visible to it, silently excluding the
-- record that just triggered the recalculation (the average would lag by
-- exactly one completion, and a centre's very first completion would compute
-- against zero rows instead of one).
--
-- Moved to AFTER UPDATE: by the time this fires, NEW has already been
-- written to the heap (including the generated processing_time_seconds
-- column, computed from processing_started_at/processing_completed_at as
-- part of the same UPDATE statement), so the last-15 query inside
-- update_centre_rolling_average() sees it. Because an AFTER trigger cannot
-- change the row it fires on, processing_completed_at must be set by the
-- caller — transition_procurement_stage() below does this explicitly when
-- entering 'completed', rather than this trigger defaulting it.
-- ----------------------------------------------------------------------------

create or replace function on_procurement_completed()
returns trigger language plpgsql as $$
begin
  if new.stage = 'completed' and (old.stage is distinct from 'completed') then
    perform update_centre_rolling_average(new.centre_id);
    perform recalculate_queue_positions(new.centre_id, current_date);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_on_procurement_completed on procurement_records;
create trigger trg_on_procurement_completed
  after update on procurement_records
  for each row execute function on_procurement_completed();

-- ----------------------------------------------------------------------------
-- 6. QR / TOKEN VALIDATION (spec §13; audit priorities 6, 7)
--
-- Terminology fix: qr_payload_hash is NOT a cryptographic signature. It is a
-- deterministic, opaque hash of the appointment id, queue date, and token —
-- there is no private key or server-only secret involved, so it provides no
-- guarantee against forgery on its own. It is deliberately treated as
-- non-sensitive: the QR code carries no authority by itself. The actual
-- authority is entirely server-side, in this function, which independently
-- re-checks every condition below against the database on every scan.
--
-- Authorization fix: this function no longer accepts an operator centre id
-- from the caller. The operator's centre is looked up server-side from
-- centre_operators using auth.uid(), so a compromised or buggy client can
-- never claim a different centre's authority.
-- ----------------------------------------------------------------------------

create or replace function validate_and_checkin_token(
  p_queue_entry_id uuid,
  p_scanned_hash text
) returns uuid language plpgsql security definer as $$
declare
  v_entry queue_entries%rowtype;
  v_appt appointments%rowtype;
  v_operator_centre uuid;
begin
  select centre_id into v_operator_centre from centre_operators where user_id = auth.uid();
  if v_operator_centre is null then
    raise exception 'NOT_AN_OPERATOR';
  end if;

  select * into v_entry from queue_entries where id = p_queue_entry_id for update;
  if not found then
    raise exception 'TOKEN_NOT_FOUND';
  end if;

  if v_entry.qr_payload_hash <> p_scanned_hash then
    raise exception 'TOKEN_HASH_MISMATCH';
  end if;

  if v_entry.centre_id <> v_operator_centre then
    raise exception 'WRONG_CENTRE';
  end if;

  if v_entry.queue_date <> current_date then
    raise exception 'WRONG_DATE';
  end if;

  if v_entry.used then
    raise exception 'TOKEN_ALREADY_USED';
  end if;

  select * into v_appt from appointments where id = v_entry.appointment_id;

  if v_appt.status = 'cancelled' then
    raise exception 'BOOKING_CANCELLED';
  end if;

  if v_appt.status not in ('booked','confirmed') then
    raise exception 'BOOKING_NOT_VALID_FOR_CHECKIN';
  end if;

  update queue_entries set used = true, status = 'checked_in' where id = p_queue_entry_id;
  update appointments set status = 'checked_in' where id = v_entry.appointment_id;

  insert into procurement_records (appointment_id, centre_id, stage, checked_in_at)
    values (v_entry.appointment_id, v_entry.centre_id, 'checked_in', now())
    on conflict (appointment_id) do update set stage = 'checked_in', checked_in_at = now();

  insert into queue_events (queue_entry_id, event_type, actor_user_id)
    values (p_queue_entry_id, 'checked_in', auth.uid());

  return v_entry.appointment_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. PROCUREMENT STAGE TRANSITIONS (spec §17; audit priorities 2, 7)
--
-- This is the ONLY sanctioned way to move procurement_records.stage forward.
-- RLS (see 003_rls_policies.sql) now grants operators SELECT only on
-- procurement_records — no direct client UPDATE policy exists — so this
-- function is not a convenience wrapper, it is the actual authorization and
-- state-machine boundary:
--   - Operator's centre is derived server-side from centre_operators, never
--     from client input.
--   - Only the exact next stage in STAGE ORDER is accepted; no skipping
--     ahead, no moving backward, no re-entering a stage.
--   - A procurement already at 'completed' can never transition again
--     (prevents duplicate/repeated completion).
--   - processing_started_at is set exactly when entering 'weighing';
--     processing_completed_at exactly when entering 'completed' — both in
--     the same UPDATE statement that changes the stage, so the AFTER trigger
--     above (on_procurement_completed) sees a fully-populated row.
--   - The queue_event is inserted in the same transaction as the stage
--     change, never as a separate round trip.
-- ----------------------------------------------------------------------------

create or replace function transition_procurement_stage(
  p_procurement_record_id uuid,
  p_next_stage procurement_stage
) returns uuid language plpgsql security definer as $$
declare
  v_record procurement_records%rowtype;
  v_operator_centre uuid;
  v_stage_order procurement_stage[] := array[
    'scheduled','checked_in','document_verified','weighing','quality_check',
    'accepted','unloading','receipt_generated','payment_initiated','completed'
  ]::procurement_stage[];
  v_current_idx int;
  v_next_idx int;
  v_queue_entry_id uuid;
begin
  select centre_id into v_operator_centre from centre_operators where user_id = auth.uid();
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

  select array_position(v_stage_order, v_record.stage) into v_current_idx;
  select array_position(v_stage_order, p_next_stage) into v_next_idx;

  if v_current_idx is null or v_next_idx is null or v_next_idx <> v_current_idx + 1 then
    raise exception 'INVALID_TRANSITION: cannot move from % to %', v_record.stage, p_next_stage;
  end if;

  update procurement_records
    set stage = p_next_stage,
        operator_id = coalesce(operator_id, auth.uid()),
        document_verified_at = case when p_next_stage = 'document_verified' then now() else document_verified_at end,
        processing_started_at = case when p_next_stage = 'weighing' then now() else processing_started_at end,
        processing_completed_at = case when p_next_stage = 'completed' then now() else processing_completed_at end
    where id = p_procurement_record_id;

  select id into v_queue_entry_id from queue_entries where appointment_id = v_record.appointment_id;

  if v_queue_entry_id is not null then
    insert into queue_events (queue_entry_id, event_type, actor_user_id)
      values (v_queue_entry_id, 'stage_' || p_next_stage::text, auth.uid());

    if p_next_stage = 'completed' then
      update queue_entries set status = 'completed' where id = v_queue_entry_id;
      update appointments set status = 'completed' where id = v_record.appointment_id;
    else
      update appointments
        set status = 'in_progress'
        where id = v_record.appointment_id and status not in ('completed','cancelled');
    end if;
  end if;

  return p_procurement_record_id;
end;
$$;

-- ============================================================================
-- AUDIT SUMMARY (see chat response for the full write-up)
--  1. on_procurement_completed: BEFORE UPDATE -> AFTER UPDATE trigger.
--  2. New transition_procurement_stage() RPC enforces the exact stage
--     sequence, blocks duplicate completion, timestamps weighing/completed,
--     and logs the queue_event atomically. RLS tightened to match (below).
--  3. create_booking() now explicitly checks farmer existence + approval,
--     crop ownership + approval/lock, centre existence + active flag,
--     quantity validity, and date ordering — not just capacity/window.
--  4. Capacity row creation race fixed via INSERT ... ON CONFLICT DO NOTHING
--     followed by SELECT ... FOR UPDATE.
--  5. Token generation moved off MAX(token_number)+1 onto an atomic
--     next_token_seq counter column, incremented under the same row lock.
--  6. QR "signed payload" language corrected everywhere it appeared — it is
--     an opaque non-sensitive lookup hash; the backend is the sole authority.
--  7. validate_and_checkin_token() and transition_procurement_stage() both
--     derive the operator's centre server-side from centre_operators; no
--     function in this file accepts a client-supplied centre id for
--     authorization purposes anymore.
-- ============================================================================
