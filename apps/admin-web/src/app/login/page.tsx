import Image from "next/image";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-cream px-4">
      <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-white p-8 shadow-lg">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/logo-mark.png" alt="Nineall HR" width={64} height={64} className="mb-4" priority />
          <h1 className="text-2xl font-bold text-primary">บริษัท ไนน์ ออล กรุ๊ป จำกัด</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Nineall Group Co., Ltd. — ระบบบริหารทรัพยากรบุคคล</p>
        </div>

        <LoginForm />

        <div className="mt-8 border-t border-outline-variant pt-4 text-center text-xs text-on-surface-variant">
          หากเข้าสู่ระบบไม่ได้ กรุณาติดต่อฝ่ายบุคคล
          <br />
          hr@nineallgroup.co.th • 02-000-0000
        </div>
      </div>
    </div>
  );
}
