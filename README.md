# Nineall HR

A real (not a mockup) employee management system for **บริษัท ไนน์ออล กรุ๊ป
จำกัด**: an admin web app, an Android/iOS employee app, and a shared Supabase
backend — built to the visual design in `stitch_issa_hr_management_system/`.

Non-technical owner? Read **`README_FOR_OWNER_TH.md`** instead.

Current build status, what's done, and what's left: **`IMPLEMENTATION_STATUS.md`**.

## Monorepo layout

See `ARCHITECTURE.md` for the full picture. Quick map:

```text
apps/admin-web/        Next.js 16 — Super Admin / HR / Manager web app
apps/employee-mobile/   Expo — employee app (Android + iOS)
packages/design-tokens/ Colors/type/spacing from the Stitch design system
packages/shared-types/  TS types mirroring the DB schema
packages/shared-validation/ Zod schemas shared by both apps
packages/payroll-engine/ Attendance + payroll calculation (unit tested)
supabase/migrations/    Full DB schema + RLS + triggers
supabase/seed/          Demo data (org, employees, attendance, leave, OT)
supabase/functions/     Edge Functions (clock-in, clock-out)
scripts/                seed-demo-accounts.mjs
```

## Prerequisites

- Node.js 20+ and npm
- A Supabase project (free tier is enough for development)
- For mobile builds: an Expo account (`eas login`), and later Apple/Google
  developer accounts for store release (`STORE_RELEASE_GUIDE_TH.md`)

## 1. Install dependencies

```bash
npm install
```

## 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `apps/admin-web/.env.local` and
   `apps/employee-mobile/.env`, fill in your project's URL + anon key +
   service role key (Project Settings → API).
3. Apply the schema, in order:
   ```bash
   # via the Supabase CLI, from the repo root
   supabase link --project-ref <your-project-ref>
   supabase db push          # runs everything in supabase/migrations/
   ```
   (Or apply each file in `supabase/migrations/` in numeric order through the
   SQL editor / Supabase MCP `apply_migration`.)
4. Load demo data: run every file in `supabase/seed/` in order (same SQL
   editor / CLI), then:
   ```bash
   npm run seed:accounts
   ```
   This creates the 4 demo logins listed below.
5. Deploy the two Edge Functions:
   ```bash
   supabase functions deploy clock-in
   supabase functions deploy clock-out
   ```

## 3. Run the admin website

```bash
npm run dev:admin
# http://localhost:3000
```

## 4. Run the employee mobile app

```bash
npm run dev:mobile
# scan the QR code with Expo Go, or press "a" / "i" for an emulator
```

## Demo accounts (after `npm run seed:accounts`)

| Role | Email | Password |
|---|---|---|
| Super Admin | admin@nineallgroup.co.th | `NineallDemo2026!` |
| HR | hr@nineallgroup.co.th | `NineallDemo2026!` |
| Manager | manager@nineallgroup.co.th | `NineallDemo2026!` |
| Employee | employee@nineallgroup.co.th | `NineallDemo2026!` |

Every demo account is forced to change its password on first login
(`must_change_password = true`). **Never reuse this password in production.**

## Tests

```bash
npm run test          # payroll-engine + shared-validation (30 tests)
npm run build:admin   # Next.js production build
npm run typecheck --workspace=apps/employee-mobile
```

See `TESTING.md` for what's covered and what isn't yet.

## Other docs

- `ARCHITECTURE.md` — how the pieces fit together, where each rule is enforced
- `DATABASE_SCHEMA.md` — table-by-table guide
- `SECURITY_AND_PDPA.md` — auth, RLS, data protection, what's still open
- `PAYROLL_RULES.md` — calculation formulas, and the placeholder tax/SS rates
  that need accountant sign-off
- `STORE_RELEASE_GUIDE_TH.md` — Google Play / App Store release checklist (TH)
- `IMPLEMENTATION_STATUS.md` — module-by-module status, updated as work lands
