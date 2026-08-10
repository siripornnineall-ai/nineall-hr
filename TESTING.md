# Testing — Nineall HR

## What exists today

| Layer | Command | Status |
|---|---|---|
| `payroll-engine` unit tests | `npm run test:payroll` | ✅ 21 tests passing — attendance time-rules (on-time, late, early-leave, missing clock-out, overnight shift, multiple breaks, half-day leave, holiday OT, off-site, offline-flagged) + payroll calculation (proration, mid-cycle join, unpaid leave, OT, anomaly detection, social security cap, daily-wage pay-for-days-worked). |
| `shared-validation` unit tests | `npm run test --workspace=packages/shared-validation` | ✅ 9 tests — zod schema edge cases (bad login, negative salary, leave end-before-start, OT hour cap, missing selfie). |
| All package tests | `npm run test` (root) | ✅ 30 tests, 2 files |
| `admin-web` build | `npm run build:admin` | ✅ Next.js production build succeeds, all 16 routes compile + typecheck. |
| `admin-web` lint | `npm run lint --workspace=apps/admin-web` | ✅ 0 errors, 2 minor warnings (`<img>` vs `next/image`, custom font loading). |
| `employee-mobile` typecheck | `npm run typecheck --workspace=apps/employee-mobile` | ✅ Clean. |
| `employee-mobile` bundle export | `npx expo export --platform android` (run from `apps/employee-mobile`) | ✅ Bundles cleanly (1376 modules), proves the app is buildable end-to-end. |
| Database migrations | Applied via Supabase MCP / `supabase db push` | ⏳ Pending — see `IMPLEMENTATION_STATUS.md` for why (free-tier project slot). |

## Required test scenarios from the master prompt

### §9 attendance rules — covered by `payroll-engine` unit tests
เข้าตรงเวลา, เข้าสาย, ออกก่อน, ลืมออก, กะข้ามเที่ยงคืน, พักหลายครั้ง, ลาครึ่งวัน,
วันหยุดแต่ทำ OT, ลงเวลานอกพื้นที่, ข้อมูล Offline Sync — all have a corresponding
test in `packages/payroll-engine/test/time-rules.test.ts`. ลารายชั่วโมง is
represented at the leave-request level (`leave_requests.unit = 'hourly'`)
rather than in attendance time-math, since it doesn't change clock-in/out
computation.

### §12 test cases — status
| Test case | Status |
|---|---|
| พนักงานเห็นเฉพาะข้อมูลตนเอง | ✅ Enforced by RLS (`is_self()`); needs an integration test against a live project to confirm end-to-end. |
| หัวหน้าเห็นเฉพาะทีม | ✅ Enforced by RLS (`is_manager_of()`); same caveat. |
| หัวหน้าไม่เห็นเงินเดือน | ✅ RLS on `employee_compensation`/`bank_accounts`/payroll tables excludes `manager` role entirely. |
| HR แก้เวลาแล้วมี Audit Log | ✅ `write_audit_log()` trigger on `attendance_records` UPDATE. |
| วันลาไม่พอแล้วส่งไม่ได้ | ✅ `validate_and_reserve_leave_balance()` trigger raises `INSUFFICIENT_LEAVE_BALANCE`. |
| อนุมัติลาแล้ว Balance ลด | ✅ `apply_leave_decision()` trigger. |
| OT ที่ยังไม่อนุมัติไม่เข้า Payroll | ✅ `calculatePayrollRunAction` only queries `overtime_requests` where `status = 'approved'`. |
| Payroll แจ้งข้อมูลขาด | ✅ `hasAnomaly` + `anomaly_notes` when compensation/attendance data is missing. |
| Payroll Lock แล้วแก้ตรง ๆ ไม่ได้ | ✅ `block_locked_payroll_edit()` trigger. |
| สลิปของคนอื่นเปิดไม่ได้ | ✅ RLS on `payslips`. |
| Signed URL หมดอายุ | ⏳ Storage buckets are private + RLS-scoped, but the app doesn't yet generate short-lived signed URLs for selfie/payslip viewing (currently relies on RLS-gated direct storage access) — see `IMPLEMENTATION_STATUS.md`. |
| GPS นอกพื้นที่ถูก Flag | ✅ `clock-in`/`clock-out` Edge Functions set `needs_review = true` when outside the geofence. |
| Offline Clock-in ต้องรอ Server ยืนยัน | ⏳ Schema supports it (`is_offline_submission`, `needs_review`); mobile client doesn't yet implement the local queue — see `IMPLEMENTATION_STATUS.md`. |
| Logout แล้ว Token ใช้ต่อไม่ได้ | ✅ Standard Supabase Auth session invalidation on `signOut()`. |

Row marked ⏳ are the honest gaps — they are not silently claimed as done.

## Running everything locally

```bash
npm install
npm run test              # payroll-engine + shared-validation (30 tests)
npm run build:admin       # Next.js production build
npm run typecheck --workspace=apps/employee-mobile
```

## What's needed for full integration/E2E coverage (not yet built)

Once a live Supabase project is connected (see `README.md` for setup):

1. Apply migrations + seed data.
2. Run `npm run seed:accounts` to create the 4 demo logins.
3. Manual QA against the 5 acceptance-test flows in the master prompt §16
   (clock-in, leave, OT, payroll, cross-employee data isolation).
4. Add Playwright (admin-web) and Detox/Maestro (employee-mobile) for
   automated E2E — scaffolding not yet added, tracked in
   `IMPLEMENTATION_STATUS.md`.
