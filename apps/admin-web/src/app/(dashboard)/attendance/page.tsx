import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listAttendanceForDate, syncHolidayAttendance, syncDayOffAttendance, syncAbsentAttendance } from "@/lib/queries/attendance";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { signAvatarUrls } from "@/lib/avatars";
import { AttendanceRow } from "./AttendanceRow";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const workDate = params.date ?? new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const holidayName = await syncHolidayAttendance(user.orgId, workDate);
  await syncDayOffAttendance(user.orgId, workDate);
  // "Absent" only ever applies to a day that's already over — never today, since the
  // employee may still clock in later.
  const todayBangkok = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  if (workDate < todayBangkok) await syncAbsentAttendance(user.orgId, workDate);
  const [rows, { data: shifts }, { data: workLocations }, { data: allEmployees }] = await Promise.all([
    listAttendanceForDate(user.orgId, workDate),
    supabase.from("work_shifts").select("id, name").eq("org_id", user.orgId),
    supabase.from("work_locations").select("id, name").eq("org_id", user.orgId),
    supabase
      .from("employees")
      .select("id, employee_code, first_name, last_name, photo_url")
      .eq("org_id", user.orgId)
      .is("deleted_at", null)
      .in("employment_status", ["active", "probation"]),
  ]);

  // syncHolidayAttendance/syncDayOffAttendance only cover employees with an explicit
  // shift_assignments row for this date — someone whose schedule was never set up at all
  // (no row either way) falls through both and simply never appears here, indistinguishable
  // from the page just not loading them. Surface that gap explicitly instead of hiding it.
  const presentIds = new Set(rows.map((r) => r.employeeId));
  const missingEmployees = (allEmployees ?? []).filter((e) => !presentIds.has(e.id));
  const missingPhotoMap = await signAvatarUrls(supabase, missingEmployees.map((e) => e.photo_url));

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

        {missingEmployees.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50 shadow-sm">
            <div className="border-b border-amber-200 px-4 py-3">
              <p className="text-sm font-bold text-amber-900">ยังไม่มีข้อมูลวันนี้ ({missingEmployees.length} คน)</p>
              <p className="text-xs text-amber-800">
                ยังไม่ได้ลงเวลา และไม่มีตารางกะ/วันหยุดกำหนดไว้ล่วงหน้าสำหรับวันนี้ — อาจต้องตั้งตารางกะให้ที่หน้า{" "}
                <Link href="/schedule" className="underline">
                  ตารางกะ
                </Link>
              </p>
            </div>
            <ul className="divide-y divide-amber-100">
              {missingEmployees.map((e) => (
                <li key={e.id} className="flex items-center justify-between px-4 py-2.5">
                  <Link href={`/attendance/${e.id}`} className="flex items-center gap-2 hover:text-primary hover:underline">
                    <Avatar url={e.photo_url ? (missingPhotoMap.get(e.photo_url) ?? null) : null} size={28} />
                    <span className="text-sm font-semibold">
                      {e.first_name} {e.last_name}
                      <span className="ml-2 text-xs font-normal text-on-surface-variant">{e.employee_code}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
