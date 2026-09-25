-- ============================================================================
-- ANNASETU — REFERENCE / DEMO SEED DATA  (run automatically by `supabase db reset`)
--
-- Plain reference data only: locations, crops, a demo centre. Accounts are NOT
-- seeded — Supabase Auth owns auth.users, and every account must be created
-- through the app or the Auth API. To create the first government admin, follow
-- supabase/bootstrap_first_admin.sql. Everything after that (farmers, CSC
-- operators, centre operators) is created by that admin from the UI.
-- ============================================================================

-- ---- Locations (minimal sample — extend as needed) ----
insert into states (id, name, code) values
  ('11111111-1111-1111-1111-111111111111', 'West Bengal', 'WB'),
  ('22222222-2222-2222-2222-222222222222', 'Punjab', 'PB')
on conflict do nothing;

insert into districts (id, state_id, name) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Nadia'),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'Ludhiana')
on conflict do nothing;

insert into sub_districts (id, district_id, name) values
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'Krishnanagar'),
  ('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444', 'Ludhiana East')
on conflict do nothing;

insert into villages (id, sub_district_id, name) values
  ('77777777-7777-7777-7777-777777777777', '55555555-5555-5555-5555-555555555555', 'Shibnibas'),
  ('88888888-8888-8888-8888-888888888888', '66666666-6666-6666-6666-666666666666', 'Sahnewal')
on conflict do nothing;

-- ---- Crops ----
insert into crops (id, name, category, msp_per_quintal, unit) values
  ('c1111111-0000-0000-0000-000000000001', 'Paddy (Common)', 'cereal', 2183.00, 'quintal'),
  ('c1111111-0000-0000-0000-000000000002', 'Wheat', 'cereal', 2275.00, 'quintal'),
  ('c1111111-0000-0000-0000-000000000003', 'Jute', 'fiber', 5335.00, 'quintal'),
  ('c1111111-0000-0000-0000-000000000004', 'Mustard', 'oilseed', 5650.00, 'quintal')
on conflict do nothing;

-- ---- Procurement centres ----
-- Defaults: open 09:00–17:00, Monday–Saturday. Farmers can only book centres in
-- their own district (or, if their district has none, their state).
insert into procurement_centres (
  id, name, code, state_id, district_id, sub_district_id, daily_capacity_quintal, counters_count,
  address, centre_type, verification_status
) values
(
  'ce111111-0000-0000-0000-000000000001', 'Krishnanagar Procurement Centre', 'WB-NAD-01',
  '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
  '55555555-5555-5555-5555-555555555555', 500.00, 2,
  'Krishnanagar Mandi, Nadia', 'Mandi', 'verified'
),
(
  'ce111111-0000-0000-0000-000000000002', 'Ludhiana East Procurement Centre', 'PB-LDH-01',
  '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444',
  '66666666-6666-6666-6666-666666666666', 800.00, 3,
  'Sahnewal Grain Market, Ludhiana', 'Mandi', 'verified'
)
on conflict do nothing;

insert into centre_resources (centre_id, resource_type, resource_count) values
  ('ce111111-0000-0000-0000-000000000001', 'weighing', 2),
  ('ce111111-0000-0000-0000-000000000001', 'quality_check', 1),
  ('ce111111-0000-0000-0000-000000000001', 'counter', 2)
on conflict do nothing;

-- The rolling processing-time average (last 15 completions per centre) starts
-- empty and is maintained automatically as operators complete procurements;
-- it is exercised by supabase/tests/database/rolling_average.test.sql.


