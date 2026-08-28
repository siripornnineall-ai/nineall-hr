"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface Holiday {
  holiday_date: string;
  name: string;
}

interface LeaveRange {
  start_date: string;
  end_date: string;
  leave_types: { name_th: string } | null;
}

interface AttendanceDay {
  work_date: string;
  status: string;
  late_minutes: number;
  clock_in_server_at: string | null;
  clock_out_server_at: string | null;
}

const ATTENDANCE_DOT_CLASS: Record<string, string> = {
  on_time: "bg-status-success",
  late: "bg-status-warning",
  early_leave: "bg-status-warning",
  absent: "bg-status-danger",
  work_from_home: "bg-secondary",
  off_site: "bg-secondary",
};

const STATUS_TH: Record<string, string> = {
  on_time: "ตรงเวลา",
  late: "มาสาย",
  early_leave: "ออกก่อนเวลา",
  absent: "ขาดงาน",
  leave: "ลา",
  holiday: "วันหยุด",
  day_off: "หยุดประจำ",
  work_from_home: "Work From Home",
  off_site: "นอกสถานที่",
  pending_offline: "รอซิงค์ข้อมูล",
};

function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
}

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaveRanges, setLeaveRanges] = useState<LeaveRange[]>([]);
  const [attendanceDays, setAttendanceDays] = useState<AttendanceDay[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
    const [{ data: h }, { data: l }, { data: a }] = await Promise.all([
      supabase
        .from("company_holidays")
        .select("holiday_date, name")
        .eq("org_id", profile.orgId)
        .gte("holiday_date", toIso(monthStart))
        .lte("holiday_date", toIso(monthEnd)),
      supabase
        .from("leave_requests")
        .select("start_date, end_date, leave_types(name_th)")
        .eq("employee_id", profile.employeeId)
        .eq("status", "approved")
        .lte("start_date", toIso(monthEnd))
        .gte("end_date", toIso(monthStart)),
      supabase
        .from("attendance_records")
        .select("work_date, status, late_minutes, clock_in_server_at, clock_out_server_at")
        .eq("employee_id", profile.employeeId)
        .gte("work_date", toIso(monthStart))
        .lte("work_date", toIso(monthEnd)),
    ]);
    setHolidays(h ?? []);
    setLeaveRanges((l ?? []) as unknown as LeaveRange[]);
    setAttendanceDays(a ?? []);
  }, [profile, supabase, viewDate]);

  useEffect(() => {
    load();
  }, [load]);

  const holidayByDate = new Map(holidays.map((h) => [h.holiday_date, h.name]));
  const attendanceByDate = new Map(attendanceDays.map((a) => [a.work_date, a]));

  function leaveOnDate(iso: string): string | null {
    const match = leaveRanges.find((l) => iso >= l.start_date && iso <= l.end_date);
    return match ? match.leave_types?.name_th ?? "ลา" : null;
  }

  const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();
  const todayIso = toIso(new Date());

  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div className="safe-top space-y-4 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">ปฏิทินบริษัท</h1>

      <div className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
          </button>
          <p className="text-sm font-bold text-on-surface">
            {THAI_MONTHS[viewDate.getMonth()]} {viewDate.getFullYear() + 543}
          </p>
          <button
            onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1 text-[11px] font-bold text-on-surface-variant">
              {w}
            </div>
          ))}
          {cells.map((day, idx) => {
            if (day === null) return <div key={idx} />;
            const iso = toIso(new Date(viewDate.getFullYear(), viewDate.getMonth(), day));
            const holidayName = holidayByDate.get(iso);
            const leaveName = leaveOnDate(iso);
            const attendance = attendanceByDate.get(iso);
            const isToday = iso === todayIso;
            const isSelected = iso === selectedDate;
            const dotClass = attendance ? ATTENDANCE_DOT_CLASS[attendance.status] : undefined;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedDate(iso)}
                className={clsx(
                  "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-xs transition-colors",
                  isToday && "ring-2 ring-primary",
                  isSelected && "ring-2 ring-secondary",
                  holidayName ? "bg-status-danger/10 text-status-danger" : leaveName ? "bg-secondary/10 text-secondary" : "text-on-surface"
                )}
              >
                <span className="font-semibold">{day}</span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {/* Holiday dot is always purple, distinct from the attendance-status dot below it,
                      so a working holiday-swap day and a genuine holiday read differently at a glance. */}
                  {holidayName && <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />}
                  {dotClass && <span className={clsx("h-1.5 w-1.5 rounded-full", dotClass)} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate &&
        (() => {
          const attendance = attendanceByDate.get(selectedDate);
          const holidayName = holidayByDate.get(selectedDate);
          const leaveName = leaveOnDate(selectedDate);
          return (
            <div className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-bold text-on-surface">
                  {new Date(selectedDate).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
                <button onClick={() => setSelectedDate(null)} className="text-on-surface-variant">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              {holidayName && <p className="text-sm font-semibold text-status-danger">🎉 วันหยุดนักขัตฤกษ์: {holidayName}</p>}
              {leaveName && <p className="text-sm font-semibold text-secondary">ลา: {leaveName}</p>}
              {attendance ? (
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-on-surface-variant">เข้างาน</p>
                    <p className="font-semibold text-on-surface">{formatTime(attendance.clock_in_server_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-on-surface-variant">ออกงาน</p>
                    <p className="font-semibold text-on-surface">{formatTime(attendance.clock_out_server_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-on-surface-variant">สถานะ</p>
                    <p className="font-semibold text-on-surface">{STATUS_TH[attendance.status] ?? attendance.status}</p>
                  </div>
                  <div>
                    <p className="text-xs text-on-surface-variant">มาสาย</p>
                    <p className="font-semibold text-on-surface">{attendance.late_minutes > 0 ? `${attendance.late_minutes} นาที` : "-"}</p>
                  </div>
                </div>
              ) : (
                !holidayName && !leaveName && <p className="mt-2 text-sm text-on-surface-variant">ไม่มีข้อมูลการลงเวลาวันนี้</p>
              )}
            </div>
          );
        })()}

      <div className="space-y-2">
        {holidays.map((h) => (
          <div key={h.holiday_date} className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <span className="material-symbols-outlined text-[18px] text-status-danger">event</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-on-surface">{h.name}</p>
              <p className="text-xs text-on-surface-variant">{new Date(h.holiday_date).toLocaleDateString("th-TH", { day: "numeric", month: "long" })}</p>
            </div>
            <span className="text-xs font-bold text-status-danger">วันหยุด</span>
          </div>
        ))}
        {leaveRanges.map((l, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <span className="material-symbols-outlined text-[18px] text-secondary">event_note</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-on-surface">{l.leave_types?.name_th ?? "ลา"}</p>
              <p className="text-xs text-on-surface-variant">
                {new Date(l.start_date).toLocaleDateString("th-TH", { day: "numeric", month: "long" })} -{" "}
                {new Date(l.end_date).toLocaleDateString("th-TH", { day: "numeric", month: "long" })}
              </p>
            </div>
            <span className="text-xs font-bold text-secondary">ลาแล้ว</span>
          </div>
        ))}
        {holidays.length === 0 && leaveRanges.length === 0 && (
          <p className="py-4 text-center text-sm text-on-surface-variant">ไม่มีวันหยุดหรือวันลาในเดือนนี้</p>
        )}
      </div>
    </div>
  );
}
