# AnnaSetu — Architecture notes

See README.md for setup, flows and the security model. This file records the
structural decisions.

## Layers

```
Browser ── Server Components / Server Actions (services/*) ── Supabase
              (session identity)                (RLS reads, SECURITY DEFINER RPC writes)
```

* **Reads** use the caller's own session (anon key) and are limited by RLS.
* **Writes** are one RPC each; the database validates, authorises, audits and
  notifies atomically. TypeScript only validates for UX and maps error codes
  (`lib/rpc-errors.ts`) to safe messages.
* The **service-role client** (`lib/supabase/admin.ts`, `server-only`) is used
  for four things only: creating/deleting Auth identities after the RPC-level
  authorisation passed; rotating a password after a verified reauth; signing
  short-lived Storage URLs after a jurisdiction check; the daily cron RPC.

## Data ownership

| Area | Writers |
|---|---|
| Farmer profile, land, crops (pending) | `submit_farmer_registration` |
| Crop approval, verification status | `review_farmer_verification_admin`, `review_crop_change_request_admin` |
| Bookings, capacity, tokens | `create_booking`, `cancel_appointment`, `mark_no_shows` |
| Queue positions | `recalculate_queue_positions` (internal; runs on every change) |
| Procurement stages, receipt, payment | `transition_procurement_stage` |
| Accounts | provisioning service (service role, after `authorize_provisioning`), `suspend_account`, `activate_account`, `mark_password_regenerated`, `clear_must_change_password` |
| Notifications | `notify_user` (internal); clients may only flip `is_read` |

## Time

All business dates are Asia/Kolkata. Use `app_today()`, `app_now_local()` and
`app_local_ts(date, time)` in SQL and `todayInAppTimezone()` /
`scheduledAtIst()` in TypeScript.

## Roles and jurisdiction

`government_admins` carries the jurisdiction (state / district / sub-district).
`admin_jurisdiction_covers()` is the single source of truth, used by RLS
helpers (`admin_covers_farmer`, `admin_covers_centre`, …) and every admin RPC.
An admin with no jurisdiction can do nothing.
