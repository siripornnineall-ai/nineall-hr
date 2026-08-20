"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Approving only records the decision — it does not auto-swap shift_assignments rows,
// since a swap can mean different things (give away a shift, trade dates with a
// colleague, or just a plain shift change) and the reason text carries the specifics.
// HR reassigns the actual shift via the existing Attendance "แก้ไขเวลา" editor once
// approved, informed by this request.
export async function decideShiftSwapRequest(requestId: string, decision: "approved" | "rejected") {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("shift_swap_requests")
    .update({ status: decision })
    .eq("id", requestId)
    .eq("org_id", user.orgId);
  if (error) throw new Error(error.message);

  await supabase
    .from("approval_steps")
    .update({ status: decision, acted_at: new Date().toISOString(), approver_employee_id: user.employeeId })
    .eq("request_type", "shift_swap")
    .eq("request_id", requestId)
    .eq("status", "pending");

  revalidatePath("/shift-swap");
}
