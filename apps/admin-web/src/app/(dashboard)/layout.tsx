import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";

const ROLE_LABEL_TH: Record<string, string> = {
  super_admin: "ผู้ดูแลระบบสูงสุด",
  hr: "ฝ่ายบุคคล",
  manager: "หัวหน้าทีม",
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar role={user.role} fullName={user.fullName} roleLabel={ROLE_LABEL_TH[user.role] ?? user.role} />
      <div className="pb-16 md:ml-[260px] md:pb-0">{children}</div>
      <MobileBottomNav />
    </div>
  );
}
