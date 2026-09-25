/**
 * Domain types shared by the app. These mirror the Postgres enums in
 * supabase/migrations/*.sql.
 *
 * Deliberately NOT a generated `Database` type: the Supabase clients in
 * lib/supabase/* are untyped (`SupabaseClient<any>`) and every query result
 * is narrowed through the row interfaces in `types/rows.ts` via the helpers
 * in lib/supabase/helpers.ts. That keeps `next build` independent of
 * supabase-js/postgrest-js generic-typing changes, which previously
 * collapsed query results to `never` and failed the production build.
 */

export type AppRole = 'farmer' | 'government_admin' | 'centre_operator' | 'csc_operator';

export type VerificationStatus =
  | 'draft' | 'submitted' | 'under_verification' | 'approved'
  | 'correction_required' | 'rejected' | 'suspended';

export type FarmerCategory =
  | 'owner_cultivator' | 'tenant_farmer' | 'sharecropper' | 'joint_co_owner' | 'other_eligible_cultivator';

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

export type BookingStatus =
  | 'draft' | 'booked' | 'confirmed' | 'checked_in' | 'in_progress'
  | 'completed' | 'cancelled' | 'no_show' | 'expired';

export type QueueStatus =
  | 'waiting' | 'called' | 'checked_in' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

export type ProcurementStage =
  | 'scheduled' | 'checked_in' | 'document_verified' | 'weighing' | 'quality_check'
  | 'accepted' | 'unloading' | 'receipt_generated' | 'payment_initiated' | 'completed';

export type PaymentStatus =
  | 'payment_pending' | 'payment_initiated' | 'payment_processing'
  | 'payment_completed' | 'payment_failed';

export type ProcurementCropStatus = 'pending_approval' | 'approved' | 'locked' | 'removed';
export type CropChangeStatus = 'pending' | 'under_review' | 'approved' | 'rejected' | 'correction_required';
export type CropChangeType = 'add' | 'remove' | 'modify_quantity';
export type HelpRequestStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type DocumentKind =
  | 'identity_proof' | 'land_record' | 'farmer_id_proof' | 'tenancy_proof'
  | 'sharecropper_proof' | 'joint_ownership_proof' | 'other';
export type DocumentStatus =
  | 'pending' | 'uploaded' | 'under_review' | 'verified' | 'rejected' | 'correction_required' | 'expired';

export type AccountStatus = 'pending' | 'active' | 'suspended' | 'disabled' | 'deactivated';
export type GovAdminRole = 'bdo' | 'sdo';
export type CentreVerificationStatus = 'pending' | 'verified' | 'rejected';
