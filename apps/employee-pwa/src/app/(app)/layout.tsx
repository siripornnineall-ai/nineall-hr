import { requireEmployee } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { ClockReminderVoice } from "@/components/ClockReminderVoice";
import { EnableNotificationsBanner } from "@/components/EnableNotificationsBanner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireEmployee();

  return (
    <div className="min-h-screen bg-surface pb-20">
      <ClockReminderVoice />
      <EnableNotificationsBanner />
      {children}
      <BottomNav />
    </div>
  );
}
