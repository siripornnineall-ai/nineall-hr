"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createVacancyAction(values: {
  title: string;
  departmentId?: string;
  jobPositionId?: string;
  description?: string;
  headcount: string;
}): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  if (!values.title.trim()) return { error: "กรุณากรอกชื่อตำแหน่งงาน" };
  const headcount = Number(values.headcount) || 1;

  const { error } = await supabase.from("job_vacancies").insert({
    org_id: user.orgId,
    title: values.title.trim(),
    department_id: values.departmentId || null,
    job_position_id: values.jobPositionId || null,
    description: values.description?.trim() || null,
    headcount,
    status: "open",
    created_by: user.profileId,
  });
  if (error) return { error: error.message };

  revalidatePath("/recruitment");
}

export async function updateVacancyStatusAction(vacancyId: string, status: "open" | "closed"): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { error } = await supabase.from("job_vacancies").update({ status }).eq("id", vacancyId).eq("org_id", user.orgId);
  if (error) return { error: error.message };

  revalidatePath("/recruitment");
  revalidatePath(`/recruitment/${vacancyId}`);
}

const CANDIDATE_STATUSES = ["applied", "screening", "interview", "offer", "hired", "rejected"] as const;

export async function decideCandidateStatusAction(
  candidateId: string,
  status: (typeof CANDIDATE_STATUSES)[number]
): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { data: candidate } = await supabase.from("job_candidates").select("vacancy_id").eq("id", candidateId).eq("org_id", user.orgId).single();
  if (!candidate) return { error: "ไม่พบผู้สมัครนี้" };

  const { error } = await supabase.from("job_candidates").update({ status }).eq("id", candidateId).eq("org_id", user.orgId);
  if (error) return { error: error.message };

  revalidatePath(`/recruitment/${candidate.vacancy_id}`);
}
