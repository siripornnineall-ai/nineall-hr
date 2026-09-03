"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function addTeamMemberAction(outputTeamId: string, employeeId: string, isLead: boolean): Promise<{ error?: string }> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  if (!employeeId) return { error: "กรุณาเลือกพนักงาน" };

  const supabase = await createClient();
  const { error } = await supabase.from("output_team_members").insert({
    output_team_id: outputTeamId,
    employee_id: employeeId,
    is_lead: isLead,
  });
  if (error) return { error: error.message.includes("duplicate") ? "พนักงานคนนี้อยู่ในทีมนี้แล้ว" : error.message };

  revalidatePath("/performance-teams");
  return {};
}

export async function removeTeamMemberAction(memberId: string): Promise<void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  const supabase = await createClient();
  await supabase.from("output_team_members").delete().eq("id", memberId);
  revalidatePath("/performance-teams");
}

export async function setTeamLeadAction(memberId: string, isLead: boolean): Promise<void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  const supabase = await createClient();
  await supabase.from("output_team_members").update({ is_lead: isLead }).eq("id", memberId);
  revalidatePath("/performance-teams");
}

export async function setManagedPagesAction(memberId: string, pages: string[]): Promise<void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  const supabase = await createClient();
  await supabase
    .from("output_team_members")
    .update({ managed_pages: pages.length > 0 ? pages : null })
    .eq("id", memberId);
  revalidatePath("/performance-teams");
}
