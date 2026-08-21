"use server";

import { revalidatePath } from "next/cache";
import { announcementSchema } from "@nineall-hr/shared-validation";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface AnnouncementActionState {
  error?: string;
}

export async function createAnnouncementAction(_prev: AnnouncementActionState, formData: FormData): Promise<AnnouncementActionState> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  const parsed = announcementSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    targetType: formData.get("targetType") || "all",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const supabase = await createClient();
  const { error } = await supabase.from("announcements").insert({
    org_id: user.orgId,
    title: parsed.data.title,
    body: parsed.data.body,
    target_type: parsed.data.targetType,
    created_by: user.profileId,
  });
  if (error) return { error: error.message };

  revalidatePath("/announcements");
  return {};
}

export async function deleteAnnouncementAction(announcementId: string): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  const supabase = await createClient();
  const { error } = await supabase.from("announcements").delete().eq("id", announcementId).eq("org_id", user.orgId);
  if (error) return { error: error.message };

  revalidatePath("/announcements");
}
