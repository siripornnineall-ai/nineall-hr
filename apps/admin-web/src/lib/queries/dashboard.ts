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
  const today = new Date().toISOString().slice(0, 10);

  const [
    employeesRes,
    attendanceTodayRes,
    pendingLeaveRes,
    pendingOtRes,
    pendingCorrectionRes,
    announcementsRes,
  ] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("employment_status", "active"),
    supabase.from("attendance_records").select("status, clock_out_server_at").eq("org_id", orgId).eq("work_date", today),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "pending"),
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
  const lateToday = attendanceRows.filter((r) => r.status === "late").length;
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
