import { requireUser } from "@/lib/auth";
import { listAttendanceForDate, syncHolidayAttendance } from "@/lib/queries/attendance";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { AttendanceRow } from "./AttendanceRow";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const workDate = params.date ?? new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const holidayName = await syncHolidayAttendance(user.orgId, workDate);
  const [rows, { data: shifts }, { data: workLocations }] = await Promise.all([
    listAttendanceForDate(user.orgId, workDate),
    supabase.from("work_shifts").select("id, name").eq("org_id", user.orgId),
    supabase.from("work_locations").select("id, name").eq("org_id", user.orgId),
  ]);

  return (
    <>
      <Topbar title="Attendance" subtitle="สรุปเวลาเข้าออกงานรายวัน" />
      <div className="space-y-4 p-4 md:p-8">
        {holidayName && (
          <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm font-bold text-purple-800">
            🎉 วันนี้เป็นวันหยุดนักขัตฤกษ์: {holidayName}
          </div>
        )}
        <form method="get" className="flex items-center gap-3">
          <label className="text-sm font-semibold text-on-surface-variant" htmlFor="date">
            วันที่
          </label>
          <input
            id="date"
            type="date"
            name="date"
            defaultValue={workDate}
            className="h-10 rounded-lg border border-outline-variant px-3 text-sm"
          />
          <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-white">
            ดูข้อมูล
          </button>
        </form>

        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  <th className="px-4 py-3 font-bold text-on-surface-variant">รหัส</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">ชื่อ</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">เข้างาน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">ออกงาน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">สาย (นาที)</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">OT (นาที)</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">พื้นที่</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">สถานะ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-on-surface-variant">
                      ไม่มีข้อมูลการลงเวลาในวันที่เลือก
                    </td>
                  </tr>
                )}
                {rows.map((r, idx) => (
                  <AttendanceRow key={r.id} row={r} zebra={idx % 2 === 1} shifts={shifts ?? []} workLocations={workLocations ?? []} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
