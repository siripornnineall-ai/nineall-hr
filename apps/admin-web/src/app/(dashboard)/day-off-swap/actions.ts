"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function decideDayOffSwapRequest(requestId: string, decision: "approved" | "rejected") {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("day_off_swap_requests")
    .select("org_id, employee_id, original_date, substitute_date")
    .eq("id", requestId)
    .eq("org_id", user.orgId)
    .single();
  if (!request) throw new Error("ไม่พบคำขอนี้");

  const { error } = await supabase
    .from("day_off_swap_requests")
    .update({ status: decision, decided_at: new Date().toISOString(), decided_by: user.employeeId })
    .eq("id", requestId)
    .eq("org_id", user.orgId);
  if (error) throw new Error(error.message);

  if (decision === "approved") {
    // The employee's normal shift — most recent shift_assignment row that actually has one —
    // is what they'll work on the original day-off date instead of having it off.
    const { data: defaultAssignment } = await supabase
      .from("shift_assignments")
      .select("shift_id, work_location_id")
      .eq("employee_id", request.employee_id)
      .not("shift_id", "is", null)
      .order("work_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    await supabase.from("shift_assignments").upsert(
      {
        org_id: request.org_id,
        employee_id: request.employee_id,
        work_date: request.original_date,
        shift_id: defaultAssignment?.shift_id ?? null,
        work_location_id: defaultAssignment?.work_location_id ?? null,
        is_day_off: false,
        source: "day_off_swap",
      },
      { onConflict: "employee_id,work_date" }
    );

    await supabase.from("shift_assignments").upsert(
      {
        org_id: request.org_id,
        employee_id: request.employee_id,
        work_date: request.substitute_date,
        shift_id: null,
        work_location_id: null,
        is_day_off: true,
        source: "day_off_swap",
      },
      { onConflict: "employee_id,work_date" }
    );
  }

  revalidatePath("/day-off-swap");
  revalidatePath("/attendance");
}
