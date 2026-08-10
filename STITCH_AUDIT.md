# Stitch Audit — `stitch_nineall_hr_unified_management_system.zip`

Reviewed in full on 2026-08-05 (session 2), file by file, before touching any
code. This supersedes the session-1 audit that was done informally against
`stitch_issa_hr_management_system.zip` (recorded in the old
`IMPLEMENTATION_STATUS.md` §0) — that was a **different, earlier** Stitch
export with a red/cream brand. This zip is the current design source of
truth per the new master prompt
(`Claude_Master_Prompt_Nineall_HR_Web_Android_iOS.md`).

## 1. Contents of the zip

| Folder | What it is | `screen.png` | `code.html` |
|---|---|---|---|
| `nineall_hr_logo` | Brand mark: terracotta/deep-teal "N+person" monogram + "Nineall HR" wordmark | ✅ | — |
| `nineall_hr/DESIGN.md` | Full M3-style design-token export (colors, type scale, radii, spacing, elevation, component rules) | — | — |
| `login_nineall_hr` | Web/admin login screen | ✅ | ✅ |
| `admin_dashboard_nineall_hr` | Admin-web dashboard (desktop sidebar + mobile bottom nav variant in the same file) | ✅ | ✅ |
| `translation_management_nineall_hr` | **New module**: admin-web language/translation management grid | ✅ | ✅ |
| `dashboard_thai_nineall_hr` | Employee **mobile app** home dashboard, Thai strings | ✅ | ✅ |
| `dashboard_english_nineall_hr` | Same mobile dashboard, English strings | ✅ | ✅ |
| `dashboard_lao_nineall_hr` | Same mobile dashboard, Lao strings (`ພາສາລາວ`) | ✅ | ✅ |
| `dashboard_burmese_nineall_hr` | Same mobile dashboard, Burmese strings (`မြန်မာဘာသာ`) | ✅ | ✅ |

7 screens total (1 web login, 1 web admin dashboard, 1 web translation
manager, 4 localized copies of one mobile dashboard) + the logo + `DESIGN.md`.
All were opened and read; no screen was skipped.

The 4 localized dashboard files are the **same layout** (stat cards for
today's status, hours worked, leave balance; check-in/check-out/break
buttons; bottom nav Home/Time/Leave/Salary/Profile) with only the strings
translated — they exist to prove the layout survives long Lao/Burmese
strings, not to define 4 different screens. This matches what
`apps/employee-mobile/app/(tabs)/index.tsx` already implements structurally;
the delta is purely visual (see §3) plus actually wiring translated strings
per user, which is not done yet (see `IMPLEMENTATION_STATUS.md`).

## 2. Design tokens extracted

Full token block lives in `nineall_hr/DESIGN.md` (M3-style: `surface*`,
`on-*`, `primary/secondary/tertiary` + containers + fixed variants). Key
values, now applied in `packages/design-tokens`:

- **Primary (Terracotta):** `#c54b38` (buttons, active nav, primary toggles), darker `#a83e30` for hover/pressed/containers.
- **Secondary (Deep Teal):** `#003942` (sidebar background, nav headers, headline text authority color).
- **Tertiary (Teal-green accent):** `#106752` (e.g. "checked-in" stat card accent).
- **Backgrounds:** page canvas `#f8f7f8`, cards `#ffffff` with `0 4px 20px rgba(0,0,0,0.05)` shadow, overlays `0 10px 30px rgba(0,0,0,0.12)`.
- **Text:** main `#263638`, secondary `#6f7778`.
- **Dividers/borders:** `#e5e1e6`, 1px solid.
- **Radii:** cards 16px, buttons/inputs 12px, chips 8px or pill.
- **Status colors** (master prompt §4, not in `DESIGN.md`'s M3 block, layered on top): success `#2f7d67`, warning `#d89b3c`, danger `#b33a3a`, info `#3f7ca6`, holiday `#80639b`, inactive `#8a8a8a`.
- **Type:** Noto Sans (Latin) + Noto Sans Thai/Lao/Myanmar, 1.6x line-height on body text specifically to stop tone marks/tall glyphs clipping in TH/LO/MY.

### Design-token reconciliation (documented per master prompt's own rule of writing decisions down instead of guessing silently)

`DESIGN.md`'s raw M3 export and the master prompt's §4 prose **disagree in
two places**:

1. `DESIGN.md`'s `secondary` token is `#37656f` (a lighter teal), but its own
   "Usage Guidelines" prose and the master prompt both say sidebars/headers
   use **Deep Teal `#003942`** — and `translation_management_nineall_hr`'s
   buttons hardcode `border-[#003942]` directly rather than using the
   `secondary` Tailwind token. **Decision: `#003942` wins** as the `secondary`
   token (it's what's actually rendered for sidebars in the reference
   screenshots); `#37656f` is kept as `secondaryContainer` for lighter
   teal accents (e.g. avatar badges).
2. `DESIGN.md`'s `primary` token is `#a43323`, but master prompt §4 states
   Primary Terracotta is `#C54B38` with hover/darker `#A83E30`. **Decision:
   `#c54b38` wins** as `primary` (matches the actual login submit button in
   the reference screenshot, which uses `primary-container` = `#c54b38`,
   not `primary` = `#a43323`); `#a83e30` (master prompt's exact hover value) is used for `primaryContainer`/hover/pressed states.

Both decisions are encoded directly in `packages/design-tokens/src/colors.ts`
— see the comment at the top of that file.

## 3. Reused vs. net-new relative to the existing build

The `nineall-hr` monorepo (Next.js admin-web + Expo employee-mobile +
Supabase, ~52 tables, seeded) already existed before this session, built
against the **older** `stitch_issa_hr_management_system.zip` (red/cream,
Sarabun/Inter fonts, `com.nineall.hr` bundle id). This audit's job was to
determine what changes when the newer zip becomes the design source of
truth:

| Area | Action taken this session |
|---|---|
| Colors (web + mobile) | Replaced red/cream palette with terracotta/deep-teal in `packages/design-tokens` and `apps/admin-web/src/app/globals.css` |
| Fonts | Replaced Inter/Sarabun with Noto Sans + Noto Sans Thai/Lao/Myanmar in both apps |
| Logo | Extracted from `nineall_hr_logo/screen.png` (chroma-keyed to transparent, trimmed), replacing placeholder "N" boxes in admin-web `Sidebar`/login page and mobile login screen; regenerated app icon / adaptive icon / splash / favicon sets |
| Bundle IDs | `com.nineall.hr` → `com.nineallgroup.hr` (master prompt §22 default; safe to change, nothing has been submitted to a store yet) |
| Translation Management | **Net-new module.** DB tables (`translation_keys`, `translations`, `translation_history`) already existed from session 1's schema but had no UI — building the admin-web page from this screen now (see `IMPLEMENTATION_STATUS.md`) |
| Employee mobile dashboard | Layout already matches; only the visual re-skin (colors/fonts/logo above) was needed, not a rebuild |
| Admin dashboard, login | Layout already matches; same re-skin only |

Nothing in the previously-built module set (attendance, leave, OT, payroll,
approvals, RLS policies, Edge Functions) needed to change structurally —
this zip is a **visual refresh + one new module (translations)**, not a
different product.

## 4. Screens not covered by this zip

Per the master prompt's §17 screen inventory, most admin-web and
employee-mobile screens (attendance, leave, OT, payroll, shift, reports,
etc.) have no Stitch reference in this export — they were designed in
session 1 by extrapolating the same design system from the 7 screens that
*do* exist. That extrapolation continues to apply; only the token values
change (§2 above), not the layout patterns (sidebar nav, stat cards, status
badges, bottom nav) which are consistent across every screen in both zips.
