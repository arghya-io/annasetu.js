/**
 * Row shapes for the queries the app actually performs. Hand-maintained
 * alongside supabase/migrations/*.sql — only the columns each page reads.
 * Always narrow query results with `rows<T>()` / `one<T>()` from
 * lib/supabase/helpers.ts rather than relying on inferred client types.
 */
import type {
  AccountStatus, BookingStatus, CropChangeStatus, CropChangeType, DocumentKind, DocumentStatus,
  FarmerCategory, HelpRequestStatus, PaymentStatus, ProcurementCropStatus, ProcurementStage,
  QueueStatus, VerificationStatus,
} from '@/types/database';

export interface NameOption { id: string; name: string }

export interface UserRow {
  id: string;
  role: string;
  full_name: string;
  account_status: AccountStatus;
  must_change_password: boolean;
  mobile_country_code?: string | null;
  mobile_number_normalized?: string | null;
}

export interface FarmerProfileRow {
  user_id: string;
  application_id: string | null;
  farmer_category: FarmerCategory;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  father_name: string | null;
  mother_name: string | null;
  spouse_name: string | null;
  date_of_birth: string;
  gender: string;
  mobile_number: string;
  email: string | null;
  address_line: string;
  state_id: string;
  district_id: string;
  sub_district_id: string;
  village_or_town_id: string | null;
  village_or_town_kind: 'village' | 'town' | null;
  verification_status: VerificationStatus;
  submitted_at: string | null;
}

export interface LandOwnerRow {
  owner_name: string;
  relationship_to_farmer: string | null;
  mobile_number: string | null;
  address: string | null;
  ownership_share_percent: number | null;
}

export interface LandRecordRow {
  record_reference: string;
  plot_or_dag: string | null;
  area_value: number;
  area_unit: string;
}

export interface CultivationRow {
  cultivated_area: number;
  cultivated_area_unit: string;
  season: string | null;
  tenancy_or_share_details: string | null;
}

export interface ProcurementCropRow {
  id: string;
  crop_id: string;
  expected_quantity: number;
  status: ProcurementCropStatus;
  crops: { name: string; unit: string; msp_per_quintal?: number | null } | null;
}

export interface FarmerDocumentRow {
  id: string;
  kind: DocumentKind;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  status: DocumentStatus;
  rejection_reason: string | null;
  uploaded_at: string;
}

export interface AppointmentRow {
  id: string;
  centre_id: string;
  procurement_date: string;
  procurement_time: string;
  quantity_quintal: number;
  status: BookingStatus;
  cancellation_reason?: string | null;
  procurement_crops?: { crops: { name: string; unit: string } | null } | null;
  procurement_centres?: { name: string } | null;
}

export interface QueueEntryRow {
  id: string;
  appointment_id: string;
  token_number: string;
  status: QueueStatus;
  queue_position: number | null;
  assigned_counter: number | null;
  estimated_wait_seconds: number | null;
  qr_payload_hash: string;
  queue_date: string;
}

export interface ProcurementRecordRow {
  id: string;
  appointment_id: string;
  stage: ProcurementStage;
  weighed_quantity_quintal: number | null;
  accepted_quantity_quintal: number | null;
  quality_grade: string | null;
  receipt_number: string | null;
  checked_in_at: string | null;
}

export interface PaymentRow {
  procurement_record_id: string;
  amount: number;
  status: PaymentStatus;
  reference_code: string | null;
  is_mock: boolean;
  completed_at: string | null;
}

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

export interface HelpRequestRow {
  id: string;
  subject: string;
  description: string | null;
  status: HelpRequestStatus;
  farmer_id_user: string | null;
  handled_by: string | null;
  resolution_note: string | null;
  created_at: string;
}

export interface CropChangeRequestRow {
  id: string;
  farmer_id_user: string;
  existing_procurement_crop_id: string | null;
  requested_crop_id: string | null;
  requested_change_type: CropChangeType;
  requested_quantity: number | null;
  reason: string;
  status: CropChangeStatus;
  review_notes: string | null;
  submitted_at: string;
}

export interface CentreRow {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  daily_capacity_quintal: number;
  counters_count: number;
  avg_processing_time_seconds: number | null;
  verification_status?: string;
  centre_type?: string | null;
}

export interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  after_data: Record<string, unknown> | null;
}
