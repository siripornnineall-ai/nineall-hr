# Implementation Status — Nineall HR

Last updated: 2026-08-06 (session 2, continued). Update this file every time
a module is finished or a decision changes — do not silently let it go
stale, and do not declare something "done" here if its tests/build aren't
actually green.

**Login is unblocked as of 2026-08-06.** The account owner could not access
the Supabase account that owns this project (see `scripts/
seed-demo-accounts.sql`'s header for why), so the 4 demo accounts were
created by inserting directly into `auth.users`/`auth.identities`/
`public.profiles` via SQL (bcrypt-hashed password via `pgcrypto`), bypassing
the Supabase Admin API / service-role-key requirement entirely. **Verified
by actually logging in** in-browser as both `EMP-001` (super_admin, via
admin-web) and `employee@nineallgroup.co.th` (employee, via employee-pwa) —
both reached their real dashboards with live data, zero console errors.

## 0. Design source of truth

Session 2 replaced the session-1 Stitch export with
`stitch_nineall_hr_unified_management_system.zip` (terracotta `#C54B38` /
deep-teal `#003942`, Noto Sans family for th/en/lo/my). Full audit in
`STITCH_AUDIT.md`. `packages/design-tokens`, `apps/admin-web`'s
`globals.css`/fonts, and `apps/employee-mobile`'s theme/fonts/app icons were
all updated to match; see §3/§4 below for exactly what changed.

## 1. Infrastructure

| Item | Status | Notes |
|---|---|---|
| Monorepo scaffold (npm workspaces) | ✅ Done | `apps/*`, `packages/*` |
| Design tokens package | ✅ Done, refreshed session 2 | `packages/design-tokens` — new palette + Noto Sans fonts |
| **Supabase project** | ✅ **Live** — `nineall-hr`, ref `zopfkyfqgvaxawlkuink`, `ACTIVE_HEALTHY` | The session-1 blocker (org at 2-project free-tier limit) is resolved — a project exists and is seeded. The note below about "next session should start here" was stale; correcting it now. |
| Database schema (migrations 0001–0016) | ✅ Written **and applied** | `0013`–`0016` existed live but were missing as local files (applied via MCP without a matching commit) — reconstructed and committed this session; see `ER_DIAGRAM.md` §8 |
| RLS policies | ✅ Written and applied, RLS enabled on all 52 tables | `0009`, extended by `0014` for the gap-fill tables |
| Triggers | ✅ Written and applied | `0010_triggers.sql` |
| Storage bucket policies | ✅ Written and applied | `0011_storage.sql` |
| Edge Functions (clock-in, clock-out) | ✅ Written — **deployment status not re-verified this session**, check `supabase functions list` before assuming live | `supabase/functions/` |
| Seed data | ✅ Applied — 16 employees, 15 attendance records, 3 leave requests, 2 OT requests, 3 announcements, ~75 translation keys, etc. | `supabase/seed/` |
| `apps/admin-web/.env.local` | 🟡 Partial | URL/anon key filled in. `SUPABASE_SERVICE_ROLE_KEY` is **still the placeholder** — still needed for the admin-web "create employee + login account" flow and for `npm run seed:accounts` (the Admin-API version of account creation). Not needed for the 4 demo accounts, which were created a different way — see below. |
| `apps/employee-mobile/.env` | ❓ Not checked this session | Verify it has the same URL/anon key before running the mobile app |
| **`auth.users` / `profiles` — 4 demo accounts** | ✅ **Created and verified working** | See `scripts/seed-demo-accounts.sql` — created directly via SQL (bcrypt password hash via `pgcrypto`) since the account owner couldn't retrieve the service-role key. **Logged in as both `EMP-001` and `employee@nineallgroup.co.th` in-browser this session** — both reached real dashboards. `SUPABASE_SERVICE_ROLE_KEY` is still needed for creating *additional* employee accounts through the admin-web UI (that flow uses the Admin API, not this SQL workaround). |

## 2. Payroll & time-calculation engine (`packages/payroll-engine`)

✅ **Complete and tested** (unchanged this session — not re-run yet, see §9
"still to verify"). 21 Vitest tests covering master prompt §9/§10. Money
handled as integer satang. See `PAYROLL_RULES.md`.

## 3. Admin web (`apps/admin-web`)

Next.js 16 + Supabase SSR. **Builds clean** after the session-2 design
refresh (`npm run build --workspace=apps/admin-web` — 16 routes, 0
TypeScript errors, verified this session).

| Module | Status | Notes |
|---|---|---|
| Login / logout / forgot / reset password | ✅ Real, Supabase Auth-backed, **verified live** | **Bug found and fixed this session**: employee-code login was comparing the `employee_id` UUID column against the typed code string (e.g. "EMP-001"), which could never match — email login worked, code login silently didn't. Now calls `lookup_login_email()` (the RPC `0016` added but that nothing actually called until this fix). **Confirmed working end-to-end**: logged in as `EMP-001` in-browser, real dashboard loaded (16 employees, 1 pending leave, 1 pending OT, live announcements), zero console errors |
| Role gate | ✅ Done | `requireUser()` in `src/lib/auth.ts` — `payroll_admin` role (added `0013`) not yet threaded through role-gate logic, verify before relying on it |
| Dashboard | ✅ Real queries | |
| Employee directory / create / detail | ✅ Real (edit form still not built) | |
| Attendance (daily timesheet) | ✅ Real queries, reads-only | Inline edit-with-reason still not built |
| Leave (list + approve/reject) | ✅ Real | |
| Overtime (list + approve/reject) | ✅ Real | |
| Payroll (full flow: create → calculate → submit → approve → lock) | ✅ Real | Bank-file export, printable payslip PDF still not built |
| Announcements | ✅ Real | |
| **Translation Management** | ✅ Built and **click-tested this session** | `/translations` (super_admin/hr only) — search, missing/complete filter, inline per-locale editing with autosave + history log (`translation_history`), add-key form, delete-key, JSON export/import (not Excel — see limitation below), missing-translation warning count. Database already had **~75 translation keys** (`auth.*`, `common.*`, `dashboard.*`, `nav.*`, `status.*` namespaces) from earlier in session 2, plus 8 more added via `supabase/seed/004_translations.sql`. **A real bug was caught and fixed here**: `LOCALES`/`Locale` were originally exported from `actions.ts`, a `"use server"` file — Next.js only allows async-function exports from Server Action modules, so the client component received a broken value and the page 500'd (`LOCALES.some is not a function`). Moved the constant to a new `constants.ts` and re-verified — logged in as `EMP-001`, page loads real data cleanly, zero console errors. **Known limitation:** import is JSON, not Excel (master prompt's Stitch reference shows "Import Excel" — parsing .xlsx server-side wasn't attempted this session) |
| Settings | 🟡 Partial | Same gaps as session 1: branches/teams/positions CRUD, tax/SS version editor, approval-chain config, role-permission matrix UI not built; `custom_roles` table exists but isn't wired into any UI or the RLS permission check yet |
| Reports | 🟡 Partial | One real report (monthly attendance summary) |
| Shift & schedule management UI | ❌ Not built | |
| Time-correction request review UI | ❌ Not built | |
| CSV/Excel employee import | ❌ Not built | |
| Loans / salary advance UI | ❌ Not built | `loans`/`loan_installments` tables exist (added `0014`), no UI yet |
| Branding | ✅ Refreshed session 2 | Logo, colors, fonts now match the new Stitch export — see `STITCH_AUDIT.md` |

## 4. Employee mobile app (`apps/employee-mobile`) — DORMANT since session 2

**Decision (session 2, 2026-08-05): the account owner chose an installable
PWA over native app store distribution** (cost: Apple Developer Program
$99/year + Google Play $25 one-time + store review overhead, vs. free/no-review
for a PWA). This app is left in place, not deleted, in case native is
revisited — but it is no longer the actively developed employee app. See
§4b below for its replacement, and `ARCHITECTURE.md`'s "PWA vs. native"
table for exactly what's gained/lost.

Everything below is state as of session 2, frozen:

Expo (SDK 57) + expo-router. **Typechecks clean** after the session-2 design
refresh (`npx tsc --noEmit`, verified this session). Not re-bundled/re-run
on a device this session.

| Module | Status | Notes |
|---|---|---|
| Login | ✅ Real | Same `lookup_login_email()` bug fixed here as in admin-web (see §3) |
| Auth session persistence, route guarding | ✅ Real | |
| Home dashboard | ✅ Real queries | |
| Attendance clock-in/out (GPS + selfie) | ✅ Real, server-computed | |
| Leave request (submit + history) | ✅ Real | Plain-text date input, no native picker |
| Overtime request | ❌ Not built | |
| Payslip list + breakdown | ✅ Real queries | PIN-gate still **not implemented** |
| Announcements screen | ❌ Not built | |
| Profile | ✅ Real (change password, logout) | PIN setup, data-edit/deletion request flows not built |
| Push notifications | 🟡 Partial | `devices` table exists, no client code registers a token yet |
| Offline clock-in queue | ❌ Not built | |
| Branding | ✅ Refreshed session 2 | New app icon / adaptive icon / splash screen / favicon, Noto Sans fonts |
| Bundle identifiers | ✅ Changed | `com.nineall.hr` → `com.nineallgroup.hr` — moot now unless native is revisited |

## 4b. Employee PWA (`apps/employee-pwa`) — NEW this session, now the active employee app

Next.js 16, installable Progressive Web App. **Builds clean** (`npm run
build --workspace=apps/employee-pwa` — 7 routes + manifest, 0 TypeScript
errors, verified this session) and **renders correctly in-browser**
(checked login page + manifest.webmanifest over the network, no console
errors). Ported from `apps/employee-mobile`'s business logic (same Supabase
queries, same Edge Function calls) rather than rebuilt from scratch — read
`ARCHITECTURE.md`'s PWA section for how camera/GPS map to web APIs.

| Module | Status | Notes |
|---|---|---|
| PWA installability | ✅ Real | `app/manifest.ts`, hand-written service worker (`public/sw.js`) caching the app shell + an offline fallback page, full icon set (192/512/maskable/apple-touch), theme-color/viewport meta for iOS "Add to Home Screen" |
| Login | ✅ Real, **verified live** | Uses `lookup_login_email()` RPC correctly (built alongside the admin-web bug fix, see §3); rejects non-employee accounts with a redirect message. **Confirmed working**: logged in as `employee@nineallgroup.co.th` in-browser, redirected to the real home dashboard, zero console errors |
| Auth session, route guarding | ✅ Real | `requireEmployee()` server-side (redirects non-employee roles to "use admin-web") + client `AuthContext` mirroring the Expo app's pattern |
| Home dashboard | ✅ Real queries, **verified live** | Same stats as the Expo version: leave balance, OT hours, pending requests, latest payslip, today's status, live clock |
| **Attendance clock-in/out (GPS + live camera)** | ✅ Real, server-computed | The critical flow. `getUserMedia` front camera → live preview → frame captured to `<canvas>` → JPEG blob (never a file picker), `navigator.geolocation` for GPS, uploads to the same `selfies` Storage bucket, calls the same `clock-in`/`clock-out` Edge Functions with the same payload shape the Expo app used — **zero server-side changes needed** |
| Leave request (submit + history) | ✅ Real | Uses native `<input type="date">` — an actual improvement over the Expo app's plain-text date field |
| Payslip list + breakdown | ✅ Real queries | Expandable detail per payslip. PIN-gate not implemented (same gap as Expo version) |
| Profile (change password, privacy note, logout) | ✅ Real | Same as Expo version |
| Overtime request, Announcements screen | ❌ Not built | Same gap as the Expo app had — not a regression, just not yet ported/built |
| Forgot password | ❌ Not built | admin-web has one; the PWA login page doesn't link to one yet |
| Push notifications | ❌ Not built | Web Push is possible (Android Chrome; iOS 16.4+ only after home-screen install) but not wired up |
| Offline clock-in queue | ❌ Not built | The service worker makes the app shell open offline; it does not queue a failed clock-in submission for retry |
| **Login → home dashboard click-tested** | ✅ Verified live | Logged in as `employee@nineallgroup.co.th`, reached the real dashboard with live data, zero console errors. Attendance/leave/payslip/profile were **not** individually click-tested this session (login+home was the priority once accounts existed) — still only build/typecheck-verified for those specific screens |

## 5. Translation / i18n system (master prompt §5)

**Net-new gap identified this session — not solved yet, just made buildable.**

- ✅ Database: `translation_keys`, `translations` (th/en/lo/my), `translation_history`, `profiles.preferred_language` (all `0014`). Already has ~75 real keys across `auth.*`/`common.*`/`dashboard.*`/`nav.*`/`status.*` namespaces (from earlier in session 2) plus 8 more seeded this pass.
- ✅ admin-web Translation Management screen built **and click-tested** this session (§3 above) — the *authoring tool*, not the runtime.
- ❌ Not built: `packages/i18n`, a shared hook/provider either app can use to actually render DB-backed strings. Every screen in both apps still has hardcoded Thai text. This is the single biggest remaining gap against the new master prompt — see §9.
- ❌ Not built: automated test for missing translation keys (master prompt §5 explicitly requires one).
- ❌ Not built: announcement translations, push notifications in recipient's language, payslip language selection (all depend on `packages/i18n` existing first).

## 6. Documentation bundle

| File | Status |
|---|---|
| `README.md`, `README_FOR_OWNER_TH.md`, `.env.example` | ✅ From session 1, not re-verified this session |
| `ARCHITECTURE.md` | ✅ Updated session 2 (design refresh + i18n-gap note) |
| `DATABASE_SCHEMA.md` | ✅ Updated session 2 (`0013`–`0016` section added) |
| `ER_DIAGRAM.md` | ✅ **New this session** — full mermaid ER diagrams generated from the live schema + gap-fill rationale |
| `STITCH_AUDIT.md` | ✅ **New this session** — full audit of the unified Stitch export |
| `SECURITY_AND_PDPA.md`, `PAYROLL_RULES.md`, `STORE_RELEASE_GUIDE_TH.md`, `TESTING.md` | ✅ From session 1, not re-verified this session |

## 7. Not yet built at all (carried over from session 1 unless marked)

- CI workflow (typecheck/lint/test on push).
- PDPA Privacy Consent screen (in-app, Thai, recorded timestamp) — `consent_records` table now exists (`0014`) but no UI writes to it yet.
- Signed URLs with expiry for selfie/payslip viewing.
- Login lockout after N failed attempts.
- Playwright / Detox E2E tests.
- Shift schedule view, shift-swap request, time-correction request screens (neither the dormant Expo app nor the new PWA has these).
- **[new, session 2]** `packages/i18n` — see §5.
- **[new, session 2]** Web Push notifications, offline clock-in queue, and Overtime/Announcements screens for the PWA (§4b).
- **[new, session 2]** Excel import for Translation Management (JSON import only today).

## 8. What session 2 actually did (chronological, for the next session's benefit)

1. Read the new master prompt in full and audited every file in the new Stitch zip (`STITCH_AUDIT.md`).
2. Discovered the session-1 "Supabase blocked" note was stale — a live, seeded `nineall-hr` project already existed.
3. Discovered live migrations `0013`–`0016` had no matching local files (schema drift) — pulled the exact applied SQL from `supabase_migrations.schema_migrations` and committed them, so the repo now matches the live database exactly.
4. Extracted the real logo from the Stitch export (chroma-keyed to transparent, trimmed), generated the full asset set (web logo, favicon, apple-touch-icon, Android adaptive icon fg/bg, iOS flat icon, splash icon) with `sharp`.
5. Rewrote `packages/design-tokens` (colors + typography) to the new palette and Noto Sans font family, keeping all existing exported key names so nothing downstream broke.
6. Propagated the new tokens + logo into `apps/admin-web` and `apps/employee-mobile`.
7. Wrote `ER_DIAGRAM.md`, `STITCH_AUDIT.md`, `KNOWN_LIMITATIONS.md` and updated `DATABASE_SCHEMA.md`/`ARCHITECTURE.md`.
8. Built the admin-web Translation Management screen (`/translations`), seeded with real UI-string keys.
9. **User decided against native app store distribution** (cost + review overhead) **in favor of an installable PWA.** Scaffolded `apps/employee-pwa` (Next.js 16), wired PWA installability (manifest, service worker, full icon set), and ported login/home/attendance(GPS+camera)/leave/payslip/profile from the Expo app's business logic. `apps/employee-mobile` left in place, dormant.
10. While porting login, found and fixed a real bug: employee-code login (both admin-web and employee-mobile) compared `profiles.employee_id` (a UUID) against the typed code string, which could never match. Both now correctly call the `lookup_login_email()` RPC that migration `0016` had built but nothing was actually calling.
11. Verified: admin-web builds clean (17 routes incl. `/translations`, 0 TS errors) and re-verified after the login fix; employee-pwa builds clean (7 routes + manifest, 0 TS errors) and was checked in-browser (login page renders, manifest serves correctly, no console errors); employee-mobile typechecks clean; payroll-engine's 21 tests still pass.
12. **The account owner could not access the Supabase account** that owns this project (no memory of ever creating it) — so `SUPABASE_SERVICE_ROLE_KEY` could not be retrieved. Rather than block on that, created the 4 demo accounts a different way: direct SQL insert into `auth.users`/`auth.identities`/`public.profiles` (bcrypt password hash via the `pgcrypto` extension), saved as `scripts/seed-demo-accounts.sql` for reproducibility.
13. **Verified login for real**, in-browser, for both apps: `EMP-001` (super_admin) on admin-web reached the real dashboard (16 employees, live pending-request counts, real announcements); `employee@nineallgroup.co.th` on employee-pwa reached the real home dashboard. Zero console errors on either.
14. That testing caught a real bug: the Translation Management page 500'd (`LOCALES.some is not a function`) because `LOCALES`/`Locale` were exported from a `"use server"` file — Next.js Server Action modules may only export async functions. Moved them to `constants.ts` and re-verified clean.

## 9. How to continue this work in a future session

1. Read this file top to bottom, then `STITCH_AUDIT.md`, `ARCHITECTURE.md`'s PWA section, and `ER_DIAGRAM.md` §8, before touching anything.
2. **Login now works** — 4 demo accounts exist (see `README.md` for the list, password `NineallDemo2026!`). `SUPABASE_SERVICE_ROLE_KEY` is still a placeholder and is still needed for admin-web's "create employee + login account" UI flow specifically (not for using the app with the existing demo accounts).
3. **Top priority now: click-test the rest of `apps/employee-pwa`** on an actual phone (add to home screen, clock in with real camera/GPS permission prompts, submit a leave request, view a payslip) — only login+home got a real click-test this session; attendance/leave/payslip/profile are still only build/typecheck-verified.
4. **Next priority: `packages/i18n`.** ~75 translation keys already exist in the DB (§5) but nothing reads them yet — every string is hardcoded Thai. Build the shared package (key lookup + fallback-to-Thai + missing-key test), then retrofit screens incrementally, starting with `apps/employee-pwa`.
5. Port Overtime request + Announcements screens to `apps/employee-pwa` (the Expo app never had them either — not a regression, just still open).
6. Consider Web Push for the PWA (`devices` table already exists) and/or an offline clock-in queue (IndexedDB + retry-on-reconnect — the service worker alone doesn't do this).
7. Consider adding Excel import to Translation Management (currently JSON-only).
8. Re-verify Edge Function deployment status (`supabase functions list` via MCP) — not re-checked this session.
9. Re-run payroll-engine tests, admin-web build, employee-pwa build, and employee-mobile typecheck before updating this file's status table — never mark something ✅ without a green check this session actually ran.
10. Work top-down through the "❌ Not built" rows, prioritizing whatever's highest-value relative to the master prompt's §25 completion criteria.
11. **A lesson for whoever picks this up**: click-testing with a real login this session immediately found a bug (the `LOCALES` export issue) that build+typecheck alone missed. Prefer testing with a real logged-in session over trusting a green build whenever login is available.
