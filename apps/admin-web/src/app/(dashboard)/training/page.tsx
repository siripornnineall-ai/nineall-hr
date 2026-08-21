import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { signAvatarUrls } from "@/lib/avatars";
import { AddTrainingForm } from "./AddTrainingForm";
import { TrainingRow } from "./TrainingRow";

export default async function TrainingPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data }, { data: employees }] = await Promise.all([
    supabase
      .from("training_records")
      .select("id, title, provider, training_date, hours, notes, employees(employee_code, first_name, last_name, photo_url)")
      .eq("org_id", user.orgId)
      .order("training_date", { ascending: false })
      .limit(100),
    supabase
      .from("employees")
      .select("id, employee_code, first_name, last_name")
      .eq("org_id", user.orgId)
      .is("deleted_at", null)
      .in("employment_status", ["active", "probation"])
      .order("employee_code"),
  ]);

  const signedByPath = await signAvatarUrls(
    supabase,
    (data ?? []).map((r) => (r.employees as unknown as { photo_url: string | null } | null)?.photo_url)
  );

  const rows = (data ?? []).map((r) => {
    const emp = r.employees as unknown as { employee_code: string; first_name: string; last_name: string; photo_url: string | null } | null;
    return {
      id: r.id,
      employeeCode: emp?.employee_code ?? "-",
      employeeName: emp ? `${emp.first_name} ${emp.last_name}` : "-",
      employeePhotoUrl: emp?.photo_url ? (signedByPath.get(emp.photo_url) ?? null) : null,
      title: r.title,
      provider: r.provider,
      trainingDate: r.training_date,
      hours: r.hours != null ? Number(r.hours) : null,
      notes: r.notes,
    };
  });

  return (
    <>
      <Topbar title="การอบรม" subtitle="ประวัติการอบรม/สัมมนาของพนักงาน" />
      <div className="space-y-4 p-4 md:p-8">
        <AddTrainingForm employees={employees ?? []} />
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  <th className="px-4 py-3 font-bold text-on-surface-variant">พนักงาน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">หลักสูตร</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">ผู้จัดอบรม</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">วันที่</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">ชั่วโมง</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">หมายเหตุ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">
                      ยังไม่มีประวัติการอบรม
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <TrainingRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
