"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Dotted-line manager only — see migration 0079. Never touches manager_employee_id, so no
// approval/permission logic anywhere else in the app is affected by this.
export async function addSecondaryManagerAction(employeeId: string, managerEmployeeId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  if (employeeId === managerEmployeeId) {
    return { error: "พนักงานไม่สามารถเป็นหัวหน้าของตัวเองได้" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("employee_secondary_managers").insert({
    org_id: user.orgId,
    employee_id: employeeId,
    manager_employee_id: managerEmployeeId,
    created_by: user.profileId,
  });
  if (error) {
    return { error: error.message.includes("duplicate") ? "หัวหน้าคนนี้ถูกเพิ่มไว้แล้ว" : error.message };
  }

  revalidatePath("/org-chart");
  return {};
}

export async function removeSecondaryManagerAction(id: string): Promise<void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  const supabase = await createClient();
  await supabase.from("employee_secondary_managers").delete().eq("id", id);
  revalidatePath("/org-chart");
}
