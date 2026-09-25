/**
 * Maps the machine codes raised by the SQL functions ("CODE: human text" or a
 * bare "CODE") to messages that are safe to show. Anything not listed here is
 * treated as an internal error and replaced by the caller's generic fallback,
 * so raw database text never reaches the UI.
 */
const DEFAULT_MESSAGES: Record<string, string> = {
  NOT_AUTHORIZED: 'You are not allowed to do that.',
  NOT_A_GOVERNMENT_ADMIN: 'Only a government administrator can do that.',
  OUTSIDE_JURISDICTION: 'That is outside your administrative jurisdiction.',
  INVALID_LOCATION: 'The selected location is not valid.',
  PROTECTED_COLUMN: 'That information can only be changed by an administrator.',
  CANNOT_MANAGE_SELF: 'You cannot perform this action on your own account.',
  CANNOT_MANAGE_ADMIN_ACCOUNT: 'Administrator accounts cannot be managed here.',
  ACCOUNT_NOT_FOUND: 'Account not found.',
  REASON_REQUIRED: 'Please enter a reason.',
  INVALID_INPUT: 'Some of the details are not valid.',
  INVALID_DECISION: 'That decision is not allowed.',
  INVALID_STATE: 'This item is not in a state where that can be done.',
  INVALID_STATUS: 'That is not allowed from the current status.',
  NOTES_REQUIRED: 'Please add a note explaining the decision.',
  NO_CROPS: 'The farmer has no procurement crops to approve.',
  CENTRE_NOT_FOUND: 'Procurement centre not found.',
  CENTRE_INACTIVE: 'That centre is not accepting bookings.',
  CENTRE_NOT_ELIGIBLE: 'That centre does not serve your district.',
  CENTRE_CLOSED: 'The centre is closed on that day.',
  OUTSIDE_OPERATING_HOURS: 'That time is outside the centre’s operating hours.',
  SLOT_IN_PAST: 'Choose a later time today.',
  SLOT_FULL: 'That time slot is fully booked. Choose another.',
  CAPACITY_FULL: 'The centre is fully booked on that date.',
  PAST_DATE: 'The procurement date cannot be in the past.',
  BOOKING_WINDOW_CLOSED: 'Booking opens 14 days before the procurement date.',
  INVALID_DATES: 'Check the harvest and procurement dates.',
  INVALID_QUANTITY: 'Enter a quantity greater than zero.',
  QUANTITY_EXCEEDS_APPROVED: 'That is more than the quantity approved for this crop.',
  DUPLICATE_BOOKING: 'You already have a booking for this crop on that date.',
  FARMER_NOT_FOUND: 'Farmer profile not found.',
  FARMER_NOT_APPROVED: 'Your registration has not been approved yet.',
  CROP_NOT_FOUND: 'Crop not found.',
  CROP_NOT_OWNED: 'That crop does not belong to you.',
  CROP_NOT_APPROVED: 'That crop has not been approved yet.',
  APPOINTMENT_NOT_FOUND: 'Booking not found.',
  CANCELLATION_WINDOW_PASSED: 'Bookings can only be cancelled at least 48 hours before the slot.',
  NOT_AN_OPERATOR: 'Your account is not assigned to a procurement centre.',
  TOKEN_NOT_FOUND: 'Token not found.',
  TOKEN_HASH_MISMATCH: 'This QR code is not valid.',
  WRONG_CENTRE: 'This token belongs to a different centre.',
  WRONG_DATE: 'This token is not valid for today.',
  TOKEN_ALREADY_USED: 'This token has already been used.',
  TOKEN_NOT_ACTIVE: 'This token is not active.',
  BOOKING_CANCELLED: 'This booking was cancelled.',
  BOOKING_NOT_VALID_FOR_CHECKIN: 'This booking is not ready for check-in.',
  BOOKING_NOT_FOUND: 'No such booking at your centre.',
  PROCUREMENT_RECORD_NOT_FOUND: 'Procurement record not found.',
  ALREADY_COMPLETED: 'This procurement is already completed.',
  INVALID_TRANSITION: 'That step is not allowed from the current stage.',
  WEIGHT_REQUIRED: 'Enter the weighed quantity to continue.',
  GRADE_REQUIRED: 'Choose a quality grade (A, B or C).',
  ACCEPTED_QUANTITY_REQUIRED: 'Enter the accepted quantity.',
  ACCEPTED_EXCEEDS_WEIGHED: 'Accepted quantity cannot exceed the weighed quantity.',
  ACCEPTED_EXCEEDS_BOOKED: 'Accepted quantity cannot exceed the booked quantity.',
  REGISTRATION_LOCKED: 'Your application can no longer be edited.',
  ACKNOWLEDGEMENT_REQUIRED: 'Please accept all declarations.',
  INVALID_DOB: 'The farmer must be at least 18 years old.',
  INVALID_MOBILE: 'Enter a valid 10-digit mobile number.',
  DOCUMENT_NOT_FOUND: 'Document not found.',
  PROFILE_REQUIRED: 'Submit your registration before uploading documents.',
  INVALID_PATH: 'Invalid upload location.',
  INVALID_FILE_TYPE: 'Only PDF, JPEG and PNG files are accepted.',
  INVALID_FILE_SIZE: 'Files must be smaller than 5 MB.',
  LIMIT_REACHED: 'You have reached the limit for this.',
  UPLOAD_NOT_FOUND: 'The file was not uploaded. Please try again.',
  ALREADY_REGISTERED: 'You already sell this crop.',
  QUANTITY_BELOW_BOOKED: 'That is less than the quantity already booked or sold.',
  ACTIVE_BOOKINGS_EXIST: 'There are open bookings for this crop.',
  DUPLICATE_REQUEST: 'You already have a pending request for this change.',
  REQUEST_NOT_FOUND: 'Request not found.',
  ALREADY_HANDLED: 'Another operator is already handling this request.',
};

/**
 * Returns a user-safe message for a Postgres/PostgREST error message.
 * "CODE: text" -> the text (only for known codes); bare known "CODE" -> default text.
 */
export function rpcErrorMessage(message: string | null | undefined, fallback: string): string {
  if (!message) return fallback;
  const match = /^([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*)(?::\s*([\s\S]+))?$/.exec(message.trim());
  if (!match) return fallback;
  const code = match[1] ?? '';
  if (!(code in DEFAULT_MESSAGES)) return fallback;
  const detail = match[2]?.trim();
  return detail && detail.length > 0 ? detail : (DEFAULT_MESSAGES[code] ?? fallback);
}
