"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface GoalInput {
  employeeId?: string;
  kind: "goal" | "kpi";
  title: string;
  description: string;
  targetValue: string;
  currentValue: string;
  period: string;
  dueDate: string;
  status: "active" | "done" | "cancelled";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validate(input: GoalInput): string | null {
  if (input.kind !== "goal" && input.kind !== "kpi") return "ประเภทไม่ถูกต้อง";
  if (!input.title.trim()) return "กรุณากรอกหัวข้อ";
  if (input.dueDate && !ISO_DATE.test(input.dueDate)) return "วันที่ไม่ถูกต้อง";
  if (!["active", "done", "cancelled"].includes(input.status)) return "สถานะไม่ถูกต้อง";
  return null;
}

// Admin / HR add a goal or KPI for an employee. The employee gets an in-app notification (database trigger).
export async function createGoalAction(input: GoalInput): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  if (!input.employeeId) return { error: "กรุณาเลือกพนักงาน" };
  const problem = validate(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error } = await supabase.from("employee_goals").insert({
    org_id: user.orgId,
    employee_id: input.employeeId,
    kind: input.kind,
    title: input.title.trim(),
    description: input.description.trim() || null,
    target_value: input.targetValue.trim() || null,
    current_value: input.currentValue.trim() || null,
    period: input.period.trim() || null,
    due_date: input.dueDate || null,
    status: input.status,
    source: "admin",
    created_by_employee_id: user.employeeId,
  });
  if (error) return { error: error.message };

  revalidatePath("/goals");
}

// Admin / HR can edit any goal or KPI, including ones the employee wrote.
export async function updateGoalAction(goalId: string, input: GoalInput): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const problem = validate(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_goals")
    .update({
      kind: input.kind,
      title: input.title.trim(),
      description: input.description.trim() || null,
      target_value: input.targetValue.trim() || null,
      current_value: input.currentValue.trim() || null,
      period: input.period.trim() || null,
      due_date: input.dueDate || null,
      status: input.status,
    })
    .eq("id", goalId)
    .eq("org_id", user.orgId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "ไม่พบรายการนี้" };

  revalidatePath("/goals");
}

export async function deleteGoalAction(goalId: string): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { error } = await supabase.from("employee_goals").delete().eq("id", goalId).eq("org_id", user.orgId);
  if (error) return { error: error.message };

  revalidatePath("/goals");
}
