# Architecture — Nineall HR

## Overview

Nineall HR is a monorepo containing two web apps, one dormant mobile app,
and a set of shared packages, all backed by a single Supabase project
(Postgres + Auth + Storage + Edge Functions). Nothing talks to anything else
directly — every app reads/writes the same Postgres database through
Supabase, scoped by Row Level Security (RLS), so data is always consistent
between them.

**Session 2 decision (2026-08-05): employees use an installable PWA, not a
native app.** The account owner weighed native Android/iOS (Google Play $25
one-time + Apple Developer Program $99/year, plus store review overhead)
against a Progressive Web App (installable via "Add to Home Screen", no
store fees or review, one Next.js codebase) and chose the PWA. `apps/
employee-mobile` (the Expo app built in session 1) is left in place, not
deleted, in case native is revisited later — but `apps/employee-pwa` is now
the actively developed employee-facing app. See `STITCH_AUDIT.md` and
`IMPLEMENTATION_STATUS.md` §10 for what was ported and what wasn't yet.

```text
nineall-hr/
  apps/
    admin-web/          Next.js 16 (App Router) — Super Admin / HR / Manager / Payroll Admin
    employee-pwa/        Next.js 16, installable PWA — Employee app (web-based, session 2+)
    employee-mobile/     Expo (React Native) — dormant since session 2, not deleted
  packages/
    design-tokens/       Colors, typography, spacing extracted from Stitch DESIGN.md
    shared-types/        TypeScript interfaces mirroring the DB schema
    shared-validation/    Zod schemas used by both apps for form + payload validation
    payroll-engine/       Pure TS: attendance time-rules + payroll calculation (tested)
  supabase/
    migrations/           SQL schema, RLS policies, triggers (source of truth)
    seed/                 Idempotent demo data
    functions/            Edge Functions (clock-in, clock-out)
  scripts/                One-off admin scripts (demo account creation)
  docs/                   (this file and friends)
```

## Why this stack

- **Next.js 16 + Supabase SSR** for admin-web, matching the pattern already used
  by this workspace's other apps (`issa-inventory-app`): server components read
  data directly via a server-side Supabase client, mutations go through Server
  Actions, and `middleware.ts` refreshes the session cookie on every request.
- **Expo + expo-router** for the mobile app so a single TypeScript codebase
  ships to both Android and iOS. Native modules (`expo-camera`, `expo-location`,
  `expo-notifications`) are the officially supported way to reach
  camera/GPS/push without ejecting from the managed workflow. **Dormant since
  session 2** — see the PWA decision above.
- **Next.js 16 PWA (`apps/employee-pwa`)** for the employee app, chosen over
  continuing native in session 2. Same web-standard APIs as any browser
  app — `getUserMedia` for a live front-camera preview (frame captured to a
  `<canvas>` → JPEG blob, never a file picker, so it satisfies the same
  "must be a fresh photo, not from gallery" rule as the native app),
  `navigator.geolocation` for GPS, a hand-written service worker (`public/
  sw.js`) for installability + an offline fallback page. It calls the
  **same** `clock-in`/`clock-out` Edge Functions with the same payload shape
  the Expo app used — none of the server-side attendance logic changed.
- **Supabase** (Postgres, Auth, Storage, Edge Functions) as the one backend, so
  every app sees identical, real-time-consistent data with no separate sync layer.

### PWA vs. native — what's actually different

| Capability | Native (Expo, dormant) | PWA (`employee-pwa`, active) |
|---|---|---|
| Distribution | Google Play / App Store review + fees | Install via browser "Add to Home Screen", no review, no fee |
| Camera (selfie) | `expo-camera`, native permission prompt | `getUserMedia`, browser permission prompt — works the same in practice |
| GPS | `expo-location` | `navigator.geolocation` — works the same in practice |
| Push notifications | `expo-notifications`, reliable on both platforms | Web Push works on Android Chrome; iOS Safari only supports it 16.4+ **and only after the user has added the PWA to their home screen** — not built yet either way, see `KNOWN_LIMITATIONS.md` |
| Biometric login | `expo-local-authentication` | Not available to web apps at all — payslip PIN-gate will have to be a PIN, not biometric, on the PWA |
| Offline clock-in queue | Not built (either version) | Not built (either version) — the PWA's service worker only caches the app shell so it *opens* offline; it does not queue a failed clock-in for later retry |

## Where business logic actually runs

The master prompt's hard rule is: **critical calculations must run on the
server, never trust the phone.** Concretely:

| Concern | Runs where | Why |
|---|---|---|
| Attendance status (on-time/late/OT), GPS geofence check | `supabase/functions/clock-in`, `clock-out` (Edge Functions, Deno) | The phone submits raw GPS + selfie evidence only; the server decides the outcome. |
| Leave balance validation, balance reservation/release | Postgres trigger (`validate_and_reserve_leave_balance`, `apply_leave_decision` in `0010_triggers.sql`) | Runs no matter which client (web or mobile) inserts the row — can't be bypassed. |
| Payroll calculation (time rules, tax, social security, OT pay) | `packages/payroll-engine` (pure TS), invoked from admin-web Server Actions using the service-role Supabase client | Deterministic, unit-tested, never exposed to the browser. |
| Locking a payroll run | Postgres trigger `block_locked_payroll_edit` | Even a direct SQL/API call can't silently edit a locked calculation. |
| Row-level access ("employee A can't see employee B's payslip") | Postgres RLS policies (`0009_rls_policies.sql`) | Enforced at the database, not just hidden in the UI. |

## Data flow: clock-in (acceptance test #1)

1. Employee opens the PWA (installed to their home screen or in a browser
   tab) → Attendance tab → grants camera + location permission (asked
   in-context via the browser's native permission prompt, not at first
   launch).
2. App gets one-shot GPS position + takes a selfie, uploads the selfie to the
   private `selfies` Storage bucket at `{org_id}/{employee_id}/{timestamp}.jpg`.
3. App calls the `clock-in` Edge Function with the raw evidence (lat/lng,
   accuracy, selfie path, device timestamp) — it does **not** send a computed
   status.
4. The Edge Function: resolves the caller's `employee_id` from their JWT,
   looks up today's shift + work location, computes distance via a haversine
   function, decides `on_time`/`late`/etc., and upserts `attendance_records`.
5. Admin-web's Attendance page reads the same table via RLS-scoped queries —
   HR/Manager see the row (with selfie + GPS) within their permission scope.

## Payroll flow (acceptance test #4)

`payroll_periods` → `payroll_runs` (draft) → **Calculate** (Server Action calls
`payroll-engine` per employee, using attendance + approved leave + approved OT
+ effective-dated `employee_compensation` + effective-dated `policy_settings`)
→ writes `payroll_employee_calculations` + `payroll_earning_items` /
`payroll_deduction_items` (a full breakdown, not just a number) → **Submit**
(blocked if any calculation `has_anomaly`) → **Approve** → **Lock** (triggers
payslip rows; further edits require a `payroll_adjustments` row, never a direct
UPDATE — enforced by trigger).

## Session 2 note: design refresh + `packages/i18n` gap

Session 2 (2026-08-05) re-skinned both apps against a newer Stitch export
(`stitch_nineall_hr_unified_management_system.zip` — terracotta/deep-teal,
see `STITCH_AUDIT.md`) and added a Translation Management module. The
monorepo layout above does **not** yet have the `packages/i18n` the master
prompt's recommended structure calls for — no screen in either app
currently reads strings from a translation table; all UI text is still
hardcoded Thai/English inline. `translation_keys` / `translations` /
`translation_history` (added in `0014`, see `ER_DIAGRAM.md` §8) back the new
Translation Management *admin tool* only — building `packages/i18n` and
retrofitting every screen to consume it is tracked as not-yet-done in
`IMPLEMENTATION_STATUS.md`, not silently assumed solved by that table
existing.

## Known trade-offs (see `IMPLEMENTATION_STATUS.md` for the full list)

- The `employee-mobile` app currently writes leave/OT/time-correction requests
  directly to Postgres via RLS-scoped inserts (a Postgres trigger validates and
  reserves leave balance). Attendance clock-in/out is the one flow that goes
  through an Edge Function, because it's the flow with the strongest
  server-trust requirement. Moving the others behind Edge Functions too is a
  reasonable hardening step for production but wasn't required to satisfy RLS
  or the balance-validation trigger.
- Offline queueing for clock-in (spec section 8.2) is designed for in the
  schema (`is_offline_submission`, `needs_review`) but the mobile client does
  not yet implement a local queue + background retry — see
  `IMPLEMENTATION_STATUS.md`.
