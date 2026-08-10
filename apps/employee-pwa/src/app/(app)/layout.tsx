import { requireEmployee } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireEmployee();

  return (
    <div className="min-h-screen bg-surface pb-20">
      {children}
      <BottomNav />
    </div>
  );
}
