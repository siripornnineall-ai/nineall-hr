import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getEmployeeSummary, listDepartments, listEmployees } from "@/lib/queries/employees";
import { Topbar } from "@/components/Topbar";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/Badge";
import { SyncLeaveBalancesButton } from "./SyncLeaveBalancesButton";

const STATUS_BADGE: Record<string, { tone: "success" | "danger" | "warning" | "neutral"; label: string }> = {
  active: { tone: "success", label: "กำลังทำงาน" },
  probation: { tone: "warning", label: "ทดลองงาน" },
  suspended: { tone: "warning", label: "พักงาน" },
  resigned: { tone: "danger", label: "ลาออก" },
  terminated: { tone: "danger", label: "เลิกจ้าง" },
};

const EMPLOYMENT_TYPE_TH: Record<string, string> = {
  monthly: "ประจำ",
  daily: "รายวัน",
  hourly: "รายชั่วโมง",
  part_time: "พาร์ทไทม์",
  contract: "สัญญาจ้าง",
};

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; department?: string; status?: string; page?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const [summary, departments, { rows, total, page, pageSize }] = await Promise.all([
    getEmployeeSummary(user.orgId),
    listDepartments(user.orgId),
    listEmployees(user.orgId, {
      search: params.q,
      departmentId: params.department,
      status: params.status,
      page: params.page ? Number(params.page) : 1,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <Topbar title="รายชื่อพนักงาน" subtitle={`จัดการข้อมูลพนักงานทั้งหมด ${total} รายการ`} />
      <div className="space-y-6 p-4 md:p-8">
        <div className="flex items-center justify-end gap-3">
          <SyncLeaveBalancesButton />
          <Link
            href="/employees/import"
            className="flex h-12 items-center gap-2 rounded-xl border border-primary px-6 font-bold text-primary transition-all hover:bg-primary/5 active:scale-95"
          >
            <span className="material-symbols-outlined">upload_file</span>
            นำเข้าจาก Excel
          </Link>
          <Link
            href="/employees/new"
            className="flex h-12 items-center gap-2 rounded-xl bg-primary px-6 font-bold text-white shadow-md transition-all hover:bg-primary-container active:scale-95"
          >
            <span className="material-symbols-outlined">add</span>
            เพิ่มพนักงาน
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="พนักงานทั้งหมด" value={summary.total} icon="groups" accent="primary" />
          <StatCard label="กำลังทำงาน" value={summary.active} icon="check_circle" accent="success" />
          <StatCard label="เข้าใหม่ปีนี้" value={summary.newThisYear} icon="person_add" accent="info" />
        </div>

        <form className="flex flex-wrap items-center gap-4 rounded-t-xl border-x border-t border-outline-variant bg-white p-4" method="get">
          <input
            name="q"
            defaultValue={params.q}
            placeholder="ค้นหาชื่อ หรือรหัสพนักงาน..."
            className="h-10 min-w-[220px] rounded-lg border border-outline-variant bg-surface-container-low px-4 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <select name="department" defaultValue={params.department} className="h-10 rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm">
            <option value="">ทุกแผนก</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={params.status} className="h-10 rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm">
            <option value="">ทุกสถานะ</option>
            <option value="active">กำลังทำงาน</option>
            <option value="probation">ทดลองงาน</option>
            <option value="resigned">ลาออก</option>
          </select>
          <button type="submit" className="ml-auto rounded-lg border border-outline-variant p-2 text-on-surface-variant hover:bg-surface-variant/20">
            <span className="material-symbols-outlined">filter_list</span>
          </button>
        </form>

        <div className="overflow-hidden rounded-b-xl border border-outline-variant bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  <th className="px-6 py-3 text-xs font-bold uppercase text-on-surface-variant">รหัส</th>
                  <th className="px-6 py-3 text-xs font-bold uppercase text-on-surface-variant">ชื่อ-นามสกุล</th>
                  <th className="px-6 py-3 text-xs font-bold uppercase text-on-surface-variant">ตำแหน่ง</th>
                  <th className="px-6 py-3 text-xs font-bold uppercase text-on-surface-variant">แผนก</th>
                  <th className="px-6 py-3 text-xs font-bold uppercase text-on-surface-variant">ประเภท</th>
                  <th className="px-6 py-3 text-xs font-bold uppercase text-on-surface-variant">วันที่เริ่มงาน</th>
                  <th className="px-6 py-3 text-xs font-bold uppercase text-on-surface-variant">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-on-surface-variant">
                      ยังไม่มีข้อมูลพนักงานที่ตรงกับเงื่อนไข
                    </td>
                  </tr>
                )}
                {rows.map((e, idx) => {
                  const badge = STATUS_BADGE[e.employmentStatus] ?? { tone: "neutral" as const, label: e.employmentStatus };
                  return (
                    <tr key={e.id} className={idx % 2 === 1 ? "bg-row-zebra hover:bg-row-hover" : "hover:bg-row-hover"}>
                      <td className="px-6 py-4 text-sm">{e.employeeCode}</td>
                      <td className="px-6 py-4 text-sm font-semibold">
                        <Link href={`/employees/${e.id}`} className="flex items-center gap-3 hover:text-primary hover:underline">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container">
                            {e.photoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={e.photoUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">person</span>
                            )}
                          </span>
                          <span>
                            {e.firstName} {e.lastName}
                            {e.nickname && <span className="ml-1 font-normal text-on-surface-variant">({e.nickname})</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-sm">{e.positionTitle ?? "-"}</td>
                      <td className="px-6 py-4 text-sm">{e.departmentName ?? "-"}</td>
                      <td className="px-6 py-4 text-sm">{EMPLOYMENT_TYPE_TH[e.employmentType] ?? e.employmentType}</td>
                      <td className="px-6 py-4 text-sm">{new Date(e.hireDate).toLocaleDateString("th-TH")}</td>
                      <td className="px-6 py-4">
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-outline-variant bg-surface-container-lowest px-6 py-4">
            <p className="text-xs text-on-surface-variant">
              แสดง {rows.length === 0 ? 0 : (page - 1) * pageSize + 1} ถึง {(page - 1) * pageSize + rows.length} จาก {total} พนักงาน
            </p>
            <div className="flex items-center gap-1 text-xs">
              {page > 1 && (
                <Link className="rounded-md border border-outline-variant px-2 py-1" href={`?page=${page - 1}`}>
                  ก่อนหน้า
                </Link>
              )}
              <span className="px-2">
                หน้า {page} / {totalPages}
              </span>
              {page < totalPages && (
                <Link className="rounded-md border border-outline-variant px-2 py-1" href={`?page=${page + 1}`}>
                  ถัดไป
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
