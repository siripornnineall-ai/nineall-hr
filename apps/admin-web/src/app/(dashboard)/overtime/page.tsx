import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { signAvatarUrls } from "@/lib/avatars";
import { OtRow } from "./OtRow";

function parseYear(year: string | undefined): number {
  const n = Number(year);
  return Number.isInteger(n) && n > 2000 ? n : new Date().getFullYear();
}

export default async function OvertimePage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await requireUser();
  const { year: yearParam } = await searchParams;
  const supabase = await createClient();

  const year = parseYear(yearParam);

  const { data } = await supabase
    .from("overtime_requests")
    .select(
      "id, work_date, start_time, end_time, requested_hours, rate_multiplier, status, reason, task_description, employees(employee_code, first_name, last_name, photo_url)"
    )
    .eq("org_id", user.orgId)
    .gte("work_date", `${year}-01-01`)
    .lte("work_date", `${year}-12-31`)
    .order("work_date", { ascending: false });

  const signedByPath = await signAvatarUrls(
    supabase,
    (data ?? []).map((r) => (r.employees as unknown as { photo_url: string | null } | null)?.photo_url)
  );

  const rows = (data ?? []).map((r) => {
    const emp = r.employees as unknown as { employee_code: string; first_name: string; last_name: string; photo_url: string | null } | null;
    return {
      id: r.id,
      workDate: r.work_date,
      startTime: r.start_time,
      endTime: r.end_time,
      requestedHours: Number(r.requested_hours),
      rateMultiplier: Number(r.rate_multiplier),
      status: r.status,
      taskDescription: r.task_description,
      reason: r.reason,
      employeeCode: emp?.employee_code ?? "-",
      employeeName: emp ? `${emp.first_name} ${emp.last_name}` : "-",
      employeePhotoUrl: emp?.photo_url ? (signedByPath.get(emp.photo_url) ?? null) : null,
    };
  });

  return (
    <>
      <Topbar title="ล่วงเวลา (OT)" subtitle="คำขอ OT ทั้งหมด" />
      <div className="space-y-4 p-4 md:p-8">
        <div className="flex items-center justify-end gap-2">
          <Link href={`?year=${year - 1}`} className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-semibold hover:bg-surface-variant/20">
            ← ปี {year - 1 + 543}
          </Link>
          <span className="min-w-[80px] text-center text-sm font-bold text-on-surface">ปี {year + 543}</span>
          <Link href={`?year=${year + 1}`} className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-semibold hover:bg-surface-variant/20">
            ปี {year + 1 + 543} →
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  <th className="px-4 py-3 font-bold text-on-surface-variant">พนักงาน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">วันที่</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">เวลา</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">ชั่วโมง</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">อัตรา</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">สถานะ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">
                      ไม่มีคำขอ OT ในปี {year + 543}
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <OtRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
