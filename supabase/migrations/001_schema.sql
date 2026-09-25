-- ============================================================================
-- ANNASETU — CORE SCHEMA (Migration 001)
-- Normalized Postgres schema for Supabase.
-- Run after enabling: pgcrypto (uuid generation), citext (case-insensitive email)
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ----------------------------------------------------------------------------
-- 0. SHARED HELPERS
-- ----------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Generic "app role" — mirrors auth.users, one row per authenticated identity.
create type app_role as enum (
  'farmer',
  'government_admin',
  'centre_operator',
  'csc_operator'
);

-- ----------------------------------------------------------------------------
-- 1. USERS & ROLE TABLES
-- ----------------------------------------------------------------------------

-- One row per Supabase auth identity. This is ACCOUNT IDENTITY, not farmer
-- eligibility (spec §4) — those are kept as separate concepts throughout.
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  role app_role not null,
  full_name text not null,
  email citext,
  phone text,
  is_active boolean not null default true,
  face_verification_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_users_updated_at before update on users
  for each row execute function set_updated_at();
create index idx_users_role on users(role);

create table government_admins (
  user_id uuid primary key references users(id) on delete cascade,
  designation text,
  department text,
  jurisdiction_state_id uuid,        -- FK added after states table
  created_at timestamptz not null default now()
);

create table csc_operators (
  user_id uuid primary key references users(id) on delete cascade,
  csc_id text unique,
  centre_name text,
  jurisdiction_district_id uuid,     -- FK added after districts table
  created_at timestamptz not null default now()
);

create table centre_operators (
  user_id uuid primary key references users(id) on delete cascade,
  centre_id uuid not null,           -- FK added after procurement_centres table
  employee_code text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. LOCATION HIERARCHY (India-wide, lazily loaded — never bulk-shipped to client)
-- ----------------------------------------------------------------------------

create table states (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null
);

create table districts (
  id uuid primary key default gen_random_uuid(),
  state_id uuid not null references states(id) on delete restrict,
  name text not null,
  code text,
  unique (state_id, name)
);
create index idx_districts_state on districts(state_id);

create table sub_districts (
  id uuid primary key default gen_random_uuid(),
  district_id uuid not null references districts(id) on delete restrict,
  name text not null,
  unique (district_id, name)
);
create index idx_subdistricts_district on sub_districts(district_id);

-- Villages and towns modeled separately (rural vs urban local body) but both
-- hang off sub_district; a unioned view `locations_villages_towns` is provided
-- for the cascading picker.
create table villages (
  id uuid primary key default gen_random_uuid(),
  sub_district_id uuid not null references sub_districts(id) on delete restrict,
  name text not null,
  unique (sub_district_id, name)
);
create index idx_villages_subdistrict on villages(sub_district_id);

create table towns (
  id uuid primary key default gen_random_uuid(),
  sub_district_id uuid not null references sub_districts(id) on delete restrict,
  name text not null,
  unique (sub_district_id, name)
);
create index idx_towns_subdistrict on towns(sub_district_id);

alter table government_admins
  add constraint fk_gov_admin_state foreign key (jurisdiction_state_id) references states(id);
alter table csc_operators
  add constraint fk_csc_district foreign key (jurisdiction_district_id) references districts(id);

-- ----------------------------------------------------------------------------
-- 3. FARMER PROFILE, IDENTITY, VERIFICATION
-- ----------------------------------------------------------------------------

create type farmer_category as enum (
  'owner_cultivator',
  'tenant_farmer',
  'sharecropper',
  'joint_co_owner',
  'other_eligible_cultivator'
);

create type gender as enum ('male', 'female', 'other', 'prefer_not_to_say');

create type verification_status as enum (
  'draft',
  'under_verification',
  'approved',
  'correction_required',
  'rejected'
);

create table farmer_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  application_id text unique,                 -- generated on step-4 submission
  farmer_category farmer_category not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  father_name text,
  mother_name text,
  spouse_name text,
  date_of_birth date not null,
  gender gender not null,
  mobile_number text not null,
  email citext,
  address_line text not null,
  state_id uuid not null references states(id),
  district_id uuid not null references districts(id),
  sub_district_id uuid not null references sub_districts(id),
  village_or_town_id uuid,                    -- either a village or town id (validated in app layer)
  village_or_town_kind text check (village_or_town_kind in ('village','town')),
  verification_status verification_status not null default 'draft',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_farmer_profiles_updated_at before update on farmer_profiles
  for each row execute function set_updated_at();
create index idx_farmer_profiles_status on farmer_profiles(verification_status);
create index idx_farmer_profiles_location on farmer_profiles(state_id, district_id, sub_district_id);

-- Farmer ID / Farmer Registry reference (spec §3 — separate from Aadhaar/KCC).
create table farmer_id_records (
  id uuid primary key default gen_random_uuid(),
  farmer_id_user uuid not null references farmer_profiles(user_id) on delete cascade,
  has_farmer_id boolean not null default false,
  farmer_registry_id text,                    -- external Farmer ID if the farmer already has one
  source text not null default 'self_declared', -- self_declared | mock_registry_lookup
  verified boolean not null default false,
  verified_by uuid references users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_farmer_id_records_farmer on farmer_id_records(farmer_id_user);

create table farmer_verification (
  id uuid primary key default gen_random_uuid(),
  farmer_id_user uuid not null references farmer_profiles(user_id) on delete cascade,
  status verification_status not null default 'under_verification',
  reviewed_by uuid references government_admins(user_id),
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_farmer_verification_farmer on farmer_verification(farmer_id_user);
create index idx_farmer_verification_status on farmer_verification(status);

create type document_kind as enum (
  'identity_proof', 'land_record', 'farmer_id_proof', 'tenancy_proof',
  'sharecropper_proof', 'joint_ownership_proof', 'other'
);

create table farmer_documents (
  id uuid primary key default gen_random_uuid(),
  farmer_id_user uuid not null references farmer_profiles(user_id) on delete cascade,
  kind document_kind not null,
  storage_path text not null,                 -- private bucket path, accessed via signed URL only
  file_name text not null,
  mime_type text not null,
  file_size_bytes integer not null check (file_size_bytes > 0),
  uploaded_at timestamptz not null default now()
);
create index idx_farmer_documents_farmer on farmer_documents(farmer_id_user);

-- Local, browser-generated biometric templates ONLY (spec §5). Prototype-grade;
-- flagged accordingly at the application layer and never used as farmer-eligibility proof.
create table face_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  descriptor bytea not null,                  -- encrypted local face-embedding, not a raw photo
  algorithm_version text not null,
  created_at timestamptz not null default now(),
  unique (user_id)
);

-- ----------------------------------------------------------------------------
-- 4. LAND / CULTIVATION (separate relational entities per spec §2, Step 2)
-- ----------------------------------------------------------------------------

create table land_owner_details (
  id uuid primary key default gen_random_uuid(),
  farmer_id_user uuid not null references farmer_profiles(user_id) on delete cascade,
  owner_name text not null,
  relationship_to_farmer text,                -- e.g. co-owner relationship, or "landlord" for tenant/sharecropper
  mobile_number text,
  address text,
  ownership_share_percent numeric(5,2) check (ownership_share_percent between 0 and 100),
  created_at timestamptz not null default now()
);
create index idx_land_owner_details_farmer on land_owner_details(farmer_id_user);

create table land_records (
  id uuid primary key default gen_random_uuid(),
  farmer_id_user uuid not null references farmer_profiles(user_id) on delete cascade,
  land_owner_detail_id uuid references land_owner_details(id),
  record_reference text not null,             -- RoR / Khatian number
  plot_or_dag text,
  village_id uuid references villages(id),
  district_id uuid references districts(id),
  area_value numeric(10,3) not null check (area_value > 0),
  area_unit text not null default 'acre' check (area_unit in ('acre','hectare','bigha')),
  document_id uuid references farmer_documents(id),
  created_at timestamptz not null default now()
);
create index idx_land_records_farmer on land_records(farmer_id_user);

create table cultivation_records (
  id uuid primary key default gen_random_uuid(),
  farmer_id_user uuid not null references farmer_profiles(user_id) on delete cascade,
  land_record_id uuid references land_records(id),
  tenancy_or_share_details text,              -- tenancy details or share arrangement, per category
  cultivated_area numeric(10,3) not null check (cultivated_area > 0),
  cultivated_area_unit text not null default 'acre' check (cultivated_area_unit in ('acre','hectare','bigha')),
  season text,                                -- kharif | rabi | zaid | perennial
  created_at timestamptz not null default now()
);
create index idx_cultivation_records_farmer on cultivation_records(farmer_id_user);

-- ----------------------------------------------------------------------------
-- 5. CROPS
-- ----------------------------------------------------------------------------

create table crops (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  is_procurable boolean not null default true, -- eligible for AnnaSetu procurement
  msp_per_quintal numeric(10,2),
  unit text not null default 'quintal',
  created_at timestamptz not null default now()
);

-- Crops the farmer produces generally (not necessarily sold via AnnaSetu).
create table farmer_crops (
  id uuid primary key default gen_random_uuid(),
  farmer_id_user uuid not null references farmer_profiles(user_id) on delete cascade,
  crop_id uuid not null references crops(id),
  cultivated_area numeric(10,3),
  expected_quantity numeric(10,2),
  season text,
  created_at timestamptz not null default now(),
  unique (farmer_id_user, crop_id, season)
);
create index idx_farmer_crops_farmer on farmer_crops(farmer_id_user);

create type procurement_crop_status as enum ('pending_approval', 'approved', 'locked', 'removed');

-- Crops APPROVED for sale through AnnaSetu. Locked after approval (spec §2 Step 3).
create table procurement_crops (
  id uuid primary key default gen_random_uuid(),
  farmer_id_user uuid not null references farmer_profiles(user_id) on delete cascade,
  crop_id uuid not null references crops(id),
  expected_quantity numeric(10,2) not null check (expected_quantity > 0),
  status procurement_crop_status not null default 'pending_approval',
  approved_by uuid references government_admins(user_id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farmer_id_user, crop_id)
);
create trigger trg_procurement_crops_updated_at before update on procurement_crops
  for each row execute function set_updated_at();
create index idx_procurement_crops_farmer on procurement_crops(farmer_id_user);
create index idx_procurement_crops_status on procurement_crops(status);

create type crop_change_status as enum (
  'pending', 'under_review', 'approved', 'rejected', 'correction_required'
);

create table crop_change_requests (
  id uuid primary key default gen_random_uuid(),
  farmer_id_user uuid not null references farmer_profiles(user_id) on delete cascade,
  existing_procurement_crop_id uuid references procurement_crops(id),
  requested_crop_id uuid references crops(id),
  requested_change_type text not null check (requested_change_type in ('add','remove','modify_quantity')),
  requested_quantity numeric(10,2),
  reason text not null,
  supporting_document_id uuid references farmer_documents(id),
  status crop_change_status not null default 'pending',
  reviewed_by uuid references government_admins(user_id),
  review_notes text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index idx_crop_change_requests_farmer on crop_change_requests(farmer_id_user);
create index idx_crop_change_requests_status on crop_change_requests(status);

-- ----------------------------------------------------------------------------
-- 6. PROCUREMENT CENTRES & CAPACITY
-- ----------------------------------------------------------------------------

create table procurement_centres (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  state_id uuid not null references states(id),
  district_id uuid not null references districts(id),
  sub_district_id uuid references sub_districts(id),
  address text,
  daily_capacity_quintal numeric(10,2) not null check (daily_capacity_quintal > 0),
  counters_count integer not null default 1 check (counters_count > 0),
  operating_start_time time not null default '09:00',
  operating_end_time time not null default '17:00',
  is_active boolean not null default true,
  -- Rolling processing-time average, maintained by update_centre_rolling_average() (see functions.sql)
  avg_processing_time_seconds numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_procurement_centres_updated_at before update on procurement_centres
  for each row execute function set_updated_at();
create index idx_procurement_centres_district on procurement_centres(district_id);

alter table centre_operators
  add constraint fk_centre_operator_centre foreign key (centre_id) references procurement_centres(id);
create index idx_centre_operators_centre on centre_operators(centre_id);

create table centre_resources (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid not null references procurement_centres(id) on delete cascade,
  resource_type text not null check (resource_type in ('weighing','quality_check','counter')),
  resource_count integer not null default 1 check (resource_count >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (centre_id, resource_type)
);

-- Per-day, per-centre capacity ledger. Rows are pre-materialized (or created on
-- first booking for a date) and updated atomically via RPC to avoid race conditions.
create table centre_daily_capacity (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid not null references procurement_centres(id) on delete cascade,
  capacity_date date not null,
  total_capacity_quintal numeric(10,2) not null,
  booked_quantity_quintal numeric(10,2) not null default 0 check (booked_quantity_quintal >= 0),
  -- Transaction-safe daily token counter (spec: harden token generation).
  -- Incremented atomically under the same row lock used for capacity, so
  -- token allocation never depends on a MAX(token_number)+1 scan.
  next_token_seq integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (centre_id, capacity_date),
  check (booked_quantity_quintal <= total_capacity_quintal)
);
create trigger trg_centre_daily_capacity_updated_at before update on centre_daily_capacity
  for each row execute function set_updated_at();
create index idx_centre_daily_capacity_lookup on centre_daily_capacity(centre_id, capacity_date);

-- ----------------------------------------------------------------------------
-- 7. BOOKINGS ("appointments"), QUEUE, PROCUREMENT LIFECYCLE
-- ----------------------------------------------------------------------------

create type booking_status as enum (
  'draft', 'booked', 'confirmed', 'checked_in', 'in_progress',
  'completed', 'cancelled', 'no_show', 'expired'
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  farmer_id_user uuid not null references farmer_profiles(user_id) on delete cascade,
  centre_id uuid not null references procurement_centres(id),
  procurement_crop_id uuid not null references procurement_crops(id),
  quantity_quintal numeric(10,2) not null check (quantity_quintal > 0),
  harvest_date date not null,
  procurement_date date not null,
  procurement_time time not null,
  status booking_status not null default 'draft',
  post_harvest_holding_days integer generated always as
    (procurement_date - harvest_date) stored,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Server-side enforcement of booking window (belt-and-suspenders with the RPC/trigger
  -- in functions.sql, which is the authoritative gate at booking-creation time):
  check (procurement_date >= harvest_date),
  check (procurement_date >= current_date)
);
create trigger trg_appointments_updated_at before update on appointments
  for each row execute function set_updated_at();
create index idx_appointments_farmer on appointments(farmer_id_user);
create index idx_appointments_centre_date on appointments(centre_id, procurement_date);
create index idx_appointments_status on appointments(status);

create type queue_status as enum (
  'waiting', 'called', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'
);

create table queue_entries (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references appointments(id) on delete cascade,
  centre_id uuid not null references procurement_centres(id),
  token_number text not null,
  qr_payload_hash text not null,             -- opaque non-sensitive lookup token (NOT a cryptographic
                                              -- signature — see functions.sql §6). Authority lives entirely
                                              -- server-side in validate_and_checkin_token(); the QR payload
                                              -- is never trusted as proof on its own, only as a lookup key.
  queue_date date not null,
  queue_position integer,
  assigned_counter integer,
  status queue_status not null default 'waiting',
  estimated_wait_seconds numeric(10,2),
  estimated_processing_seconds numeric(10,2),
  used boolean not null default false,       -- true once the token has been scanned/consumed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (centre_id, queue_date, token_number)
);
create trigger trg_queue_entries_updated_at before update on queue_entries
  for each row execute function set_updated_at();
create index idx_queue_entries_centre_date on queue_entries(centre_id, queue_date, status);

create table queue_events (
  id uuid primary key default gen_random_uuid(),
  queue_entry_id uuid not null references queue_entries(id) on delete cascade,
  event_type text not null,                  -- e.g. 'checked_in','weighing_started','quality_check_passed', ...
  event_data jsonb,
  actor_user_id uuid references users(id),
  occurred_at timestamptz not null default now()
);
create index idx_queue_events_entry on queue_events(queue_entry_id);

create type procurement_stage as enum (
  'scheduled', 'checked_in', 'document_verified', 'weighing', 'quality_check',
  'accepted', 'unloading', 'receipt_generated', 'payment_initiated', 'completed'
);

create table procurement_records (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references appointments(id) on delete cascade,
  centre_id uuid not null references procurement_centres(id),
  operator_id uuid references centre_operators(user_id),
  stage procurement_stage not null default 'scheduled',
  accepted_quantity_quintal numeric(10,2),
  quality_grade text,
  checked_in_at timestamptz,
  document_verified_at timestamptz,
  processing_started_at timestamptz,         -- weighing start, per spec §10 algorithm
  processing_completed_at timestamptz,       -- acceptance/completion, per spec §10 algorithm
  processing_time_seconds numeric(10,2) generated always as
    (extract(epoch from (processing_completed_at - processing_started_at))) stored,
  receipt_number text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_procurement_records_updated_at before update on procurement_records
  for each row execute function set_updated_at();
create index idx_procurement_records_centre on procurement_records(centre_id, stage);

create type payment_status as enum (
  'payment_pending', 'payment_initiated', 'payment_processing',
  'payment_completed', 'payment_failed'
);

create table payment_records (
  id uuid primary key default gen_random_uuid(),
  procurement_record_id uuid not null references procurement_records(id) on delete cascade,
  farmer_id_user uuid not null references farmer_profiles(user_id),
  amount numeric(12,2) not null check (amount >= 0),
  status payment_status not null default 'payment_pending',
  is_mock boolean not null default true,     -- always true in this prototype; never a real gateway
  reference_code text unique,
  initiated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_payment_records_updated_at before update on payment_records
  for each row execute function set_updated_at();
create index idx_payment_records_farmer on payment_records(farmer_id_user);

-- ----------------------------------------------------------------------------
-- 8. NOTIFICATIONS, HELP REQUESTS, ACKNOWLEDGEMENTS, AUDIT LOGS
-- ----------------------------------------------------------------------------

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,                        -- matches spec §22 event list
  title text not null,
  body text,
  data jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notifications_user on notifications(user_id, is_read);

create type help_request_status as enum ('open', 'in_progress', 'resolved', 'closed');

create table help_requests (
  id uuid primary key default gen_random_uuid(),
  farmer_id_user uuid references farmer_profiles(user_id) on delete set null,
  raised_by uuid references users(id),
  handled_by uuid references csc_operators(user_id),
  subject text not null,
  description text,
  status help_request_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_help_requests_updated_at before update on help_requests
  for each row execute function set_updated_at();
create index idx_help_requests_status on help_requests(status);

create table acknowledgements (
  id uuid primary key default gen_random_uuid(),
  farmer_id_user uuid not null references farmer_profiles(user_id) on delete cascade,
  accuracy_confirmed boolean not null,
  verification_consent boolean not null,
  policy_accepted boolean not null,
  declarations_accepted boolean not null,
  acknowledged_at timestamptz not null default now(),
  check (accuracy_confirmed and verification_consent and policy_accepted and declarations_accepted)
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id),
  actor_role app_role,
  action text not null,                      -- e.g. 'farmer.approve', 'crop_change.reject'
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index idx_audit_logs_entity on audit_logs(entity_type, entity_id);
create index idx_audit_logs_actor on audit_logs(actor_user_id);
