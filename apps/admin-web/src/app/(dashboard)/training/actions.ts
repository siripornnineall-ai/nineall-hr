"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createTrainingRecordAction(values: {
  employeeId: string;
  title: string;
  provider?: string;
  trainingDate: string;
  hours?: string;
  notes?: string;
}): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  if (!values.employeeId) return { error: "กรุณาเลือกพนักงาน" };
  if (!values.title.trim()) return { error: "กรุณากรอกชื่อหลักสูตร/การอบรม" };
  if (!values.trainingDate) return { error: "กรุณาระบุวันที่อบรม" };

  const { error } = await supabase.from("training_records").insert({
    org_id: user.orgId,
    employee_id: values.employeeId,
    title: values.title.trim(),
    provider: values.provider?.trim() || null,
    training_date: values.trainingDate,
    hours: values.hours ? Number(values.hours) : null,
    notes: values.notes?.trim() || null,
    created_by: user.profileId,
  });
  if (error) return { error: error.message };

  revalidatePath("/training");
}

export async function deleteTrainingRecordAction(recordId: string): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { error } = await supabase.from("training_records").delete().eq("id", recordId).eq("org_id", user.orgId);
  if (error) return { error: error.message };

  revalidatePath("/training");
}
