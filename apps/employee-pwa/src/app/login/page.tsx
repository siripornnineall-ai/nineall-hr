import Image from "next/image";
import Link from "next/link";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-cream px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        <header className="flex flex-col items-center gap-2 text-center">
          <Image src="/logo-mark.png" alt="Nineall HR" width={80} height={80} priority />
          <div>
            <h1 className="text-lg font-bold text-primary">บริษัท ไนน์ ออล กรุ๊ป จำกัด</h1>
            <p className="text-sm text-on-surface-variant">Nineall Group Co., Ltd. — แอปพนักงาน</p>
          </div>
        </header>

        <div className="rounded-2xl border border-outline-variant bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <LoginForm />
          <Link href="/forgot-password" className="mt-4 block text-center text-sm font-semibold text-primary">
            ลืมรหัสผ่าน?
          </Link>
        </div>

        <p className="text-center text-xs text-on-surface-variant">
          หัวหน้าทีม/ฝ่ายบุคคล/ผู้ดูแลระบบ กรุณาเข้าสู่ระบบผ่านเว็บสำหรับ Admin แทน
        </p>
      </div>
    </div>
  );
}
