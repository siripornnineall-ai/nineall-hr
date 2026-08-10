"use server";

import { createClient } from "@/lib/supabase/server";

export interface ForgotPasswordState {
  error?: string;
  success?: boolean;
}

export async function requestPasswordResetAction(_prev: ForgotPasswordState, formData: FormData): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "กรุณากรอกอีเมล" };

  const supabase = await createClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/reset-password`;
  await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  // Always report success regardless of whether the email exists, to avoid leaking
  // which addresses have accounts.
  return { success: true };
}
