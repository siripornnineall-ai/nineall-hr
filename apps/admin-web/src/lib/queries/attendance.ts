import { createClient } from "@/lib/supabase/server";

export interface AttendanceRow {
  id: string;
  workDate: string;
  employeeCode: string;
  employeeName: string;
  clockIn: string | null;
  clockOut: string | null;
  status: string;
  lateMinutes: number;
  otMinutes: number;
  withinGeofence: boolean | null;
  selfiePath: string | null;
  needsReview: boolean;
  shiftId: string | null;
  workLocationId: string | null;
}

export async function listAttendanceForDate(orgId: string, workDate: string) {
  const supabase = await createClient();
  const query = supabase
    .from("attendance_records")
    .select(
      "id, work_date, clock_in_server_at, clock_out_server_at, status, late_minutes, ot_minutes, clock_in_within_geofence, clock_in_selfie_path, needs_review, shift_id, work_location_id, employees(employee_code, first_name, last_name, manager_employee_id)"
    )
    .eq("org_id", orgId)
    .eq("work_date", workDate)
    .order("clock_in_server_at", { ascending: true });

  const { data, error } = await query;
  if (error) throw error;

  const rows: AttendanceRow[] = (data ?? []).map((r) => {
    const emp = r.employees as unknown as { employee_code: string; first_name: string; last_name: string; manager_employee_id: string | null };
    return {
      id: r.id,
      workDate: r.work_date,
      employeeCode: emp?.employee_code ?? "-",
      employeeName: emp ? `${emp.first_name} ${emp.last_name}` : "-",
      clockIn: r.clock_in_server_at,
      clockOut: r.clock_out_server_at,
      status: r.status,
      lateMinutes: r.late_minutes,
      otMinutes: r.ot_minutes,
      withinGeofence: r.clock_in_within_geofence,
      selfiePath: r.clock_in_selfie_path,
      needsReview: r.needs_review,
      shiftId: r.shift_id,
      workLocationId: r.work_location_id,
    };
  });

  return rows;
}
