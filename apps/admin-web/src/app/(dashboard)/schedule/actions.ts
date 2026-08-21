"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// How far ahead a saved weekly pattern gets materialized into real shift_assignments
// rows (shift_assignments is one row per employee per date, there's no separate
// "recurring template" concept) — well under the 366-day cap assignShiftAction uses.
// Re-saving later (even with the same pattern) extends the window further.
const SCHEDULE_WINDOW_DAYS = 180;

// Keyed by JS day-of-week (0=Sunday .. 6=Saturday); value is a shift id, or "" for a
// day off.
export type WeeklyPattern = Record<number, string>;

export async function assignWeeklyScheduleAction(employeeId: string, pattern: WeeklyPattern): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { data: employee } = await supabase.from("employees").select("org_id").eq("id", employeeId).eq("org_id", user.orgId).single();
  if (!employee) return { error: "ไม่พบพนักงาน" };

  // Dates are built and read back purely in UTC (Date.UTC / getUTCDay) so the
  // day-of-week mapping can't drift depending on the server's local timezone —
  // work_date is a plain calendar date, not a timestamp.
  const todayUtc = new Date();
  const startUtcMs = Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate());
  const rows = [];
  for (let i = 0; i < SCHEDULE_WINDOW_DAYS; i++) {
    const d = new Date(startUtcMs + i * 86400000);
    const dayOfWeek = d.getUTCDay();
    const shiftId = pattern[dayOfWeek] || null;
    rows.push({
      org_id: employee.org_id,
      employee_id: employeeId,
      work_date: d.toISOString().slice(0, 10),
      shift_id: shiftId,
      is_day_off: !shiftId,
      source: "manual",
      created_by: user.profileId,
    });
  }

  const { error } = await supabase.from("shift_assignments").upsert(rows, { onConflict: "employee_id,work_date" });
  if (error) return { error: error.message };
  revalidatePath("/schedule");
}
