import { requireUser } from "@/lib/auth";
import { getDashboardStats } from "@/lib/queries/dashboard";
import { Topbar } from "@/components/Topbar";
import { StatCard } from "@/components/StatCard";

function formatThaiDate(date: Date): string {
  return date.toLocaleDateString("th-TH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export default async function DashboardPage() {
  const user = await requireUser();
  const stats = await getDashboardStats(user.orgId);

  return (
    <>
      <Topbar title="Dashboard ภาพรวม" subtitle={formatThaiDate(new Date())} />
      <div className="space-y-6 p-4 md:p-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="พนักงานทั้งหมด" value={stats.totalEmployees} icon="group" accent="primary" />
          <StatCard label="มาทำงานวันนี้" value={stats.presentToday} icon="how_to_reg" accent="success" />
          <StatCard label="ลาวันนี้" value={stats.onLeaveToday} icon="event_busy" accent="warning" />
          <StatCard label="มาสาย" value={stats.lateToday} icon="alarm" accent="warning" />
          <StatCard label="ยังไม่ลงเวลาออก" value={stats.notClockedOutToday} icon="person_off" accent="danger" />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm lg:col-span-2">
            <h3 className="mb-4 text-lg font-bold">รายการที่ต้องดำเนินการ</h3>
            <div className="space-y-3">
              <ActionRow href="/leave" icon="event_busy" label="คำขอลารออนุมัติ" count={stats.pendingLeave} />
              <ActionRow href="/overtime" icon="history_toggle_off" label="คำขอ OT รออนุมัติ" count={stats.pendingOvertime} />
              <ActionRow href="/attendance" icon="edit_calendar" label="คำขอแก้ไขเวลารออนุมัติ" count={stats.pendingTimeCorrection} />
            </div>
          </div>

          <div className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">ประกาศบริษัทล่าสุด</h3>
            {stats.announcements.length === 0 ? (
              <p className="text-sm text-on-surface-variant">ยังไม่มีประกาศ</p>
            ) : (
              <ul className="space-y-3">
                {stats.announcements.map((a) => (
                  <li key={a.id} className="border-b border-outline-variant pb-2 last:border-0">
                    <p className="text-sm font-semibold">{a.title}</p>
                    <p className="text-xs text-on-surface-variant">
                      {new Date(a.publishAt).toLocaleDateString("th-TH")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function ActionRow({ href, icon, label, count }: { href: string; icon: string; label: string; count: number }) {
  return (
    <a
      href={href}
      className="group flex items-center justify-between rounded-lg border border-transparent bg-surface-container p-3 transition-all hover:border-primary"
    >
      <div className="flex items-center gap-3">
        <div className="rounded bg-primary/10 p-2 text-primary">
          <span className="material-symbols-outlined">{icon}</span>
        </div>
        <div>
          <p className="text-sm font-bold">{label}</p>
          <p className="text-xs text-on-surface-variant">รวม {count} รายการ</p>
        </div>
      </div>
      <span className="material-symbols-outlined text-on-surface-variant transition-transform group-hover:translate-x-1">
        chevron_right
      </span>
    </a>
  );
}
