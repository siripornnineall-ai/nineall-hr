import { requireUser } from "@/lib/auth";
import { listAttendanceForDate } from "@/lib/queries/attendance";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";

const STATUS_BADGE: Record<string, { tone: "success" | "warning" | "danger" | "info" | "holiday" | "neutral"; label: string }> = {
  on_time: { tone: "success", label: "ตรงเวลา" },
  late: { tone: "warning", label: "มาสาย" },
  early_leave: { tone: "warning", label: "ออกก่อน" },
  absent: { tone: "danger", label: "ขาดงาน" },
  holiday: { tone: "holiday", label: "วันหยุด" },
  leave: { tone: "info", label: "ลา" },
  work_from_home: { tone: "info", label: "WFH" },
  off_site: { tone: "info", label: "นอกสถานที่" },
  pending_offline: { tone: "neutral", label: "รอซิงค์" },
};

function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const workDate = params.date ?? new Date().toISOString().slice(0, 10);
  const rows = await listAttendanceForDate(user.orgId, workDate);

  return (
    <>
      <Topbar title="Attendance" subtitle="สรุปเวลาเข้าออกงานรายวัน" />
      <div className="space-y-4 p-4 md:p-8">
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
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-on-surface-variant">
                      ไม่มีข้อมูลการลงเวลาในวันที่เลือก
                    </td>
                  </tr>
                )}
                {rows.map((r, idx) => {
                  const badge = STATUS_BADGE[r.status] ?? { tone: "neutral" as const, label: r.status };
                  return (
                    <tr key={r.id} className={idx % 2 === 1 ? "bg-row-zebra hover:bg-row-hover" : "hover:bg-row-hover"}>
                      <td className="px-4 py-3">{r.employeeCode}</td>
                      <td className="px-4 py-3 font-semibold">
                        {r.employeeName}
                        {r.needsReview && (
                          <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
                            ต้องตรวจสอบ
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{formatTime(r.clockIn)}</td>
                      <td className="px-4 py-3">{formatTime(r.clockOut)}</td>
                      <td className="px-4 py-3">{r.lateMinutes || "-"}</td>
                      <td className="px-4 py-3">{r.otMinutes || "-"}</td>
                      <td className="px-4 py-3">
                        {r.withinGeofence === null ? "-" : r.withinGeofence ? (
                          <span className="text-green-600">ในพื้นที่</span>
                        ) : (
                          <span className="text-red-600">นอกพื้นที่</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
