import type { SupabaseClient } from "@supabase/supabase-js";
import { getOtCutoffWindow } from "@/lib/otCutoff";

// Owner rule (2026-10-05), switched on per employee through
// employees.late_deduct_from_prev_ot_since (Kanin, 90031): lateness that was not made up
// comes off the OT of the cycle that has just closed — the one being paid now — instead of
// waiting for the cycle the lateness fell in.
//
// For the payroll of cutoff cycle `monthKey` (e.g. "2026-09" = 26 Aug – 25 Sep) the late
// minutes counted are:
//   * the first run under the rule  -> everything from the start of that cycle up to today
//   * every later run               -> everything after the previous run was calculated, up to
//                                      today
// so a late day is taken exactly once, by whichever run reaches it first, and then stays
// out of the following run.

const bangkokDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);

export async function lateMinutesFromPrevCycleRule(
  supabase: SupabaseClient,
  opts: {
    orgId: string;
    employeeId: string;
    since: string; // employees.late_deduct_from_prev_ot_since (an OT-window start date)
    monthKey: string; // cutoff cycle being paid / shown
    // For the OT page, which may show old cycles: stop at the day that cycle's own run was
    // calculated, so past cycles don't absorb lateness from today. Payroll itself leaves
    // this off because a recalculation must see everything up to today.
    capToOwnRun?: boolean;
  }
): Promise<number> {
  const { orgId, employeeId, since, monthKey, capToOwnRun } = opts;
  const window = getOtCutoffWindow(monthKey);
  const periodStart = `${monthKey}-01`;
  const today = bangkokDate(new Date());

  // The run before this cycle's, if any: its calculation date is where the previous
  // deduction stopped.
  const { data: prevPeriod } = await supabase
    .from("payroll_periods")
    .select("id, period_start")
    .eq("org_id", orgId)
    .lt("period_end", periodStart)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  let lowerExclusive: string | null = null;
  if (prevPeriod) {
    const prevWindowStart = getOtCutoffWindow(String(prevPeriod.period_start).slice(0, 7)).start;
    if (prevWindowStart >= since) {
      const { data: prevRun } = await supabase
        .from("payroll_runs")
        .select("calculated_at")
        .eq("payroll_period_id", prevPeriod.id)
        .not("calculated_at", "is", null)
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prevRun?.calculated_at) lowerExclusive = bangkokDate(new Date(prevRun.calculated_at));
    }
  }

  let upperInclusive = today;
  if (capToOwnRun) {
    const { data: ownPeriod } = await supabase
      .from("payroll_periods")
      .select("id")
      .eq("org_id", orgId)
      .eq("period_start", periodStart)
      .limit(1)
      .maybeSingle();
    if (ownPeriod) {
      const { data: ownRun } = await supabase
        .from("payroll_runs")
        .select("calculated_at")
        .eq("payroll_period_id", ownPeriod.id)
        .not("calculated_at", "is", null)
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ownRun?.calculated_at) {
        const d = bangkokDate(new Date(ownRun.calculated_at));
        if (d < upperInclusive) upperInclusive = d;
      }
    }
  }

  let q = supabase
    .from("attendance_records")
    .select("late_minutes")
    .eq("employee_id", employeeId)
    .eq("status", "late")
    .gt("late_minutes", 0)
    .lte("work_date", upperInclusive);
  q = lowerExclusive ? q.gt("work_date", lowerExclusive) : q.gte("work_date", window.start);
  const { data } = await q;
  return (data ?? []).reduce((sum, r) => sum + (r.late_minutes ?? 0), 0);
}
