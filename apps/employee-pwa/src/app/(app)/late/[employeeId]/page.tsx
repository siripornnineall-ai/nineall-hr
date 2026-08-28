"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface DayRow {
  work_date: string;
  late_minutes: number;
  status: string;
}

interface EmployeeInfo {
  name: string;
  nickname: string | null;
  photoUrl: string | null;
}

interface RawBasicInfo {
  first_name: string;
  last_name: string;
  nickname: string | null;
  photo_url: string | null;
}

// Calendar math on plain Y/M numbers (not a parsed date string), so this is unaffected by
// the device's own clock timezone — only "what month is it in Bangkok right now" matters.
function currentBangkokMonthRange(): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export default function LateDetailPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [info, setInfo] = useState<EmployeeInfo | null>(null);
  const [days, setDays] = useState<DayRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const { start, end } = currentBangkokMonthRange();
      const [{ data: basicData }, { data: detailData }] = await Promise.all([
        supabase.rpc("get_employee_basic_info", { p_employee_id: employeeId }).maybeSingle(),
        supabase.rpc("get_employee_late_detail", { p_employee_id: employeeId, p_month_start: start, p_month_end: end }),
      ]);
      const basic = basicData as RawBasicInfo | null;
      const detail = detailData as DayRow[] | null;

      if (basic) {
        let photoUrl: string | null = null;
        if (basic.photo_url) {
          const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(basic.photo_url, 3600);
          photoUrl = signed?.signedUrl ?? null;
        }
        setInfo({ name: `${basic.first_name} ${basic.last_name}`, nickname: basic.nickname, photoUrl });
      }
      setDays((detail ?? []).filter((d) => d.late_minutes > 0));
      setLoaded(true);
    }
    load();
  }, [supabase, employeeId]);

  const totalMinutes = days.reduce((sum, d) => sum + d.late_minutes, 0);

  return (
    <div className="safe-top space-y-4 px-4 pb-6 pt-4">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm font-semibold text-primary">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        กลับ
      </button>

      {!loaded && (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-5 text-sm text-on-surface-variant shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
          กำลังโหลด...
        </div>
      )}

      {loaded && (
        <>
          <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container">
              {info?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={info.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-on-surface-variant">person</span>
              )}
            </span>
            <div>
              <p className="text-base font-bold text-on-surface">{info?.nickname || info?.name || "-"}</p>
              <p className="text-xs text-on-surface-variant">
                รวมมาสายเดือนนี้ {(totalMinutes / 60).toFixed(1)} ชม. ({days.length} วัน)
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <p className="mb-3 text-sm font-bold text-on-surface">รายละเอียดรายวัน</p>
            {days.length === 0 ? (
              <p className="text-xs text-on-surface-variant">เดือนนี้ไม่มีการมาสาย</p>
            ) : (
              <ul className="divide-y divide-outline-variant">
                {days.map((d) => (
                  <li key={d.work_date} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-on-surface-variant">
                      {new Date(d.work_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    <span className="font-bold text-status-warning">{d.late_minutes} นาที</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
