import Link from "next/link";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-cream px-4">
      <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-white p-8 shadow-lg">
        <h1 className="mb-2 text-xl font-bold text-primary">ลืมรหัสผ่าน</h1>
        <p className="mb-6 text-sm text-on-surface-variant">กรอกอีเมลที่ใช้เข้าสู่ระบบ เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้</p>
        <ForgotPasswordForm />
        <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-primary">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    </div>
  );
}
