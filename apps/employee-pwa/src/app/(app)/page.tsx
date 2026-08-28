"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { LateLeaderboardCard, CookieLeaderboardCard } from "./LeaderboardCards";

interface HomeStats {
  leaveDaysRemaining: number;
  otHoursThisMonth: number;
  pendingRequests: number;
  latestPayslipLabel: string | null;
  todayStatus: string | null;
  todayClockIn: string | null;
}

interface Holiday {
  id: string;
  name: string;
  holiday_date: string;
}

const STATUS_TH: Record<string, string> = {
  on_time: "ตรงเวลา",
  late: "มาสาย",
  early_leave: "ออกก่อนเวลา",
  absent: "ขาดงาน",
  holiday: "วันหยุด",
  leave: "ลา",
  work_from_home: "Work From Home",
  off_site: "นอกสถานที่",
  pending_offline: "รอซิงค์ข้อมูล",
};

export default function HomePage() {
  const { profile, signOut, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadStats = useCallback(async () => {
    if (!profile) return;
    const today = new Date().toISOString().slice(0, 10);
    const year = new Date().getFullYear();
    const monthStart = `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;

    const [balances, ot, leaveReq, otReq, payslip, todayAttendance] = await Promise.all([
      supabase.from("leave_balances").select("entitled_days, carried_over_days, used_days, pending_days").eq("employee_id", profile.employeeId).eq("year", year),
      supabase.from("overtime_requests").select("approved_hours").eq("employee_id", profile.employeeId).eq("status", "approved").gte("work_date", monthStart),
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("employee_id", profile.employeeId).eq("status", "pending"),
      supabase.from("overtime_requests").select("id", { count: "exact", head: true }).eq("employee_id", profile.employeeId).eq("status", "pending"),
      supabase.from("payslips").select("payroll_periods(label)").eq("employee_id", profile.employeeId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("attendance_records").select("status, clock_in_server_at").eq("employee_id", profile.employeeId).eq("work_date", today).maybeSingle(),
    ]);

    const leaveDaysRemaining = (balances.data ?? []).reduce(
      (sum, b) => sum + Number(b.entitled_days) + Number(b.carried_over_days) - Number(b.used_days) - Number(b.pending_days),
      0
    );
    const otHours = (ot.data ?? []).reduce((sum, o) => sum + Number(o.approved_hours ?? 0), 0);
    const period = payslip.data?.payroll_periods as unknown as { label: string } | null;

    setStats({
      leaveDaysRemaining,
      otHoursThisMonth: otHours,
      pendingRequests: (leaveReq.count ?? 0) + (otReq.count ?? 0),
      latestPayslipLabel: period?.label ?? null,
      todayStatus: todayAttendance.data?.status ?? null,
      todayClockIn: todayAttendance.data?.clock_in_server_at ?? null,
    });
  }, [profile, supabase]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("company_holidays")
      .select("id, name, holiday_date")
      .eq("org_id", profile.orgId)
      .gte("holiday_date", new Date().toISOString().slice(0, 10))
      .order("holiday_date")
      .limit(5)
      .then(({ data }) => setHolidays(data ?? []));
  }, [profile, supabase]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  return (
    <div>
      <header className="safe-top rounded-b-3xl bg-primary-container px-5 pb-7 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/20">
              {profile?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-[24px] text-white">person</span>
              )}
            </span>
            <div>
              <p className="text-lg font-bold text-white">{profile?.fullName ?? "-"}</p>
              <p className="text-xs text-white/85">{profile?.jobTitle ?? ""}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-white">{now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false })}</p>
            <p className="text-xs text-white/80">{now.toLocaleDateString("th-TH")}</p>
          </div>
        </div>
      </header>

      <div className="-mt-4 space-y-4 px-4">
        <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <span
            className="material-symbols-outlined text-[24px]"
            style={{ color: stats?.todayClockIn ? "var(--color-status-success)" : "var(--color-on-surface-variant)" }}
          >
            {stats?.todayClockIn ? "check_circle" : "schedule"}
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-on-surface">
              {stats?.todayClockIn
                ? `เข้างานวันนี้: ${new Date(stats.todayClockIn).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}`
                : "ยังไม่ลงเวลาเข้างานวันนี้"}
            </p>
            {stats?.todayStatus && <p className="mt-0.5 text-sm font-bold text-status-success">{STATUS_TH[stats.todayStatus] ?? stats.todayStatus}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatCard href="/leave/balances" icon="event_available" color="var(--color-tertiary)" label="วันลาคงเหลือ" value={`${stats?.leaveDaysRemaining ?? "-"} วัน`} />
          <StatCard href="/overtime" icon="timer" color="var(--color-secondary)" label="OT เดือนนี้" value={`${stats?.otHoursThisMonth ?? 0} ชม.`} />
          <StatCard href="/requests" icon="pending_actions" color="var(--color-status-warning)" label="คำขอรออนุมัติ" value={`${stats?.pendingRequests ?? 0} รายการ`} />
          <StatCard href="/payslip" icon="payments" color="var(--color-status-info)" label="สลิปล่าสุด" value={stats?.latestPayslipLabel ?? "ยังไม่มี"} />
        </div>

        <div className="flex gap-3">
          <Link href="/attendance" className="flex flex-1 flex-col items-center gap-1 rounded-2xl bg-primary py-4 text-white">
            <span className="material-symbols-outlined text-[22px]">fingerprint</span>
            <span className="text-xs font-bold">ลงเวลาเข้า-ออก</span>
          </Link>
          <Link href="/leave" className="flex flex-1 flex-col items-center gap-1 rounded-2xl bg-secondary py-4 text-white">
            <span className="material-symbols-outlined text-[22px]">event_note</span>
            <span className="text-xs font-bold">ขอลางาน</span>
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <QuickLink href="/reimbursement" icon="receipt_long" label="เบิกเงิน" />
          <QuickLink href="/shift-swap" icon="swap_horiz" label="สลับกะ" />
          <QuickLink href="/holiday-swap" icon="event_repeat" label="สลับวันหยุด นขต." />
          <QuickLink href="/day-off-swap" icon="published_with_changes" label="สลับวันหยุดประจำ" />
          <QuickLink href="/calendar" icon="calendar_month" label="ปฏิทิน" />
          <QuickLink href="/certificate" icon="workspace_premium" label="ใบรับรอง" />
        </div>

        <LateLeaderboardCard />
        <CookieLeaderboardCard />

        {holidays.length > 0 && (
          <div className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <p className="mb-3 text-sm font-bold text-on-surface">วันหยุดที่กำลังจะมาถึง</p>
            <ul className="space-y-3">
              {holidays.map((h) => {
                const d = new Date(h.holiday_date);
                return (
                  <li key={h.id} className="flex items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full bg-primary-container text-white">
                      <span className="text-xl font-bold leading-none">{d.getDate()}</span>
                      <span className="mt-0.5 text-[11px] font-semibold leading-none">{d.toLocaleDateString("th-TH", { month: "short" })}</span>
                    </div>
                    <div>
                      <p className="text-sm text-on-surface">{h.name}</p>
                      <p className="text-xs text-on-surface-variant">
                        {d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button onClick={() => signOut()} className="text-xs font-semibold text-status-danger">
            ออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ href, icon, color, label, value }: { href: string; icon: string; color: string; label: string; value: string }) {
  return (
    <Link href={href} className="block rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)] active:scale-95 transition-transform">
      <span className="material-symbols-outlined text-[22px]" style={{ color }}>
        {icon}
      </span>
      <p className="mt-2 text-xs text-on-surface-variant">{label}</p>
      <p className="mt-0.5 text-base font-bold text-on-surface">{value}</p>
    </Link>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 rounded-2xl bg-white py-3 text-on-surface shadow-[0_4px_20px_rgba(0,0,0,0.05)] active:scale-95 transition-transform"
    >
      <span className="material-symbols-outlined text-[20px] text-primary">{icon}</span>
      <span className="text-[10px] font-bold">{label}</span>
    </Link>
  );
}
