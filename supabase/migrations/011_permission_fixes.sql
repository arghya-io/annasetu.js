-- ============================================================================
-- ANNASETU — PERMISSION FIXES (Migration 011)
--
-- Every migration up to 010 assumed Supabase's default project template had
-- already granted `authenticated` base SELECT on tables in `public`, on top
-- of which RLS policies (003/006/007) narrow down the actually-visible rows.
-- That base grant was never made explicit in our own migrations. On at least
-- one deployment that assumption didn't hold, and every query — even ones
-- fully permitted by RLS — failed with "permission denied for table X",
-- which our list pages silently swallow into an empty-looking page (see the
-- `rows()`/`one()` helpers in lib/supabase/helpers.ts and the error-surfacing
-- added in this same change).
--
-- This migration makes that base grant explicit and idempotent, and
-- re-asserts the function EXECUTE grants from 010 in case that migration
-- didn't fully apply either. Safe to run repeatedly.
-- ============================================================================

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
alter default privileges in schema public grant select on tables to authenticated;

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
begin
  foreach f in array authenticated_fns loop
    begin
      execute format('grant execute on function public.%s to authenticated, service_role', f);
    exception when undefined_function then
      raise notice 'Skipped missing function during 011 re-grant: %', f;
    end;
  end loop;
end $$;
