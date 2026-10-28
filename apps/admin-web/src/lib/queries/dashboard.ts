import { createClient } from "@/lib/supabase/server";

export interface DashboardStats {
  totalEmployees: number;
  presentToday: number;
  onLeaveToday: number;
  lateToday: number;
  absentToday: number;
  notClockedOutToday: number;
  pendingLeave: number;
  pendingOvertime: number;
  pendingTimeCorrection: number;
  announcements: { id: string; title: string; publishAt: string; createdBy: string | null }[];
}

export async function getDashboardStats(orgId: string): Promise<DashboardStats> {
  const supabase = await createClient();
  // Bangkok date (the UTC date is a day behind before 07:00).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

  const [
    employeesRes,
    attendanceTodayRes,
    pendingLeaveRes,
    pendingOtRes,
    pendingCorrectionRes,
    announcementsRes,
  ] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null).eq("employment_status", "active"),
    supabase.from("attendance_records").select("employee_id, status, clock_out_server_at, employees(hide_late_status)").eq("org_id", orgId).eq("work_date", today),
    // Only requests whose turn it is for HR — ones still waiting on a หัวหน้า aren't actionable here yet.
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "pending").eq("approval_stage", "hr"),
    supabase.from("overtime_requests").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "pending"),
    supabase.from("time_correction_requests").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "pending"),
    supabase
      .from("announcements")
      .select("id, title, publish_at, created_by")
      .eq("org_id", orgId)
      .eq("status", "published")
      .order("publish_at", { ascending: false })
      .limit(5),
  ]);

  const attendanceRows = attendanceTodayRes.data ?? [];
  const presentToday = attendanceRows.filter((r) => ["on_time", "late", "early_leave", "work_from_home", "off_site"].includes(r.status)).length;
  // Late days that OT has already covered (HR and Content staff on that rule) are not counted as late.
  const coveredLate = new Set<string>();
  await Promise.all(
    attendanceRows
      .filter((r) => r.status === "late" && (r.employees as unknown as { hide_late_status: boolean | null } | null)?.hide_late_status)
      .map(async (r) => {
        const { data: dates } = await supabase.rpc("late_covered_dates", { p_employee_id: r.employee_id, p_from: today, p_to: today });
        if ((dates ?? []).length > 0) coveredLate.add(r.employee_id);
      })
  );
  const lateToday = attendanceRows.filter((r) => r.status === "late" && !coveredLate.has(r.employee_id)).length;
  const onLeaveToday = attendanceRows.filter((r) => r.status === "leave").length;
  const absentToday = attendanceRows.filter((r) => r.status === "absent").length;
  const notClockedOutToday = attendanceRows.filter((r) => !r.clock_out_server_at && r.status !== "absent" && r.status !== "leave").length;

  return {
    totalEmployees: employeesRes.count ?? 0,
    presentToday,
    onLeaveToday,
    lateToday,
    absentToday,
    notClockedOutToday,
    pendingLeave: pendingLeaveRes.count ?? 0,
    pendingOvertime: pendingOtRes.count ?? 0,
    pendingTimeCorrection: pendingCorrectionRes.count ?? 0,
    announcements: (announcementsRes.data ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      publishAt: a.publish_at,
      createdBy: a.created_by,
    })),
  };
}
