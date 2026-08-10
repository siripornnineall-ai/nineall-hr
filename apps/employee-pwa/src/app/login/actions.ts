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

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", signInData.user.id).single();

  if (profile && profile.role !== "employee") {
    await supabase.auth.signOut();
    return { error: "บัญชีนี้เป็นผู้ดูแล/หัวหน้าทีม กรุณาเข้าสู่ระบบผ่านเว็บสำหรับ Admin แทน" };
  }

  redirect("/");
}
