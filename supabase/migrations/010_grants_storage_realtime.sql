-- ============================================================================
-- ANNASETU — FUNCTION GRANTS, STORAGE & REALTIME (Migration 010)
--
-- Supabase's default privileges give anon + authenticated EXECUTE on every new
-- function in `public`, on top of Postgres' default EXECUTE-to-PUBLIC. So each
-- sensitive function is explicitly revoked from public/anon/authenticated and
-- then granted back to exactly the role that needs it.
--
-- NOT revoked (deliberately): the read-only RLS helper functions
-- (is_gov_admin(), current_role_is(), admin_covers_*(), ...) — policies call
-- them as the querying role, and they only ever answer questions about the
-- caller — plus normalize_mobile_number(), which the mobile login form calls
-- before the user is authenticated.
-- ============================================================================

-- ---- callable by signed-in users (each re-checks role + account state inside) ----
do $$
declare
  f text;
  authenticated_fns text[] := array[
    'create_booking(uuid,uuid,uuid,numeric,date,date,time without time zone)',
    'cancel_appointment(uuid,text)',
    'list_eligible_centres()',
    'get_slot_preview(uuid,date)',
    'validate_and_checkin_token(uuid,text)',
    'call_queue_token(uuid)',
    'transition_procurement_stage(uuid,procurement_stage,jsonb)',
    'operator_queue(date)',
    'operator_booking_details(uuid)',
    'submit_farmer_registration(jsonb)',
    'register_farmer_document(document_kind,text,text,text,integer)',
    'admin_document_storage_path(uuid)',
    'submit_crop_change_request(text,uuid,uuid,numeric,text,uuid)',
    'review_crop_change_request_admin(uuid,crop_change_status,text)',
    'review_farmer_verification_admin(uuid,verification_status,text)',
    'review_farmer_document_admin(uuid,document_status,text)',
    'create_help_request(text,text,uuid)',
    'update_help_request_csc(uuid,help_request_status,text)',
    'suspend_account(uuid,text)',
    'activate_account(uuid)',
    'authorize_password_regeneration(uuid)',
    'mark_password_regenerated(uuid)',
    'authorize_provisioning(uuid,uuid)',
    'mobile_number_in_use(text)',
    'log_account_provisioned(text,uuid,uuid,uuid,uuid)',
    'create_procurement_centre_admin(text,text,uuid,uuid,uuid,text,text,numeric,integer,text,text,text)',
    'update_centre_admin(uuid,boolean,numeric,integer)',
    'admin_list_centres()'
  ];
  service_only_fns text[] := array[
    'clear_must_change_password(uuid)',
    'mark_no_shows()'
  ];
  internal_fns text[] := array[
    'recalculate_queue_positions(uuid,date)',
    'update_centre_rolling_average(uuid)',
    'notify_user(uuid,text,text,text,jsonb)',
    'jsonb_num(jsonb,text)',
    'assert_admin_can_manage_account(uuid)',
    'validate_location_chain(uuid,uuid,uuid,uuid,text)',
    'enforce_booking_window()',
    'on_procurement_completed()',
    'protect_account_lifecycle_columns()',
    'generate_initial_password()'
  ];
begin
  foreach f in array authenticated_fns loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;

  foreach f in array service_only_fns loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;

  foreach f in array internal_fns loop
    -- generate_initial_password() may not exist on projects that dropped it.
    begin
      execute format('revoke all on function public.%s from public, anon, authenticated', f);
    exception when undefined_function then
      raise notice 'skipping revoke for missing function %', f;
    end;
  end loop;
end
$$;

-- ---- Storage: private bucket for farmer documents ---------------------------------
-- Wrapped so a project without the storage schema (or without permission to
-- manage it from a migration) still completes; create the bucket by hand then.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('farmer-documents', 'farmer-documents', false, 5242880,
            array['application/pdf', 'image/jpeg', 'image/png'])
    on conflict (id) do update
      set public = false,
          file_size_limit = 5242880,
          allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

  drop policy if exists farmer_documents_insert_own on storage.objects;
  drop policy if exists farmer_documents_select_own on storage.objects;
  drop policy if exists farmer_documents_delete_own_unregistered on storage.objects;

  -- A farmer may upload into, and read from, ONLY their own folder: <user id>/...
  create policy farmer_documents_insert_own on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'farmer-documents'
      and (storage.foldername(name))[1] = auth.uid()::text
      and is_farmer());

  create policy farmer_documents_select_own on storage.objects
    for select to authenticated
    using (
      bucket_id = 'farmer-documents'
      and (storage.foldername(name))[1] = auth.uid()::text);
exception
  when undefined_table or undefined_schema or insufficient_privilege then
    raise notice 'Storage setup skipped (%). Create a PRIVATE bucket named farmer-documents manually and add the two policies from README.', sqlerrm;
end
$$;

-- ---- Realtime: live queue position + notification bell -------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'queue_entries') then
      alter publication supabase_realtime add table public.queue_entries;
    end if;
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end
$$;
