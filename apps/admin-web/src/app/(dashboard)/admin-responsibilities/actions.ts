"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface ScheduleInput {
  channelId: string;
  workDays: string;
  startTime: string;
  endTime: string;
}

export async function addChannelAction(name: string): Promise<{ error?: string }> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  if (!name.trim()) return { error: "กรุณากรอกชื่อร้าน/ช่องทาง" };

  const supabase = await createClient();
  const { error } = await supabase.from("admin_responsibility_channels").insert({ org_id: user.orgId, name: name.trim() });
  if (error) return { error: error.message };

  revalidatePath("/admin-responsibilities");
  return {};
}

export async function deleteChannelAction(channelId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  const supabase = await createClient();
  const { error } = await supabase.from("admin_responsibility_channels").delete().eq("id", channelId).eq("org_id", user.orgId);
  if (error) return { error: error.message };

  revalidatePath("/admin-responsibilities");
  return {};
}

// Upserts the profile (one per employee) and fully replaces its schedule rows with whatever
// was submitted — simpler and safer than diffing adds/edits/deletes for a handful of rows.
export async function saveProfileAction(input: {
  profileId?: string;
  employeeId: string;
  shiftLabel: string;
  duties: string[];
  schedules: ScheduleInput[];
}): Promise<{ error?: string }> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  if (!input.employeeId) return { error: "กรุณาเลือกพนักงาน" };

  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from("admin_responsibility_profiles")
    .upsert(
      {
        id: input.profileId,
        org_id: user.orgId,
        employee_id: input.employeeId,
        shift_label: input.shiftLabel || null,
        duties: input.duties.filter((d) => d.trim()),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "employee_id" }
    )
    .select("id")
    .single();

  if (profileError || !profile) return { error: profileError?.message ?? "บันทึกไม่สำเร็จ" };

  const { error: deleteError } = await supabase.from("admin_responsibility_schedules").delete().eq("profile_id", profile.id);
  if (deleteError) return { error: deleteError.message };

  const validSchedules = input.schedules.filter((s) => s.channelId && s.workDays.trim() && s.startTime && s.endTime);
  if (validSchedules.length > 0) {
    const { error: scheduleError } = await supabase.from("admin_responsibility_schedules").insert(
      validSchedules.map((s) => ({
        org_id: user.orgId,
        profile_id: profile.id,
        channel_id: s.channelId,
        work_days: s.workDays.trim(),
        start_time: s.startTime,
        end_time: s.endTime,
      }))
    );
    if (scheduleError) return { error: scheduleError.message };
  }

  revalidatePath("/admin-responsibilities");
  return {};
}

export async function deleteProfileAction(profileId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  const supabase = await createClient();
  const { error } = await supabase.from("admin_responsibility_profiles").delete().eq("id", profileId).eq("org_id", user.orgId);
  if (error) return { error: error.message };

  revalidatePath("/admin-responsibilities");
  return {};
}
