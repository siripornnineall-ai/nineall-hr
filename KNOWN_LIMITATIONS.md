# Known Limitations — Nineall HR

Required by the master prompt §25: anything not genuinely working must be
listed here honestly rather than silently treated as done. This is a
summary — `IMPLEMENTATION_STATUS.md` has the full module-by-module table
and is the source of truth if the two ever disagree.

## Resolved this session: login now works

Previously listed here as blocking: `auth.users`/`profiles` had 0 rows and
the account owner could not access the Supabase account that owns this
project to retrieve `SUPABASE_SERVICE_ROLE_KEY`. Resolved by creating the 4
demo accounts via direct SQL (`scripts/seed-demo-accounts.sql`, bcrypt hash
via `pgcrypto`) instead of the Admin API — verified by actually logging in
as both a super_admin and an employee account in-browser.

**Still true:** `SUPABASE_SERVICE_ROLE_KEY` in `apps/admin-web/.env.local`
is a placeholder, so admin-web's "create employee + login account" UI flow
(which uses the Admin API) won't work until the account owner retrieves and
fills that in. The 4 existing demo accounts work fine without it.

## Translation / multi-language (master prompt §5)

- The Translation Management *admin screen* exists (`/translations`) and can
  create/edit/export/import translation strings, but **no screen in either
  app actually reads from that table yet** — all UI text is still hardcoded
  Thai (with some English) directly in components. `packages/i18n` (the
  shared package that would make this real) does not exist yet.
- The dormant `employee-mobile` (Expo/React Native) app defaults every piece
  of text to the Thai font regardless of the signed-in user's language
  preference, because React Native needs one fixed `fontFamily` per `<Text>`
  node and there was no time to build a locale-aware switcher. The active
  `employee-pwa` and `admin-web` apps don't have this problem — their CSS
  `font-family` stack (Noto Sans Thai → Noto Sans → Noto Sans Lao → Noto
  Sans Myanmar) lets the browser fall back per-character automatically, so
  mixed-script text already renders correctly without extra code.
- Translation Management's Import function accepts JSON, not Excel. The
  Stitch reference screen shows an "Import Excel" button; this session
  implemented JSON import as a pragmatic first version instead of adding an
  Excel-parsing dependency.
- No automated test yet detects missing translation keys (explicitly
  required by master prompt §5).
- Announcements are not yet stored per-language, push notifications don't
  yet localize to the recipient, and payslips don't yet render in the
  employee's chosen language — all depend on `packages/i18n`.

## Custom roles & permissions (master prompt §6)

- `custom_roles` table exists but is a foundation only — Super Admin cannot
  yet create a custom role through any UI, and the actual permission-check
  code path (RLS + `requireRole()`) still keys off the fixed `user_role`
  enum, not `custom_roles`.
- No Role & Permission management screen exists yet.

## Employee app: PWA instead of native (decided session 2)

The account owner chose an installable Progressive Web App
(`apps/employee-pwa`) over submitting to Google Play/App Store, to avoid
the $99/year Apple fee, the $25 Google fee, and store review overhead. The
older Expo native app (`apps/employee-mobile`) still exists but is dormant.
This trade-off means, compared to what a native app could do:

- **No biometric login/payslip-unlock is possible at all** — web apps
  cannot call platform biometric APIs. The payslip PIN-gate (not built on
  either version yet) will have to be a PIN, not a fingerprint/face option,
  when it's built for the PWA.
- **Push notifications are more limited.** Web Push works on Android Chrome,
  but on iOS Safari it only works after the user has manually added the PWA
  to their home screen (iOS 16.4+) — not automatic like a native app.
  Not built yet on either version regardless.
- Offline clock-in queueing: the database supports it
  (`is_offline_submission`, `needs_review`) but **neither** the dormant Expo
  app nor the new PWA implements a local queue/retry — a failed network call
  today just shows an error on both. The PWA's service worker only makes the
  app *open* offline (cached app shell + an offline fallback page); it does
  not queue a failed clock-in for later resync.
- Overtime request and Announcements screens exist in neither app —
  carried over from session 1, not a new gap from the PWA switch.
- No shift schedule view, shift-swap request, or time-correction request
  screen exists in either employee-facing app yet (admin-web can manage
  these for testing purposes; the tables/RLS/triggers are ready).
- The PWA's leave request form uses a native `<input type="date">` (an
  improvement over the Expo app's plain-text `YYYY-MM-DD` field).

## Payroll & payslips

- No printable/PDF payslip generation yet, and no bank-file export.
- Payslip PIN-gate is not implemented — `profiles.pin_hash` exists in the
  schema but nothing checks it before showing a payslip.
- Loans/salary-advance tables exist (`loans`, `loan_installments`) but there
  is no admin UI to create or manage them yet.
- Tax/social-security rates in `policy_settings` are placeholder values and
  are explicitly flagged in `PAYROLL_RULES.md` as needing review by a real
  accountant/payroll professional before any production use — this is
  stated on purpose, not an oversight.

## Security & PDPA

- No PDPA privacy-consent screen exists yet — `consent_records` table is
  ready but nothing writes to it.
- No signed-URL expiry for selfie/payslip file access yet (relies on
  RLS-scoped direct access today).
- No login-lockout-after-N-failed-attempts enforcement yet (schema columns
  exist, not wired up).

## Testing & CI

- No CI workflow runs typecheck/lint/test automatically on push.
- No Playwright (web) or Detox (mobile) end-to-end tests exist.
- The Translation Management screen built this session passed build +
  typecheck but has not been click-tested against a real logged-in session,
  because no login currently works (see "Blocking" above).

## Store readiness

- Neither app has been submitted to Google Play or the Apple App Store.
  Bundle identifiers were changed this session
  (`com.nineall.hr` → `com.nineallgroup.hr`) — safe now, but would not be
  safe to change again after a real store submission exists.
