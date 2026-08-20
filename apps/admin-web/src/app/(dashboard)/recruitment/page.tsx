import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listDepartments, listJobPositions } from "@/lib/queries/employees";
import { Topbar } from "@/components/Topbar";
import { AddVacancyForm } from "./AddVacancyForm";
import { VacancyRow } from "./VacancyRow";

export default async function RecruitmentPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data }, departments, positions] = await Promise.all([
    supabase
      .from("job_vacancies")
      .select("id, title, headcount, status, departments(name), job_candidates(count)")
      .eq("org_id", user.orgId)
      .order("created_at", { ascending: false }),
    listDepartments(user.orgId),
    listJobPositions(user.orgId),
  ]);

  const rows = (data ?? []).map((v) => ({
    id: v.id,
    title: v.title,
    departmentName: (v.departments as unknown as { name: string } | null)?.name ?? null,
    headcount: v.headcount,
    status: v.status as "open" | "closed",
    candidateCount: (v.job_candidates as unknown as { count: number }[])[0]?.count ?? 0,
  }));

  return (
    <>
      <Topbar title="รับสมัครงาน" subtitle="ตำแหน่งงานที่เปิดรับทั้งหมด" />
      <div className="space-y-4 p-4 md:p-8">
        <AddVacancyForm departments={departments} positions={positions} />
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  <th className="px-4 py-3 font-bold text-on-surface-variant">ตำแหน่งงาน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">แผนก</th>
                  <th className="px-4 py-3 text-center font-bold text-on-surface-variant">จำนวนที่รับ</th>
                  <th className="px-4 py-3 text-center font-bold text-on-surface-variant">ผู้สมัคร</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">สถานะ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant">
                      ยังไม่มีตำแหน่งงานที่เปิดรับ
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <VacancyRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
