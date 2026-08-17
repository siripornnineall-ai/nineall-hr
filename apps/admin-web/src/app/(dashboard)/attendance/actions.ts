"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function updateAttendanceTimeAction(
  recordId: string,
  workDate: string,
  values: { clockIn?: string; clockOut?: string }
): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  const update: Record<string, string | null> = {};
  if (values.clockIn) update.clock_in_server_at = new Date(`${workDate}T${values.clockIn}:00`).toISOString();
  if (values.clockOut) update.clock_out_server_at = new Date(`${workDate}T${values.clockOut}:00`).toISOString();

  if (Object.keys(update).length === 0) return { error: "กรุณาระบุเวลาอย่างน้อยหนึ่งช่อง" };

  const supabase = await createClient();
  const { error } = await supabase.from("attendance_records").update(update).eq("id", recordId).eq("org_id", user.orgId);
  if (error) return { error: error.message };

  revalidatePath("/attendance");
}
