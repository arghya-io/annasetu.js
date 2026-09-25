-- ============================================================================
-- ANNASETU — ROW LEVEL SECURITY (Migration 003)
-- Frontend role checks are UX only. This file is the real authorization
-- boundary (spec §12, §19). Enable RLS on every table that holds
-- user/role-scoped data and add explicit policies — default deny otherwise.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper functions (STABLE, run as invoker so they read via the caller's RLS-
-- exempt lookup on `users`/role tables, which themselves are also RLS-protected
-- but readable by their own owner + admins per policies below).
-- ----------------------------------------------------------------------------

create or replace function current_role_is(p_role app_role)
returns boolean language sql stable as $$
  select exists (
    select 1 from users where id = auth.uid() and role = p_role and is_active
  );
$$;

create or replace function current_operator_centre_id()
returns uuid language sql stable as $$
  select centre_id from centre_operators where user_id = auth.uid();
$$;

create or replace function is_gov_admin() returns boolean language sql stable as $$
  select current_role_is('government_admin');
$$;

create or replace function is_centre_operator() returns boolean language sql stable as $$
  select current_role_is('centre_operator');
$$;

create or replace function is_csc_operator() returns boolean language sql stable as $$
  select current_role_is('csc_operator');
$$;

create or replace function is_farmer() returns boolean language sql stable as $$
  select current_role_is('farmer');
$$;

-- ----------------------------------------------------------------------------
-- USERS
-- ----------------------------------------------------------------------------
alter table users enable row level security;

create policy users_select_self on users
  for select using (id = auth.uid() or is_gov_admin());

create policy users_update_self on users
  for update using (id = auth.uid());

-- Inserts happen via a server-side trigger/function off auth.users signup, not
-- directly by clients — no client insert policy is granted.

-- ----------------------------------------------------------------------------
-- FARMER PROFILE + RELATED (farmer owns; gov_admin can read all for
-- verification; csc_operator can read for assistance but not write approvals;
-- centre_operator has NO access to farmer profile PII beyond what a booking
-- exposes).
-- ----------------------------------------------------------------------------
alter table farmer_profiles enable row level security;
alter table farmer_id_records enable row level security;
alter table farmer_verification enable row level security;
alter table farmer_documents enable row level security;
alter table face_templates enable row level security;
alter table land_owner_details enable row level security;
alter table land_records enable row level security;
alter table cultivation_records enable row level security;

create policy farmer_profiles_owner_rw on farmer_profiles
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy farmer_profiles_gov_admin_read on farmer_profiles
  for select using (is_gov_admin());

create policy farmer_profiles_csc_read on farmer_profiles
  for select using (is_csc_operator());

-- Gov admin can update verification_status only via the dedicated RPC
-- (approve_farmer_verification), which runs security definer; direct client
-- updates to farmer_profiles.verification_status by gov_admin are NOT granted
-- here on purpose, forcing the audited path.

create policy farmer_id_records_owner_rw on farmer_id_records
  for all using (farmer_id_user = auth.uid()) with check (farmer_id_user = auth.uid());
create policy farmer_id_records_gov_csc_read on farmer_id_records
  for select using (is_gov_admin() or is_csc_operator());

create policy farmer_verification_owner_read on farmer_verification
  for select using (farmer_id_user = auth.uid());
create policy farmer_verification_gov_admin_rw on farmer_verification
  for all using (is_gov_admin()) with check (is_gov_admin());

create policy farmer_documents_owner_rw on farmer_documents
  for all using (farmer_id_user = auth.uid()) with check (farmer_id_user = auth.uid());
create policy farmer_documents_gov_csc_read on farmer_documents
  for select using (is_gov_admin() or is_csc_operator());

create policy face_templates_owner_only on face_templates
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- No admin/operator read policy at all — biometric templates are never exposed
-- beyond the owning user (spec §5: "Do not expose biometric templates to
-- unauthorized users").

create policy land_owner_details_owner_rw on land_owner_details
  for all using (farmer_id_user = auth.uid()) with check (farmer_id_user = auth.uid());
create policy land_owner_details_gov_read on land_owner_details
  for select using (is_gov_admin());

create policy land_records_owner_rw on land_records
  for all using (farmer_id_user = auth.uid()) with check (farmer_id_user = auth.uid());
create policy land_records_gov_read on land_records
  for select using (is_gov_admin());

create policy cultivation_records_owner_rw on cultivation_records
  for all using (farmer_id_user = auth.uid()) with check (farmer_id_user = auth.uid());
create policy cultivation_records_gov_read on cultivation_records
  for select using (is_gov_admin());

-- ----------------------------------------------------------------------------
-- CROPS (reference data — public read, gov_admin write)
-- ----------------------------------------------------------------------------
alter table crops enable row level security;
create policy crops_public_read on crops for select using (true);
create policy crops_gov_admin_write on crops
  for insert with check (is_gov_admin());
create policy crops_gov_admin_update on crops
  for update using (is_gov_admin());

alter table farmer_crops enable row level security;
create policy farmer_crops_owner_rw on farmer_crops
  for all using (farmer_id_user = auth.uid()) with check (farmer_id_user = auth.uid());
create policy farmer_crops_gov_read on farmer_crops for select using (is_gov_admin());

-- procurement_crops: farmer can READ their own (never directly write once
-- locked — spec §2 Step 3, "cannot simply edit approved procurement crops").
alter table procurement_crops enable row level security;
create policy procurement_crops_owner_read on procurement_crops
  for select using (farmer_id_user = auth.uid());
create policy procurement_crops_owner_insert_pending on procurement_crops
  for insert with check (farmer_id_user = auth.uid() and status = 'pending_approval');
create policy procurement_crops_gov_admin_rw on procurement_crops
  for all using (is_gov_admin()) with check (is_gov_admin());
-- Centre operators can read approved crops only insofar as they appear on a
-- booking at their centre (handled via appointments join, not this table
-- directly) — no standalone operator policy is granted here.

alter table crop_change_requests enable row level security;
create policy crop_change_requests_owner_rw on crop_change_requests
  for select using (farmer_id_user = auth.uid());
create policy crop_change_requests_owner_insert on crop_change_requests
  for insert with check (farmer_id_user = auth.uid() and status = 'pending');
create policy crop_change_requests_gov_admin_rw on crop_change_requests
  for all using (is_gov_admin()) with check (is_gov_admin());
-- Explicitly: centre_operator and csc_operator get NO policy here at all →
-- default deny, matching "Operator cannot approve crop changes" / "CSC cannot
-- approve crop changes" (spec §12, §15).

-- ----------------------------------------------------------------------------
-- LOCATION TABLES — public read (needed for cascading selects), admin write
-- ----------------------------------------------------------------------------
alter table states enable row level security;
alter table districts enable row level security;
alter table sub_districts enable row level security;
alter table villages enable row level security;
alter table towns enable row level security;

create policy states_read on states for select using (true);
create policy districts_read on districts for select using (true);
create policy sub_districts_read on sub_districts for select using (true);
create policy villages_read on villages for select using (true);
create policy towns_read on towns for select using (true);
-- Writes to location tables happen only via migrations/seed with the
-- service-role key — no client write policy granted.

-- ----------------------------------------------------------------------------
-- PROCUREMENT CENTRES / OPERATORS / CAPACITY
-- ----------------------------------------------------------------------------
alter table procurement_centres enable row level security;
alter table centre_resources enable row level security;
alter table centre_daily_capacity enable row level security;
alter table government_admins enable row level security;
alter table csc_operators enable row level security;
alter table centre_operators enable row level security;

create policy procurement_centres_public_read on procurement_centres
  for select using (is_active or is_gov_admin());
create policy procurement_centres_gov_admin_write on procurement_centres
  for all using (is_gov_admin()) with check (is_gov_admin());

create policy centre_resources_read on centre_resources
  for select using (true);
create policy centre_resources_gov_admin_write on centre_resources
  for all using (is_gov_admin()) with check (is_gov_admin());

create policy centre_daily_capacity_read on centre_daily_capacity
  for select using (
    true -- capacity levels are non-sensitive and needed for booking UI/alt-slot search
  );
-- All writes to centre_daily_capacity go through create_booking()/cancel_appointment()
-- (SECURITY DEFINER) — no direct client write policy.

create policy government_admins_self_and_peers_read on government_admins
  for select using (user_id = auth.uid() or is_gov_admin());
create policy csc_operators_self_read on csc_operators
  for select using (user_id = auth.uid() or is_gov_admin());
create policy centre_operators_self_read on centre_operators
  for select using (user_id = auth.uid() or is_gov_admin());
-- Role-table rows are provisioned by gov_admin via a server action using the
-- admin client — no client insert policy on any of the three.

-- ----------------------------------------------------------------------------
-- APPOINTMENTS (bookings)
-- ----------------------------------------------------------------------------
alter table appointments enable row level security;

create policy appointments_farmer_rw on appointments
  for select using (farmer_id_user = auth.uid());
-- Inserts/updates/cancellation go through create_booking()/cancel_appointment()
-- RPCs (security definer, re-validate auth.uid() = farmer). No direct client
-- write policy — this closes the race-condition and IDOR surface at once.

create policy appointments_operator_own_centre_read on appointments
  for select using (is_centre_operator() and centre_id = current_operator_centre_id());

create policy appointments_gov_admin_read on appointments
  for select using (is_gov_admin());

-- ----------------------------------------------------------------------------
-- QUEUE ENTRIES / EVENTS
-- ----------------------------------------------------------------------------
alter table queue_entries enable row level security;
alter table queue_events enable row level security;

create policy queue_entries_farmer_read on queue_entries
  for select using (
    exists (select 1 from appointments a
            where a.id = queue_entries.appointment_id and a.farmer_id_user = auth.uid())
  );
create policy queue_entries_operator_own_centre on queue_entries
  for select using (is_centre_operator() and centre_id = current_operator_centre_id());
create policy queue_entries_gov_admin_read on queue_entries
  for select using (is_gov_admin());
-- All mutations go through validate_and_checkin_token() / create_booking() /
-- cancel_appointment() / recalculate_queue_positions() (all security definer).

create policy queue_events_farmer_read on queue_events
  for select using (
    exists (
      select 1 from queue_entries qe join appointments a on a.id = qe.appointment_id
      where qe.id = queue_events.queue_entry_id and a.farmer_id_user = auth.uid()
    )
  );
create policy queue_events_operator_own_centre on queue_events
  for select using (
    is_centre_operator() and exists (
      select 1 from queue_entries qe
      where qe.id = queue_events.queue_entry_id and qe.centre_id = current_operator_centre_id()
    )
  );
create policy queue_events_gov_admin_read on queue_events for select using (is_gov_admin());

-- ----------------------------------------------------------------------------
-- PROCUREMENT RECORDS / PAYMENTS
-- ----------------------------------------------------------------------------
alter table procurement_records enable row level security;
alter table payment_records enable row level security;

create policy procurement_records_farmer_read on procurement_records
  for select using (
    exists (select 1 from appointments a
            where a.id = procurement_records.appointment_id and a.farmer_id_user = auth.uid())
  );
create policy procurement_records_operator_own_centre_read on procurement_records
  for select using (is_centre_operator() and centre_id = current_operator_centre_id());
-- AUDIT FIX (priority 2): operators previously had `for all` here, which let
-- a client update procurement_records.stage directly — bypassing the state
-- machine entirely. No client write policy is granted on this table at all
-- now; every stage change must go through transition_procurement_stage()
-- (SECURITY DEFINER, database/functions.sql §7), which derives the
-- operator's centre server-side and enforces the exact stage sequence.
create policy procurement_records_gov_admin_read on procurement_records
  for select using (is_gov_admin());

create policy payment_records_farmer_read on payment_records
  for select using (farmer_id_user = auth.uid());
create policy payment_records_operator_own_centre_read on payment_records
  for select using (
    is_centre_operator() and exists (
      select 1 from procurement_records pr
      where pr.id = payment_records.procurement_record_id
        and pr.centre_id = current_operator_centre_id()
    )
  );
create policy payment_records_gov_admin_read on payment_records
  for select using (is_gov_admin());
-- Payment writes happen only through the mock-payment service action
-- (security definer) — no direct client write policy.

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS / HELP REQUESTS / ACKNOWLEDGEMENTS / AUDIT LOGS
-- ----------------------------------------------------------------------------
alter table notifications enable row level security;
alter table help_requests enable row level security;
alter table acknowledgements enable row level security;
alter table audit_logs enable row level security;

create policy notifications_owner_rw on notifications
  for select using (user_id = auth.uid());
create policy notifications_owner_mark_read on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Inserts are server-side only (notification service using admin client).

create policy help_requests_farmer_rw on help_requests
  for all using (farmer_id_user = auth.uid() or raised_by = auth.uid())
  with check (farmer_id_user = auth.uid() or raised_by = auth.uid());
create policy help_requests_csc_rw on help_requests
  for all using (is_csc_operator()) with check (is_csc_operator());
create policy help_requests_gov_admin_read on help_requests
  for select using (is_gov_admin());

create policy acknowledgements_owner_insert on acknowledgements
  for insert with check (farmer_id_user = auth.uid());
create policy acknowledgements_owner_read on acknowledgements
  for select using (farmer_id_user = auth.uid());
create policy acknowledgements_gov_admin_read on acknowledgements
  for select using (is_gov_admin());

create policy audit_logs_gov_admin_read on audit_logs
  for select using (is_gov_admin());
-- Audit logs are write-only from the app's perspective — all inserts happen
-- via a shared log_audit_event() helper called from every security-definer
-- function above, using the admin client. No client insert/update/delete
-- policy exists on this table at all.
