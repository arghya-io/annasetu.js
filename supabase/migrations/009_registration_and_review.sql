-- ============================================================================
-- ANNASETU — REGISTRATION, REVIEW, CROP CHANGES, DOCUMENTS, HELP (Migration 009)
--
-- Every farmer / CSC / admin WRITE in these areas is a SECURITY DEFINER RPC.
-- Clients only SELECT (through RLS, see 007). Each RPC:
--   * derives identity from auth.uid() (never from a parameter),
--   * checks account state via the role helpers,
--   * validates the whole payload server-side,
--   * is atomic (one transaction) and writes the audit trail / notification.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FARMER REGISTRATION (replaces four separate client-side partial saves that
-- were non-idempotent, non-atomic and needed broad farmer write policies).
--
-- Payload (snake_case JSON):
--   profile:  farmer_category, first_name, middle_name, last_name, father_name,
--             mother_name, spouse_name, date_of_birth, gender, mobile_number,
--             email, address_line, state_id, district_id, sub_district_id,
--             village_or_town_id, village_or_town_kind
--   farmer_id: text | null
--   land_owner: { owner_name, relationship_to_farmer, mobile_number, address,
--                 ownership_share_percent } | null
--   land_record: { record_reference, plot_or_dag, area_value, area_unit }
--   cultivation: { cultivated_area, cultivated_area_unit, season,
--                  tenancy_or_share_details }
--   crops: [ { crop_id, expected_quantity } ]
--   acknowledgement: { accuracy_confirmed, verification_consent,
--                      policy_accepted, declarations_accepted }
-- Allowed while the application is draft / correction_required; re-submission
-- replaces the previous draft data. Returns the application id.
-- ----------------------------------------------------------------------------

create or replace function submit_farmer_registration(p_payload jsonb)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb := p_payload -> 'profile';
  v_owner jsonb := p_payload -> 'land_owner';
  v_land jsonb := p_payload -> 'land_record';
  v_cult jsonb := p_payload -> 'cultivation';
  v_crops jsonb := p_payload -> 'crops';
  v_ack jsonb := p_payload -> 'acknowledgement';
  v_farmer_id text := nullif(btrim(p_payload ->> 'farmer_id'), '');
  v_existing farmer_profiles%rowtype;
  v_category farmer_category;
  v_dob date;
  v_state uuid;
  v_district uuid;
  v_sub uuid;
  v_vt uuid;
  v_kind text;
  v_app_id text;
  v_owner_id uuid;
  v_land_id uuid;
  v_crop jsonb;
  v_crop_id uuid;
  v_qty numeric;
  v_seen uuid[] := array[]::uuid[];
  v_area numeric;
  v_unit text;
begin
  if v_uid is null or not is_farmer() then
    raise exception 'NOT_AUTHORIZED: only an active farmer account can register';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or v_profile is null or v_land is null or v_cult is null
     or v_crops is null or jsonb_typeof(v_crops) <> 'array' or jsonb_array_length(v_crops) = 0
     or v_ack is null then
    raise exception 'INVALID_INPUT: the registration is incomplete';
  end if;

  select * into v_existing from farmer_profiles where user_id = v_uid for update;
  if found and v_existing.verification_status not in ('draft', 'correction_required') then
    raise exception 'REGISTRATION_LOCKED: your application is already % and cannot be edited', v_existing.verification_status;
  end if;

  -- ---- acknowledgements ------------------------------------------------------
  if not (coalesce((v_ack ->> 'accuracy_confirmed')::boolean, false)
      and coalesce((v_ack ->> 'verification_consent')::boolean, false)
      and coalesce((v_ack ->> 'policy_accepted')::boolean, false)
      and coalesce((v_ack ->> 'declarations_accepted')::boolean, false)) then
    raise exception 'ACKNOWLEDGEMENT_REQUIRED: all declarations must be accepted';
  end if;

  -- ---- profile ---------------------------------------------------------------
  v_category := (v_profile ->> 'farmer_category')::farmer_category;
  if v_category is null then
    raise exception 'INVALID_INPUT: select a farmer category';
  end if;
  if coalesce(btrim(v_profile ->> 'first_name'), '') = '' or coalesce(btrim(v_profile ->> 'last_name'), '') = '' then
    raise exception 'INVALID_INPUT: first and last name are required';
  end if;
  v_dob := (v_profile ->> 'date_of_birth')::date;
  if v_dob is null or v_dob > (app_today() - interval '18 years')::date or v_dob < date '1900-01-01' then
    raise exception 'INVALID_DOB: the farmer must be at least 18 years old';
  end if;
  if coalesce(v_profile ->> 'mobile_number', '') !~ '^[6-9][0-9]{9}$' then
    raise exception 'INVALID_MOBILE: enter a valid 10-digit Indian mobile number';
  end if;
  if length(coalesce(btrim(v_profile ->> 'address_line'), '')) < 3 then
    raise exception 'INVALID_INPUT: address is required';
  end if;

  v_state := (v_profile ->> 'state_id')::uuid;
  v_district := (v_profile ->> 'district_id')::uuid;
  v_sub := (v_profile ->> 'sub_district_id')::uuid;
  v_vt := nullif(v_profile ->> 'village_or_town_id', '')::uuid;
  v_kind := nullif(v_profile ->> 'village_or_town_kind', '');
  perform validate_location_chain(v_state, v_district, v_sub, v_vt, v_kind);

  -- ---- land owner (required by category) -----------------------------------
  if v_category in ('joint_co_owner', 'tenant_farmer', 'sharecropper')
     and (v_owner is null or jsonb_typeof(v_owner) <> 'object' or coalesce(btrim(v_owner ->> 'owner_name'), '') = '') then
    raise exception 'INVALID_INPUT: land owner / co-owner details are required for this farmer category';
  end if;
  if v_owner is not null and jsonb_typeof(v_owner) = 'object' and coalesce(btrim(v_owner ->> 'owner_name'), '') <> ''
     and (v_owner ->> 'ownership_share_percent') is not null
     and (coalesce((v_owner ->> 'ownership_share_percent')::numeric, 0) < 0
          or coalesce((v_owner ->> 'ownership_share_percent')::numeric, 0) > 100) then
    raise exception 'INVALID_INPUT: ownership share must be between 0 and 100';
  end if;

  -- ---- land record + cultivation ------------------------------------------
  v_area := (v_land ->> 'area_value')::numeric;
  v_unit := coalesce(v_land ->> 'area_unit', 'acre');
  if coalesce(btrim(v_land ->> 'record_reference'), '') = '' or v_area is null or v_area <= 0 or v_unit not in ('acre', 'hectare', 'bigha') then
    raise exception 'INVALID_INPUT: a valid land record reference and area are required';
  end if;
  if (v_cult ->> 'cultivated_area') is null or (v_cult ->> 'cultivated_area')::numeric <= 0
     or coalesce(v_cult ->> 'cultivated_area_unit', 'acre') not in ('acre', 'hectare', 'bigha') then
    raise exception 'INVALID_INPUT: a valid cultivated area is required';
  end if;

  -- ---- crops (validated before anything is written) ---------------------------
  for v_crop in select * from jsonb_array_elements(v_crops)
  loop
    v_crop_id := (v_crop ->> 'crop_id')::uuid;
    v_qty := (v_crop ->> 'expected_quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'INVALID_INPUT: expected quantity must be greater than zero';
    end if;
    if v_crop_id = any (v_seen) then
      raise exception 'INVALID_INPUT: a crop was selected more than once';
    end if;
    if not exists (select 1 from crops c where c.id = v_crop_id and c.is_procurable) then
      raise exception 'INVALID_INPUT: a selected crop is not eligible for procurement';
    end if;
    v_seen := v_seen || v_crop_id;
  end loop;

  -- ---- writes ----------------------------------------------------------------
  v_app_id := coalesce(
    v_existing.application_id,
    'AS-' || to_char(app_today(), 'YYYY') || '-' || lpad(nextval('application_id_seq')::text, 6, '0'));

  insert into farmer_profiles (
    user_id, application_id, farmer_category, first_name, middle_name, last_name,
    father_name, mother_name, spouse_name, date_of_birth, gender, mobile_number, email,
    address_line, state_id, district_id, sub_district_id, village_or_town_id, village_or_town_kind,
    verification_status, submitted_at
  ) values (
    v_uid, v_app_id, v_category,
    btrim(v_profile ->> 'first_name'), nullif(btrim(v_profile ->> 'middle_name'), ''), btrim(v_profile ->> 'last_name'),
    nullif(btrim(v_profile ->> 'father_name'), ''), nullif(btrim(v_profile ->> 'mother_name'), ''),
    nullif(btrim(v_profile ->> 'spouse_name'), ''), v_dob, (v_profile ->> 'gender')::gender,
    v_profile ->> 'mobile_number', nullif(btrim(v_profile ->> 'email'), ''),
    btrim(v_profile ->> 'address_line'), v_state, v_district, v_sub, v_vt, v_kind,
    'under_verification', now()
  )
  on conflict (user_id) do update set
    application_id = excluded.application_id,
    farmer_category = excluded.farmer_category,
    first_name = excluded.first_name, middle_name = excluded.middle_name, last_name = excluded.last_name,
    father_name = excluded.father_name, mother_name = excluded.mother_name, spouse_name = excluded.spouse_name,
    date_of_birth = excluded.date_of_birth, gender = excluded.gender,
    mobile_number = excluded.mobile_number, email = excluded.email,
    address_line = excluded.address_line,
    state_id = excluded.state_id, district_id = excluded.district_id, sub_district_id = excluded.sub_district_id,
    village_or_town_id = excluded.village_or_town_id, village_or_town_kind = excluded.village_or_town_kind,
    verification_status = 'under_verification', submitted_at = now();

  -- Replace the previous draft data (child rows first).
  delete from cultivation_records where farmer_id_user = v_uid;
  delete from land_records where farmer_id_user = v_uid;
  delete from land_owner_details where farmer_id_user = v_uid;
  delete from farmer_id_records where farmer_id_user = v_uid;

  insert into farmer_id_records (farmer_id_user, has_farmer_id, farmer_registry_id, source)
    values (v_uid, v_farmer_id is not null, v_farmer_id, 'self_declared');

  if v_owner is not null and jsonb_typeof(v_owner) = 'object' and coalesce(btrim(v_owner ->> 'owner_name'), '') <> '' then
    insert into land_owner_details (farmer_id_user, owner_name, relationship_to_farmer, mobile_number, address, ownership_share_percent)
      values (v_uid, btrim(v_owner ->> 'owner_name'), nullif(btrim(v_owner ->> 'relationship_to_farmer'), ''),
              nullif(btrim(v_owner ->> 'mobile_number'), ''), nullif(btrim(v_owner ->> 'address'), ''),
              (v_owner ->> 'ownership_share_percent')::numeric)
      returning id into v_owner_id;
  end if;

  insert into land_records (farmer_id_user, land_owner_detail_id, record_reference, plot_or_dag, village_id, district_id, area_value, area_unit)
    values (v_uid, v_owner_id, btrim(v_land ->> 'record_reference'), nullif(btrim(v_land ->> 'plot_or_dag'), ''),
            case when v_kind = 'village' then v_vt else null end, v_district, v_area, v_unit)
    returning id into v_land_id;

  insert into cultivation_records (farmer_id_user, land_record_id, tenancy_or_share_details, cultivated_area, cultivated_area_unit, season)
    values (v_uid, v_land_id, nullif(btrim(v_cult ->> 'tenancy_or_share_details'), ''),
            (v_cult ->> 'cultivated_area')::numeric, coalesce(v_cult ->> 'cultivated_area_unit', 'acre'),
            nullif(btrim(v_cult ->> 'season'), ''));

  delete from procurement_crops where farmer_id_user = v_uid and status = 'pending_approval';
  for v_crop in select * from jsonb_array_elements(v_crops)
  loop
    insert into procurement_crops (farmer_id_user, crop_id, expected_quantity, status)
      values (v_uid, (v_crop ->> 'crop_id')::uuid, (v_crop ->> 'expected_quantity')::numeric, 'pending_approval')
      on conflict (farmer_id_user, crop_id) do update
        set expected_quantity = excluded.expected_quantity, status = 'pending_approval'
        where procurement_crops.status = 'removed';
  end loop;

  insert into acknowledgements (farmer_id_user, accuracy_confirmed, verification_consent, policy_accepted, declarations_accepted)
    values (v_uid, true, true, true, true);

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, jurisdiction_id, jurisdiction_sub_district_id, after_data)
    values (v_uid, 'farmer', 'farmer.submitted', 'farmer_profiles', v_uid, v_district, v_sub,
            jsonb_build_object('application_id', v_app_id));

  perform notify_user(v_uid, 'registration_submitted', 'Application submitted',
    format('Your application %s is under verification.', v_app_id), null);

  return v_app_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. GOVERNMENT REVIEW — now also approves the farmer's pending procurement crops
-- (previously nothing ever moved a crop out of pending_approval, so an approved
-- farmer still had nothing they could book).
-- ----------------------------------------------------------------------------

create or replace function review_farmer_verification_admin(
  p_farmer_id uuid, p_decision verification_status, p_notes text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fp farmer_profiles%rowtype;
begin
  if p_decision not in ('approved', 'rejected', 'correction_required') then
    raise exception 'INVALID_DECISION: choose approve, reject or request correction';
  end if;

  select * into v_fp from farmer_profiles where user_id = p_farmer_id for update;
  if not found then
    raise exception 'FARMER_NOT_FOUND';
  end if;

  perform assert_gov_admin_jurisdiction(v_fp.state_id, v_fp.district_id, v_fp.sub_district_id);

  if v_fp.verification_status not in ('submitted', 'under_verification') then
    raise exception 'INVALID_STATE: this application is not awaiting review (status: %)', v_fp.verification_status;
  end if;
  if p_decision <> 'approved' and coalesce(btrim(p_notes), '') = '' then
    raise exception 'NOTES_REQUIRED: explain the decision so the farmer knows what to do next';
  end if;

  if p_decision = 'approved' then
    if not exists (
      select 1 from procurement_crops pc
       where pc.farmer_id_user = p_farmer_id and pc.status in ('pending_approval', 'approved', 'locked')
    ) then
      raise exception 'NO_CROPS: the farmer has no procurement crops to approve';
    end if;

    update procurement_crops
       set status = 'locked', approved_by = auth.uid(), approved_at = now()
     where farmer_id_user = p_farmer_id and status = 'pending_approval';
  end if;

  update farmer_profiles set verification_status = p_decision where user_id = p_farmer_id;

  insert into farmer_verification (farmer_id_user, status, reviewed_by, review_notes, reviewed_at)
    values (p_farmer_id, p_decision, auth.uid(), p_notes, now());

  perform notify_user(
    p_farmer_id,
    case p_decision when 'approved' then 'verification_approved'
                    when 'correction_required' then 'correction_required'
                    else 'verification_rejected' end,
    case p_decision when 'approved' then 'Your registration was approved'
                    when 'correction_required' then 'Correction required'
                    else 'Registration rejected' end,
    coalesce(p_notes, case when p_decision = 'approved'
                           then 'You can now book procurement slots for your approved crops.' end),
    null);

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id,
                          jurisdiction_id, jurisdiction_sub_district_id, after_data)
    values (auth.uid(), 'government_admin', 'farmer.review', 'farmer_profiles', p_farmer_id,
            v_fp.district_id, v_fp.sub_district_id, jsonb_build_object('decision', p_decision));
end;
$$;

create or replace function review_farmer_document_admin(
  p_document_id uuid, p_status document_status, p_reason text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_doc farmer_documents%rowtype;
  v_fp farmer_profiles%rowtype;
begin
  if p_status not in ('under_review', 'verified', 'rejected', 'correction_required') then
    raise exception 'INVALID_DECISION: unsupported document status';
  end if;

  select * into v_doc from farmer_documents where id = p_document_id for update;
  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;
  select * into v_fp from farmer_profiles where user_id = v_doc.farmer_id_user;
  perform assert_gov_admin_jurisdiction(v_fp.state_id, v_fp.district_id, v_fp.sub_district_id);

  if p_status in ('rejected', 'correction_required') and coalesce(btrim(p_reason), '') = '' then
    raise exception 'NOTES_REQUIRED: a reason is required when rejecting a document';
  end if;

  update farmer_documents
     set status = p_status, verified_by = auth.uid(), verified_at = now(),
         rejection_reason = case when p_status in ('rejected', 'correction_required') then p_reason else null end
   where id = p_document_id;

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id,
                          jurisdiction_id, jurisdiction_sub_district_id, after_data)
    values (auth.uid(), 'government_admin', 'document.review', 'farmer_documents', p_document_id,
            v_fp.district_id, v_fp.sub_district_id, jsonb_build_object('status', p_status));

  if p_status in ('rejected', 'correction_required') then
    perform notify_user(v_doc.farmer_id_user, 'document_' || p_status::text, 'Document needs attention',
      format('%s: %s', v_doc.file_name, p_reason), null);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. DOCUMENTS (private bucket; metadata registered through an RPC that proves
-- the object exists under the caller's own folder)
-- ----------------------------------------------------------------------------

create or replace function register_farmer_document(
  p_kind document_kind, p_storage_path text, p_file_name text, p_mime_type text, p_size_bytes integer
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null or not is_farmer() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if not exists (select 1 from farmer_profiles fp where fp.user_id = v_uid) then
    raise exception 'PROFILE_REQUIRED: submit your registration before uploading documents';
  end if;
  if p_storage_path is null or left(p_storage_path, length(v_uid::text) + 1) <> v_uid::text || '/'
     or position('..' in p_storage_path) > 0 then
    raise exception 'INVALID_PATH: documents must be stored in your own folder';
  end if;
  if p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'INVALID_FILE_TYPE: only PDF, JPEG and PNG files are accepted';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 5242880 then
    raise exception 'INVALID_FILE_SIZE: files must be smaller than 5 MB';
  end if;
  if coalesce(btrim(p_file_name), '') = '' then
    raise exception 'INVALID_INPUT: file name is required';
  end if;
  if (select count(*) from farmer_documents d where d.farmer_id_user = v_uid) >= 30 then
    raise exception 'LIMIT_REACHED: too many documents uploaded';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'farmer-documents' and o.name = p_storage_path) then
    raise exception 'UPLOAD_NOT_FOUND: the file was not uploaded';
  end if;

  insert into farmer_documents (farmer_id_user, kind, storage_path, file_name, mime_type, file_size_bytes, status)
    values (v_uid, p_kind, p_storage_path, left(btrim(p_file_name), 200), p_mime_type, p_size_bytes, 'uploaded')
    returning id into v_id;
  return v_id;
end;
$$;

-- Storage path of a document, only for an admin whose jurisdiction covers the
-- farmer. The server action turns this into a short-lived signed URL.
create or replace function admin_document_storage_path(p_document_id uuid)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_doc farmer_documents%rowtype;
begin
  select * into v_doc from farmer_documents where id = p_document_id;
  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;
  if not admin_covers_farmer(v_doc.farmer_id_user) then
    raise exception 'OUTSIDE_JURISDICTION';
  end if;
  return v_doc.storage_path;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. CROP CHANGE REQUESTS
-- ----------------------------------------------------------------------------

create or replace function submit_crop_change_request(
  p_type text, p_existing_crop_id uuid, p_requested_crop_id uuid,
  p_quantity numeric, p_reason text, p_document_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status verification_status;
  v_crop procurement_crops%rowtype;
  v_active_qty numeric;
  v_id uuid;
begin
  if v_uid is null or not is_farmer() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select fp.verification_status into v_status from farmer_profiles fp where fp.user_id = v_uid;
  if not found or v_status <> 'approved' then
    raise exception 'FARMER_NOT_APPROVED: only approved farmers can request crop changes';
  end if;
  if p_type not in ('add', 'remove', 'modify_quantity') then
    raise exception 'INVALID_INPUT: unknown change type';
  end if;
  if length(coalesce(btrim(p_reason), '')) < 5 then
    raise exception 'INVALID_INPUT: please give a reason for the change';
  end if;
  if p_document_id is not null
     and not exists (select 1 from farmer_documents d where d.id = p_document_id and d.farmer_id_user = v_uid) then
    raise exception 'INVALID_INPUT: supporting document not found';
  end if;

  if p_type = 'add' then
    if p_requested_crop_id is null or p_quantity is null or p_quantity <= 0 then
      raise exception 'INVALID_INPUT: choose a crop and an expected quantity';
    end if;
    if not exists (select 1 from crops c where c.id = p_requested_crop_id and c.is_procurable) then
      raise exception 'INVALID_INPUT: that crop is not eligible for procurement';
    end if;
    if exists (select 1 from procurement_crops pc
                where pc.farmer_id_user = v_uid and pc.crop_id = p_requested_crop_id
                  and pc.status in ('pending_approval', 'approved', 'locked')) then
      raise exception 'ALREADY_REGISTERED: you already sell this crop';
    end if;
  else
    select * into v_crop from procurement_crops where id = p_existing_crop_id and farmer_id_user = v_uid;
    if not found or v_crop.status not in ('approved', 'locked') then
      raise exception 'INVALID_INPUT: choose one of your approved crops';
    end if;
    select coalesce(sum(a.quantity_quintal), 0) into v_active_qty
      from appointments a
     where a.procurement_crop_id = v_crop.id and a.status in ('booked', 'confirmed', 'checked_in', 'in_progress', 'completed');
    if p_type = 'modify_quantity' then
      if p_quantity is null or p_quantity <= 0 then
        raise exception 'INVALID_INPUT: enter the new quantity';
      end if;
      if p_quantity < v_active_qty then
        raise exception 'QUANTITY_BELOW_BOOKED: % quintal is already booked or sold for this crop', v_active_qty;
      end if;
    else
      if exists (select 1 from appointments a
                  where a.procurement_crop_id = v_crop.id
                    and a.status in ('booked', 'confirmed', 'checked_in', 'in_progress')) then
        raise exception 'ACTIVE_BOOKINGS_EXIST: cancel or complete your bookings for this crop first';
      end if;
    end if;
  end if;

  if exists (select 1 from crop_change_requests r
              where r.farmer_id_user = v_uid and r.status in ('pending', 'under_review')
                and r.requested_change_type = p_type
                and r.existing_procurement_crop_id is not distinct from p_existing_crop_id
                and r.requested_crop_id is not distinct from p_requested_crop_id) then
    raise exception 'DUPLICATE_REQUEST: you already have a pending request for this change';
  end if;

  insert into crop_change_requests (
    farmer_id_user, existing_procurement_crop_id, requested_crop_id, requested_change_type,
    requested_quantity, reason, supporting_document_id, status
  ) values (
    v_uid, p_existing_crop_id, p_requested_crop_id, p_type, p_quantity, btrim(p_reason), p_document_id, 'pending'
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function review_crop_change_request_admin(
  p_request_id uuid, p_decision crop_change_status, p_notes text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_req crop_change_requests%rowtype;
  v_fp farmer_profiles%rowtype;
  v_crop procurement_crops%rowtype;
  v_active_qty numeric;
begin
  if p_decision not in ('approved', 'rejected', 'correction_required') then
    raise exception 'INVALID_DECISION';
  end if;

  select * into v_req from crop_change_requests where id = p_request_id for update;
  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  select * into v_fp from farmer_profiles where user_id = v_req.farmer_id_user;
  perform assert_gov_admin_jurisdiction(v_fp.state_id, v_fp.district_id, v_fp.sub_district_id);

  if v_req.status not in ('pending', 'under_review') then
    raise exception 'INVALID_STATE: this request was already reviewed';
  end if;
  if p_decision <> 'approved' and coalesce(btrim(p_notes), '') = '' then
    raise exception 'NOTES_REQUIRED: explain the decision to the farmer';
  end if;

  if p_decision = 'approved' then
    if v_req.requested_change_type = 'add' then
      insert into procurement_crops (farmer_id_user, crop_id, expected_quantity, status, approved_by, approved_at)
        values (v_req.farmer_id_user, v_req.requested_crop_id, v_req.requested_quantity, 'locked', auth.uid(), now())
        on conflict (farmer_id_user, crop_id) do update
          set expected_quantity = excluded.expected_quantity, status = 'locked',
              approved_by = auth.uid(), approved_at = now();
    else
      select * into v_crop from procurement_crops where id = v_req.existing_procurement_crop_id for update;
      if not found then
        raise exception 'CROP_NOT_FOUND';
      end if;
      select coalesce(sum(a.quantity_quintal), 0) into v_active_qty
        from appointments a
       where a.procurement_crop_id = v_crop.id and a.status in ('booked', 'confirmed', 'checked_in', 'in_progress', 'completed');

      if v_req.requested_change_type = 'modify_quantity' then
        if v_req.requested_quantity < v_active_qty then
          raise exception 'QUANTITY_BELOW_BOOKED: % quintal is already booked or sold for this crop', v_active_qty;
        end if;
        update procurement_crops set expected_quantity = v_req.requested_quantity where id = v_crop.id;
      else
        if exists (select 1 from appointments a
                    where a.procurement_crop_id = v_crop.id
                      and a.status in ('booked', 'confirmed', 'checked_in', 'in_progress')) then
          raise exception 'ACTIVE_BOOKINGS_EXIST: the farmer still has open bookings for this crop';
        end if;
        update procurement_crops set status = 'removed' where id = v_crop.id;
      end if;
    end if;
  end if;

  update crop_change_requests
     set status = p_decision, reviewed_by = auth.uid(), review_notes = p_notes, reviewed_at = now()
   where id = p_request_id;

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id,
                          jurisdiction_id, jurisdiction_sub_district_id, after_data)
    values (auth.uid(), 'government_admin', 'crop_change_request.review', 'crop_change_requests', p_request_id,
            v_fp.district_id, v_fp.sub_district_id,
            jsonb_build_object('decision', p_decision, 'type', v_req.requested_change_type));

  perform notify_user(v_req.farmer_id_user, 'crop_change_' || p_decision::text,
    case p_decision when 'approved' then 'Crop change approved'
                    when 'rejected' then 'Crop change rejected'
                    else 'Crop change needs correction' end,
    p_notes, null);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. HELP REQUESTS (farmer -> CSC)
-- ----------------------------------------------------------------------------

create or replace function create_help_request(p_subject text, p_description text, p_district_id uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_profile farmer_profiles%rowtype;
  v_district uuid;
  v_farmer uuid;
  v_id uuid;
begin
  if v_uid is null or not is_farmer() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if length(coalesce(btrim(p_subject), '')) < 3 or length(p_subject) > 200 then
    raise exception 'INVALID_INPUT: enter a short subject (3-200 characters)';
  end if;
  if length(coalesce(p_description, '')) > 2000 then
    raise exception 'INVALID_INPUT: description is too long';
  end if;

  select * into v_profile from farmer_profiles where user_id = v_uid;
  if found then
    v_district := v_profile.district_id;
    v_farmer := v_uid;
  else
    v_district := p_district_id;
    if v_district is null or not exists (select 1 from districts d where d.id = v_district) then
      raise exception 'INVALID_INPUT: choose your district so a nearby CSC can help';
    end if;
  end if;

  if (select count(*) from help_requests h
       where h.raised_by = v_uid and h.status in ('open', 'in_progress')) >= 5 then
    raise exception 'LIMIT_REACHED: you already have several open help requests';
  end if;

  insert into help_requests (farmer_id_user, raised_by, district_id, subject, description, status)
    values (v_farmer, v_uid, v_district, btrim(p_subject), nullif(btrim(coalesce(p_description, '')), ''), 'open')
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function update_help_request_csc(p_request_id uuid, p_status help_request_status, p_note text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_csc_district uuid;
  v_req help_requests%rowtype;
begin
  if v_uid is null or not is_csc_operator() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_status not in ('in_progress', 'resolved', 'closed') then
    raise exception 'INVALID_STATUS';
  end if;

  select coalesce(c.district_id, c.jurisdiction_district_id) into v_csc_district
    from csc_operators c where c.user_id = v_uid;

  select * into v_req from help_requests where id = p_request_id for update;
  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if v_req.handled_by is not null and v_req.handled_by <> v_uid then
    raise exception 'ALREADY_HANDLED: another CSC operator is handling this request';
  end if;
  if v_req.handled_by is null
     and (v_csc_district is null or v_req.district_id is null or v_req.district_id <> v_csc_district) then
    raise exception 'OUTSIDE_JURISDICTION: this request is not in your district';
  end if;

  update help_requests
     set status = p_status,
         handled_by = v_uid,
         resolution_note = case when p_status in ('resolved', 'closed') then left(p_note, 1000) else resolution_note end
   where id = p_request_id;

  if v_req.raised_by is not null then
    perform notify_user(v_req.raised_by, 'help_request_update',
      case p_status when 'in_progress' then 'A CSC operator is helping you'
                    when 'resolved' then 'Your help request was resolved'
                    else 'Your help request was closed' end,
      v_req.subject, null);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. ADMIN CENTRE LISTING (jurisdiction-scoped; the plain table is world-readable
-- for active centres because farmers must see them, so an admin's own "my
-- centres" view needs an explicit scope)
-- ----------------------------------------------------------------------------

create or replace function admin_list_centres()
returns table (
  centre_id uuid, centre_name text, centre_code text, centre_active boolean,
  daily_capacity numeric, counters integer, avg_processing_seconds numeric,
  district_name text, centre_kind text, booked_today numeric, capacity_today numeric
) language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_gov_admin() then
    raise exception 'NOT_A_GOVERNMENT_ADMIN';
  end if;
  return query
    select pc.id, pc.name, pc.code, pc.is_active,
           pc.daily_capacity_quintal, pc.counters_count, pc.avg_processing_time_seconds,
           d.name, pc.centre_type,
           coalesce(cdc.booked_quantity_quintal, 0),
           coalesce(cdc.total_capacity_quintal, pc.daily_capacity_quintal)
      from procurement_centres pc
      join districts d on d.id = pc.district_id
      left join centre_daily_capacity cdc
             on cdc.centre_id = pc.id and cdc.capacity_date = app_today()
     where admin_jurisdiction_covers(pc.state_id, pc.district_id, pc.sub_district_id)
     order by pc.name;
end;
$$;
