"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    // Guards against autofill/typo mismatches (a real-world failure mode where a browser's
    // "suggest strong password" prompt silently saves a different value than what's shown) —
    // without this, the user has no way to tell the saved password differs from what they
    // think they typed until the very next login attempt fails.
    if (password !== confirmPassword) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน กรุณาพิมพ์ให้เหมือนกัน");
      return;
    }
    setIsPending(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsPending(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess(true);
    setTimeout(() => router.push("/login"), 1500);
  }

  if (success) {
    return <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">ตั้งรหัสผ่านใหม่สำเร็จ กำลังพาไปหน้าเข้าสู่ระบบ...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)"
        className="h-12 w-full rounded-lg border border-outline-variant px-4 text-sm outline-none focus:border-primary"
      />
      <input
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง"
        className="h-12 w-full rounded-lg border border-outline-variant px-4 text-sm outline-none focus:border-primary"
      />
      {error && <p className="text-sm text-error">{error}</p>}
      <button type="submit" disabled={isPending} className="h-12 w-full rounded-xl bg-primary font-bold text-white disabled:opacity-60">
        {isPending ? "กำลังบันทึก..." : "ตั้งรหัสผ่านใหม่"}
      </button>
    </form>
  );
}
