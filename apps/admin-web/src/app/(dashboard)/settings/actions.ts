"use server";

import { revalidatePath } from "next/cache";
import { leaveTypeSchema } from "@nineall-hr/shared-validation";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface LeaveTypeActionState {
  error?: string;
}

export async function createLeaveTypeAction(_prev: LeaveTypeActionState, formData: FormData): Promise<LeaveTypeActionState> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  const parsed = leaveTypeSchema.safeParse({
    code: formData.get("code"),
    nameTh: formData.get("nameTh"),
    nameEn: formData.get("nameEn") || undefined,
    isPaid: formData.get("isPaid") === "on",
    daysPerYear: Number(formData.get("daysPerYear")),
    allowHalfDay: formData.get("allowHalfDay") === "on",
    allowHourly: formData.get("allowHourly") === "on",
    requiresAttachment: formData.get("requiresAttachment") === "on",
    minServiceMonths: 0,
    noticeDaysRequired: Number(formData.get("noticeDaysRequired") || 0),
    carryOverAllowed: false,
    carryOverMaxDays: 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const supabase = await createClient();
  const { data: leaveType, error } = await supabase
    .from("leave_types")
    .insert({
      org_id: user.orgId,
      code: parsed.data.code,
      name_th: parsed.data.nameTh,
      name_en: parsed.data.nameEn || null,
      is_paid: parsed.data.isPaid,
    })
    .select("id")
    .single();
  if (error || !leaveType) return { error: error?.message ?? "บันทึกไม่สำเร็จ" };

  await supabase.from("leave_policies").insert({
    leave_type_id: leaveType.id,
    effective_date: new Date().toISOString().slice(0, 10),
    days_per_year: parsed.data.daysPerYear,
    allow_half_day: parsed.data.allowHalfDay,
    allow_hourly: parsed.data.allowHourly,
    requires_attachment: parsed.data.requiresAttachment,
    notice_days_required: parsed.data.noticeDaysRequired,
    created_by: user.profileId,
  });

  revalidatePath("/settings");
  return {};
}
