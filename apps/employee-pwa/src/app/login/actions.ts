"use server";

import { redirect } from "next/navigation";
import { loginSchema } from "@nineall-hr/shared-validation";
import { createClient } from "@/lib/supabase/server";

export interface LoginActionState {
  error?: string;
}

export async function loginAction(_prevState: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }

  const supabase = await createClient();

  const { data: resolvedEmail, error: lookupError } = await supabase.rpc("lookup_login_email", {
    p_identifier: parsed.data.identifier,
  });
  if (lookupError || !resolvedEmail) {
    return { error: "ไม่พบบัญชีผู้ใช้สำหรับอีเมล/รหัสพนักงานนี้" };
  }

  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email: resolvedEmail,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "อีเมล/รหัสพนักงาน หรือรหัสผ่านไม่ถูกต้อง" };
  }

  const { data: profile } = await supabase.from("profiles").select("role, employee_id").eq("id", signInData.user.id).single();

  // Admin/HR/manager accounts are usually pure logins with nothing to see here, so they're
  // still sent to admin-web — but some (e.g. an owner who is also a tracked employee) have
  // employee_id set and need self-service features (clock-in, leave) that only exist in this
  // app, so let anyone with an employee record through regardless of their admin role.
  if (profile && profile.role !== "employee" && !profile.employee_id) {
    await supabase.auth.signOut();
    return { error: "บัญชีนี้เป็นผู้ดูแล/หัวหน้าทีม กรุณาเข้าสู่ระบบผ่านเว็บสำหรับ Admin แทน" };
  }

  redirect("/");
}
