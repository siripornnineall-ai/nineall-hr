"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface CreateAdminState {
  error?: string;
}

export async function createAdminAccountAction(
  fullName: string,
  email: string,
  password: string,
  role: "super_admin" | "hr" | "manager",
  employeeId: string | null
): Promise<CreateAdminState> {
  const user = await requireUser();
  requireRole(user, ["super_admin"]);

  if (!fullName.trim()) return { error: "กรุณากรอกชื่อ-นามสกุล" };
  if (!email.trim()) return { error: "กรุณากรอกอีเมล" };
  if (password.length < 8) return { error: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_admin_account", {
    p_email: email.trim(),
    p_full_name: fullName.trim(),
    p_password: password,
    p_role: role,
    p_employee_id: employeeId,
  });
  if (error) return { error: `สร้างบัญชีผู้ดูแลระบบไม่สำเร็จ: ${error.message}` };

  revalidatePath("/admins");
  return {};
}
