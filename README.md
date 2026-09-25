# AnnaSetu

Farmer-first procurement booking, queue and processing platform — Next.js 14 (App Router) + Supabase (Postgres, Auth, Storage, Realtime).

Four roles, one complete flow:

```
Farmer registers ──► Government (BDO/SDO) verifies + approves crops ──► Farmer books a slot
      ▲                                                                       │
      │ CSC operator helps                                                     ▼
Payment (simulated) ◄── Receipt ◄── Quality/grade ◄── Weighing ◄── Operator scans QR at the centre
```

| Role | What they do |
|---|---|
| **Farmer** | Self-registers (email), completes a 4-step registration, uploads documents, books a slot, watches a live queue position, cancels (≥48 h ahead), sees receipt + simulated payment, requests crop changes, asks a CSC for help |
| **Government admin (BDO / SDO)** | Reviews applications (also approves the farmer's crops), verifies documents, reviews crop-change requests, manages centres, provisions farmers / CSC operators / centre operators, suspends accounts, resets passwords, reads the audit log — **all limited to their own jurisdiction** |
| **Centre operator** | Scans the farmer's QR to check in, calls tokens, and moves each procurement through document check → weighing → quality/grade → acceptance → unloading → receipt → payment |
| **CSC operator** | Assists farmers in their district through help requests. Never approves anything |

---

## 1. Setup

### 1.1 Supabase project

1. Create a project. In **Authentication → Providers** enable **Email** and **Phone** (phone is used only for the mobile+password login of admin-provisioned accounts; no SMS/OTP is sent — set "Confirm phone" off / use any placeholder SMS provider).
2. Run the migrations **in order** in the SQL editor (or `supabase db push` / `supabase db reset`, which also runs `seed.sql`):

   | File | Purpose |
   |---|---|
   | `001_schema.sql` | Tables, enums, indexes |
   | `002_functions.sql` | Original booking / queue functions (superseded by 008 — keep, run first) |
   | `003_rls_policies.sql` | Original RLS (tightened by 007) |
   | `004`–`006` | Admin provisioning schema / functions / RLS |
   | **`007_security_hardening.sql`** | Role helpers, null-safe jurisdiction, scoped RLS, column grants, IST helpers |
   | **`008_booking_and_processing.sql`** | Booking rules, live queue, check-in, staged processing, no-show close-out |
   | **`009_registration_and_review.sql`** | Atomic registration, review / approval, crop changes, documents, help requests |
   | **`010_grants_storage_realtime.sql`** | Function EXECUTE grants, private `farmer-documents` bucket + policies, Realtime |

   > The folder is now lower-case `supabase/` so the Supabase CLI (`supabase db reset`, `supabase test db`) finds it on Linux/CI. If your repo still has `Supabase/`, run `git mv Supabase supabase_tmp && git mv supabase_tmp supabase`.

3. Create the **first government admin** with `supabase/bootstrap_first_admin.sql` (one-time; every other account is created from the app).
4. If migration 010 printed *"Storage setup skipped"*, create a **private** bucket named `farmer-documents` (5 MB, PDF/JPEG/PNG) and add two policies on `storage.objects`: insert/select where `bucket_id = 'farmer-documents' and (storage.foldername(name))[1] = auth.uid()::text`.

### 1.2 Environment

```
cp .env.example .env.local
NEXT_PUBLIC_SUPABASE_URL=…            # public
NEXT_PUBLIC_SUPABASE_ANON_KEY=…       # public
SUPABASE_SERVICE_ROLE_KEY=…           # SERVER ONLY — never NEXT_PUBLIC_
CRON_SECRET=<long random string>      # protects /api/cron/close-day
```

### 1.3 Run / deploy

```
npm install
npm run dev            # http://localhost:3000
npm run typecheck && npm test
npm run build
```

Deploy on Vercel with the four env vars. `vercel.json` schedules `/api/cron/close-day` at 00:00 IST; it marks bookings for past dates that were never checked in as **no-show** and notifies the farmer (Vercel sends `Authorization: Bearer $CRON_SECRET` automatically).

---

## 2. Architecture

```
app/            Next.js routes: (public) login/register · farmer/* · operator/* · gov-admin/* · csc/* · notifications · api/cron
components/     UI (ui/ primitives, shared/, farmer/, operator/, gov-admin/, admin/, csc/)
services/       'use server' actions — thin: validate → derive identity from the SESSION → call ONE RPC
lib/            supabase clients, session helpers, validation (zod), constants (IST helpers), rpc-error mapping
supabase/       migrations, seed.sql, bootstrap_first_admin.sql, tests/database (pgTAP)
```

Design rules that keep this safe:

* **All writes are SECURITY DEFINER RPCs.** Clients can only `SELECT` (through RLS). Each RPC identifies the caller from `auth.uid()`, checks the account is *active* and not awaiting a forced password change, validates the whole input, checks jurisdiction, writes the audit row and notifications, and is atomic.
* **Business rules live in Postgres**, not the UI: 14-day window, operating hours + working days, farmer↔centre eligibility, per-crop quantity cap, one active booking per crop/date, daily capacity, 30-minute slot throughput, 48 h cancellation, stage sequence, grading/weight/receipt/payment.
* **Identity is never a parameter.** Server actions derive the user from the verified session; there is no `userId`/`farmerId`/`actorId` argument to spoof.
* **Jurisdiction is enforced in RLS and every admin RPC** and fails **closed** (NULL ⇒ deny).
* **Everything is IST.** `app_today()` / `app_local_ts()` (DB) and `todayInAppTimezone()` (UI) — never the server's UTC clock.
* **Supabase clients are untyped** and every result is narrowed through `types/rows.ts` + `lib/supabase/helpers.ts`. A hand-written `Database` generic used to collapse queries to `never` and break `next build`.

### The flows

**Registration** — `/register` (farmer, email) → `/farmer/registration` wizard (state is held in the browser until the final submit; one RPC `submit_farmer_registration` writes everything atomically and can be retried safely) → `under_verification`. Admin-provisioned farmers start as a **draft** the wizard pre-fills; a *correction requested* application re-opens the wizard with the reviewer's note.

**Verification** — `/gov-admin/farmer-verification` → farmer detail (profile, land, crops, documents with short-lived signed URLs) → approve / request correction / reject. **Approving also approves the farmer's pending procurement crops** (previously nothing did, so an approved farmer could never book).

**Booking** — `/farmer/book`: eligible centres only, live capacity + queue + wait estimate, slot grid with per-slot availability, and "other dates / other centres" when full → token + QR → `/farmer/queue` (Realtime position, ETA, stage progress) and `/farmer/bookings` (cancel, receipt, payment).

**Processing** — `/operator/scan` (camera QR, every check-in re-validated server-side) → `/operator/dashboard` queue (call token) → `/operator/processing/[appointmentId]`: document check → weighing (weight) → quality (grade + accepted qty ≤ weighed ≤ … ≤ booked) → unloading → receipt number → payment (**simulated**: accepted qty × crop MSP) → complete. Completion updates the centre's rolling average (last 15) and re-ranks the queue live.

**Support** — farmers file help requests by district; CSC operators claim and resolve them. Notifications (bell + `/notifications`) fire at every milestone.

**AnnaSathi** — `/farmer/annasathi`: a conversational front door onto the same farmer data (verification status, active booking/token, eligible centres — fetched server-side, real). Voice input does a real microphone-permission check via `getUserMedia` and shows the idle/listening/thinking/error/permission-denied states, but the transcript, language switching and every reply are simulated (`components/annasathi/response-engine.ts` is the one function to replace once a real ASR/RAG backend exists — see the comment at its top for the intended pipeline). No page, card or label claims live AI, government verification, or a phone/IVR line that don't exist.

---

## 3. Security model (what changed and why)

A review of the original code found these problems; all are fixed in migrations 007–010 and the services:

| # | Finding | Fix |
|---|---|---|
| 1 | Any signed-in user could `UPDATE users SET role='government_admin'` (no column restriction) | Column-level `GRANT UPDATE (full_name, face_verification_enabled)`; trigger keyed on `current_user` blocks everything else |
| 2 | Farmers could set their own `verification_status` (`FOR ALL` owner policy) | Farmer tables are SELECT-only; every write is an RPC |
| 3 | Provisioning actions never checked the caller was an admin; the jurisdiction check ran *last* and its result was ignored | `authorize_provisioning()` runs **first**; failures roll the account back; audit failure rolls back too |
| 4 | Jurisdiction checks **failed open** on NULL (`if not NULL` doesn't raise) — a BDO could reset any admin's password | Null-safe, fail-closed; admin↔admin and self-targeting refused |
| 5 | Anyone could self-register as a CSC operator and read all farmer PII | Self-signup is farmer-only (role is not an input); CSC reads are district-scoped |
| 6 | Suspended / must-change-password accounts were blocked only by Next.js middleware | Every RLS helper and RPC checks account state; suspension also bans the Auth identity |
| 7 | Browser could call `complete_first_login_password_change()` and skip the password change | Replaced by a service-role-only RPC after a verified reauth + rotation |
| 8 | Gov-admin reads/writes were country-wide; audit log unscoped | Reads scoped by jurisdiction; writes only via RPC |
| 9 | `SECURITY DEFINER` functions had no `search_path`; anon could call internal functions | Pinned `search_path`; explicit `REVOKE`/`GRANT` per function |
| 10 | `?redirectTo=` open redirect on login | Same-origin path sanitiser |
| 11 | `current_date` (UTC) used for IST business rules; a `CHECK (procurement_date >= current_date)` broke every later UPDATE | IST helpers; constraint removed (window enforced on insert) |
| 12 | Forged audit attribution via client-supplied `actorId`; non-atomic crop-change review | Single RPC, `auth.uid()` |

Also fixed: the admin forms and registration step 1 **could never submit** (required location fields lived outside the form state), `useSearchParams` without Suspense would fail `next build`, the queue preview counted only the farmer's own rows, post-check-in redirected to a route that didn't exist, and no code path ever approved procurement crops.

**Not done / by design**: no OTP (spec: mobile+password), payments are simulated, biometric login is a disabled placeholder, no i18n strings yet, no rate limiting beyond Supabase Auth's. Farmer self-signup does not verify phone ownership.

---

## 4. Tests

```
npm test            # vitest: validation, IST date maths, redirect sanitiser, RPC error mapping
npm run test:db     # pgTAP (needs `supabase start`): security_and_rls · booking_and_processing · admin_provisioning · rolling_average
```

`security_and_rls.test.sql` switches to the `authenticated` / `anon` roles exactly as PostgREST does, so it exercises the real policies and grants (the earlier suites ran as superuser and bypassed RLS entirely).

## 5. Operating notes

* **Passwords**: admin-provisioned accounts get an 8-character initial password (CSPRNG, shown once, never stored) and must change it at first sign-in; the database refuses every read/RPC until they do.
* **Storage**: farmer documents live in a private bucket under `<user id>/…`; admins view them through 5-minute signed URLs minted only after a jurisdiction check.
* **Realtime**: `queue_entries` and `notifications` are added to the `supabase_realtime` publication by migration 010.
