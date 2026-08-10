# Security & PDPA (ความเป็นส่วนตัวของข้อมูล) — Nineall HR

## Authentication

- Supabase Auth (email + password). Employee code login is resolved to an
  email server-side before calling `signInWithPassword` (Supabase Auth itself
  only knows email).
- `profiles.must_change_password` forces a password change on first login.
- `profiles.failed_login_count` / `locked_until` columns exist for rate
  limiting — **not yet wired to actual lockout logic**, see
  `IMPLEMENTATION_STATUS.md`.
- Password reset via `supabase.auth.resetPasswordForEmail` +
  `/reset-password` page (admin-web). The response is identical whether or
  not the email exists, to avoid account enumeration.
- `login_events` table records login/logout/reset events for security review.
- admin-web is gated to `super_admin | hr | manager` roles only — an
  `employee`-role account that authenticates against admin-web is immediately
  signed out with a message directing them to the mobile app.

## Authorization

Enforced in three layers, deliberately redundant:

1. **Row Level Security** (`0009_rls_policies.sql`) — the real boundary. Even
   a client that bypasses the UI and calls the Supabase REST API directly
   cannot read another employee's payslip, bank account, or attendance.
2. **Server Actions / Edge Functions** re-check role before any write
   (`requireRole()` in admin-web, JWT-derived `employee_id` in Edge
   Functions) — defense in depth, not the primary boundary.
3. **UI** hides controls the caller's role shouldn't use — convenience only,
   never relied on for security.

## Sensitive data handling

- **Bank account numbers**: full value stored only in `bank_accounts`, which
  RLS restricts to `hr`/`super_admin`/the employee themself. Every UI
  surface (admin-web, mobile) only ever renders a masked form
  (`XXX-X-X1234-X`) — the full number is never sent to a `manager`-role
  session.
- **Selfies, ID documents, payslip PDFs**: stored in **private** Supabase
  Storage buckets (`selfies`, `documents`, `payslips`, `attachments`,
  `avatars`, `announcements` — see `0011_storage.sql`). Nothing is public;
  every read goes through RLS-checked, short-lived signed URLs generated
  server-side.
- **GPS location**: only captured at the moment of clock-in/out
  (`attendance_records.clock_in_latitude/longitude`), never tracked in the
  background. The mobile app requests foreground-only location permission and
  only when the user opens the Attendance tab and taps the clock button.
- **Payslip PIN gate**: `profiles.pin_hash` column exists in the schema for a
  second-factor check before opening a payslip (master prompt §6). The mobile
  payslip screen does **not yet** enforce this PIN check — see
  `IMPLEMENTATION_STATUS.md`. Do not advertise PIN-gated payslips as complete
  until that's wired up.

## Audit trail

`audit_logs` captures before/after JSON for employee edits, attendance edits,
leave/OT decisions, payroll run status changes, and profile changes, via
Postgres triggers (`0010_triggers.sql`) — so it can't be skipped by forgetting
to log something in application code. Readable only by `super_admin`.

## PDPA / privacy consent

The Thai Personal Data Protection Act (PDPA) requires informed consent for
collecting GPS, camera/selfie, and payroll data from employees. This build
provides the **data model and storage controls** (private buckets, minimal
GPS retention, masked bank data) but **does not yet include**:

- A dedicated in-app Thai-language Privacy Consent screen (master prompt
  §6, "จัดทำหน้า Privacy Consent ภาษาไทย") — see
  `IMPLEMENTATION_STATUS.md`.
- A recorded consent timestamp per employee.

**Before production launch, have the company's legal/compliance function
review and approve the actual consent copy and consent-recording flow** —
this is explicitly called out as a step the master prompt requires humans to
own (§15, "ระบุรายการที่ต้องให้เจ้าของบริษัท นักบัญชี หรือผู้เชี่ยวชาญตรวจสอบก่อน
Production").

## What was intentionally NOT built

- Facial recognition / automatic face matching — the spec explicitly says
  selfies are evidence only for MVP, not biometric matching (§6).
- Always-on background location — explicitly prohibited by the spec (§6, §8.2).
