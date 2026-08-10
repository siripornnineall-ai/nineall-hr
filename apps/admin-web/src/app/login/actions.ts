"use server";

import { redirect } from "next/navigation";
import { loginSchema } from "@nineall-hr/shared-validation";
import { createClient } from "@/lib/supabase/server";

export interface LoginActionState {
  error?: string;
}

/**
 * Accepts either an email or an employee code as the identifier. Employee codes are
 * resolved to their login email via the `profiles` table before calling Supabase Auth,
 * since Supabase Auth itself only authenticates by email.
 */
export async function loginAction(_prevState: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }

  const supabase = await createClient();

  // Resolves either an email or an employee code to the login email via the
  // security-definer `lookup_login_email()` function (0016_login_identifier_lookup.sql) —
  // RLS blocks anonymous reads of `profiles`/`employees` directly, so this narrow function
  // is the only pre-auth way to turn "EMP-001" into a real email.
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", signInData.user.id)
    .single();

  if (profile && !["super_admin", "hr", "manager"].includes(profile.role)) {
    await supabase.auth.signOut();
    return { error: "บัญชีพนักงานทั่วไปกรุณาใช้งานผ่านแอปพนักงาน (มือถือ) เท่านั้น" };
  }

  redirect("/dashboard");
}
