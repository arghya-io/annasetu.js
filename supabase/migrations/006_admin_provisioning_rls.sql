-- ============================================================================
-- ANNASETU — ADMIN PROVISIONING RLS UPDATES (Migration 006)
-- Additive/corrective only. Existing policies not mentioned here are
-- unchanged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- procurement_centres: creation now happens exclusively through
-- create_procurement_centre_admin() (005, jurisdiction-checked, SECURITY
-- DEFINER). The old `for all` policy let ANY gov_admin insert/update/delete
-- ANY centre with no jurisdiction check at all — replaced with an
-- UPDATE-only policy that itself checks admin_jurisdiction_covers() against
-- the row's own location, and no INSERT/DELETE policy (so direct client
-- inserts are refused; only the RPC can create a centre).
-- ----------------------------------------------------------------------------

drop policy if exists procurement_centres_gov_admin_write on procurement_centres;

create policy procurement_centres_gov_admin_update on procurement_centres
  for update
  using (is_gov_admin() and admin_jurisdiction_covers(state_id, district_id, sub_district_id))
  with check (is_gov_admin() and admin_jurisdiction_covers(state_id, district_id, sub_district_id));

-- ----------------------------------------------------------------------------
-- farmer_profiles: scope gov_admin SELECT by jurisdiction (previously any
-- gov_admin could read every farmer in the country). Writes to
-- verification_status still go only through review_farmer_verification_admin()
-- — no gov_admin UPDATE policy is granted here, matching the original intent
-- (and closing the previously-nonfunctional direct-update path).
-- ----------------------------------------------------------------------------

drop policy if exists farmer_profiles_gov_admin_read on farmer_profiles;

create policy farmer_profiles_gov_admin_read on farmer_profiles
  for select using (is_gov_admin() and admin_jurisdiction_covers(state_id, district_id, sub_district_id));

-- ----------------------------------------------------------------------------
-- farmer_documents: scope gov_admin read the same way, via the owning
-- farmer's location. Writes (status/verified_by/verified_at) go only
-- through review_farmer_document_admin().
-- ----------------------------------------------------------------------------

drop policy if exists farmer_documents_gov_csc_read on farmer_documents;

create policy farmer_documents_gov_read on farmer_documents
  for select using (
    is_gov_admin() and exists (
      select 1 from farmer_profiles fp
      where fp.user_id = farmer_documents.farmer_id_user
        and admin_jurisdiction_covers(fp.state_id, fp.district_id, fp.sub_district_id)
    )
  );

create policy farmer_documents_csc_read on farmer_documents
  for select using (is_csc_operator());

-- ----------------------------------------------------------------------------
-- users: gov_admin SELECT stays broad (self or any gov_admin) — see the
-- chat response's note on this as a known scope limitation. What matters for
-- this migration is that the five account-lifecycle columns added in 004
-- cannot be set via the existing users_update_self policy; that protection
-- is the trg_protect_account_lifecycle trigger from 004, not an RLS policy,
-- since RLS is row- not column-scoped. No RLS change needed here.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- centre_operators / csc_operators: unchanged — still no client INSERT
-- policy (provisioning goes through services/admin/provisioning-service.ts
-- using the service-role client, gated by assert_gov_admin_jurisdiction()
-- called first through the RLS-respecting client). SELECT policies from
-- 003_rls_policies.sql already cover self + gov_admin.
-- ----------------------------------------------------------------------------
