import { ResetPasswordForm } from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-cream px-4">
      <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-white p-8 shadow-lg">
        <h1 className="mb-2 text-xl font-bold text-primary">ตั้งรหัสผ่านใหม่</h1>
        <p className="mb-6 text-sm text-on-surface-variant">กรุณาตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ</p>
        <ResetPasswordForm />
      </div>
    </div>
  );
}
