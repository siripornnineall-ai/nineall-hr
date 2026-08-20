import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { CopyApplyLink } from "./CopyApplyLink";
import { CandidateRow } from "./CandidateRow";

export default async function VacancyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data: vacancy } = await supabase
    .from("job_vacancies")
    .select("id, title, description, headcount, status, departments(name), job_positions(title)")
    .eq("org_id", user.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!vacancy) notFound();

  const { data: candidates } = await supabase
    .from("job_candidates")
    .select("id, full_name, phone, email, cover_note, status, created_at")
    .eq("vacancy_id", id)
    .order("created_at", { ascending: false });

  const department = vacancy.departments as unknown as { name: string } | null;
  const position = vacancy.job_positions as unknown as { title: string } | null;

  return (
    <>
      <Topbar title={vacancy.title} subtitle={`${department?.name ?? "-"} · รับ ${vacancy.headcount} อัตรา`} />
      <div className="space-y-4 p-4 md:p-8">
        <div className="space-y-3 rounded-xl border border-outline-variant bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-on-surface">ลิงก์สมัครงานสาธารณะ (ส่งให้ผู้สมัครได้เลย ไม่ต้องล็อกอิน)</p>
          <CopyApplyLink vacancyId={vacancy.id} />
          {vacancy.description && <p className="whitespace-pre-wrap text-sm text-on-surface-variant">{vacancy.description}</p>}
          {position && <p className="text-xs text-on-surface-variant">ตำแหน่งอ้างอิง: {position.title}</p>}
        </div>

        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  <th className="px-4 py-3 font-bold text-on-surface-variant">ชื่อ-นามสกุล</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">ติดต่อ</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">ข้อความ</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">วันที่สมัคร</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">สถานะ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {(candidates ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant">
                      ยังไม่มีผู้สมัครสำหรับตำแหน่งนี้
                    </td>
                  </tr>
                )}
                {(candidates ?? []).map((c) => (
                  <CandidateRow
                    key={c.id}
                    row={{
                      id: c.id,
                      fullName: c.full_name,
                      phone: c.phone,
                      email: c.email,
                      coverNote: c.cover_note,
                      status: c.status,
                      createdAt: c.created_at,
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
