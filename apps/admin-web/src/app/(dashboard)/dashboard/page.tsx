import { requireUser } from "@/lib/auth";
import { getDashboardStats } from "@/lib/queries/dashboard";
import { getLateLeaderboard, getCookieLeaderboard } from "@/lib/queries/engagement";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { StatCard } from "@/components/StatCard";
import { LateLeaderboardCard } from "./LateLeaderboardCard";
import { CookieLeaderboardCard } from "./CookieLeaderboardCard";

function formatThaiDate(date: Date): string {
  return date.toLocaleDateString("th-TH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [stats, { data: holidays }, lateLeaderboard, cookieLeaderboard] = await Promise.all([
    getDashboardStats(user.orgId),
    supabase
      .from("company_holidays")
      .select("id, name, holiday_date")
      .eq("org_id", user.orgId)
      .gte("holiday_date", new Date().toISOString().slice(0, 10))
      .order("holiday_date")
      .limit(5),
    getLateLeaderboard(),
    getCookieLeaderboard(50),
  ]);

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

          <div className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">วันหยุดที่กำลังจะมาถึง</h3>
            {(holidays ?? []).length === 0 ? (
              <p className="text-sm text-on-surface-variant">ไม่มีวันหยุดที่กำลังจะมาถึง</p>
            ) : (
              <ul className="space-y-3">
                {(holidays ?? []).map((h) => {
                  const d = new Date(h.holiday_date);
                  return (
                    <li key={h.id} className="flex items-center gap-3 border-b border-outline-variant pb-2 last:border-0">
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <span className="text-sm font-bold leading-none">{d.getDate()}</span>
                        <span className="text-[10px] leading-none">{d.toLocaleDateString("th-TH", { month: "short" })}</span>
                      </div>
                      <p className="text-sm font-semibold">{h.name}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <LateLeaderboardCard rows={lateLeaderboard} />
          <CookieLeaderboardCard rows={cookieLeaderboard} />
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
