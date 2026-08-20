"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function decideReimbursementRequest(requestId: string, decision: "approved" | "rejected") {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("reimbursement_requests")
    .update({ status: decision })
    .eq("id", requestId)
    .eq("org_id", user.orgId);
  if (error) throw new Error(error.message);

  await supabase
    .from("approval_steps")
    .update({ status: decision, acted_at: new Date().toISOString(), approver_employee_id: user.employeeId })
    .eq("request_type", "reimbursement")
    .eq("request_id", requestId)
    .eq("status", "pending");

  revalidatePath("/reimbursement");
}
