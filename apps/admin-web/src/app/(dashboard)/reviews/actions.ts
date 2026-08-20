"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createReviewAction(values: {
  employeeId: string;
  reviewPeriod: string;
  rating: string;
  strengths?: string;
  improvements?: string;
  goalsNextPeriod?: string;
}): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const supabase = await createClient();

  if (!values.employeeId) return { error: "กรุณาเลือกพนักงาน" };
  if (!values.reviewPeriod.trim()) return { error: "กรุณาระบุรอบการประเมิน" };
  const rating = Number(values.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return { error: "คะแนนต้องอยู่ระหว่าง 1-5" };

  const { error } = await supabase.from("performance_reviews").insert({
    org_id: user.orgId,
    employee_id: values.employeeId,
    review_period: values.reviewPeriod.trim(),
    rating,
    strengths: values.strengths?.trim() || null,
    improvements: values.improvements?.trim() || null,
    goals_next_period: values.goalsNextPeriod?.trim() || null,
    reviewer_employee_id: user.employeeId,
  });
  if (error) return { error: error.message };

  revalidatePath("/reviews");
}

export async function deleteReviewAction(reviewId: string): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("performance_reviews").delete().eq("id", reviewId).eq("org_id", user.orgId);
  if (error) return { error: error.message };

  revalidatePath("/reviews");
}
