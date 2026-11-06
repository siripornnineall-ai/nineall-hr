"use server";

import { revalidatePath } from "next/cache";
import { announcementSchema } from "@nineall-hr/shared-validation";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface AnnouncementActionState {
  error?: string;
  saved?: boolean;
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

// Edits the title/text of an already published announcement in place (target and expiry are not changed here).
export async function updateAnnouncementAction(_prev: AnnouncementActionState, formData: FormData): Promise<AnnouncementActionState> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "ไม่พบประกาศที่ต้องการแก้ไข" };

  const parsed = announcementSchema.pick({ title: true, body: true }).safeParse({
    title: String(formData.get("title") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .update({ title: parsed.data.title, body: parsed.data.body })
    .eq("id", id)
    .eq("org_id", user.orgId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "ไม่พบประกาศนี้ หรือไม่มีสิทธิ์แก้ไข" };

  revalidatePath("/announcements");
  revalidatePath("/dashboard");
  return { saved: true };
}

export async function deleteAnnouncementAction(announcementId: string): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  const supabase = await createClient();
  const { error } = await supabase.from("announcements").delete().eq("id", announcementId).eq("org_id", user.orgId);
  if (error) return { error: error.message };

  revalidatePath("/announcements");
}
