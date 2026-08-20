import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { signAvatarUrls } from "@/lib/avatars";
import { AddReviewForm } from "./AddReviewForm";
import { ReviewRow } from "./ReviewRow";

export default async function ReviewsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data }, { data: employees }] = await Promise.all([
    supabase
      .from("performance_reviews")
      .select(
        "id, review_period, rating, strengths, improvements, employee:employees!performance_reviews_employee_id_fkey(employee_code, first_name, last_name, photo_url), reviewer:employees!performance_reviews_reviewer_employee_id_fkey(first_name, last_name)"
      )
      .eq("org_id", user.orgId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("employees")
      .select("id, employee_code, first_name, last_name")
      .eq("org_id", user.orgId)
      .in("employment_status", ["active", "probation"])
      .order("employee_code"),
  ]);

  const signedByPath = await signAvatarUrls(
    supabase,
    (data ?? []).map((r) => (r.employee as unknown as { photo_url: string | null } | null)?.photo_url)
  );

  const rows = (data ?? []).map((r) => {
    const emp = r.employee as unknown as { employee_code: string; first_name: string; last_name: string; photo_url: string | null } | null;
    const reviewer = r.reviewer as unknown as { first_name: string; last_name: string } | null;
    return {
      id: r.id,
      employeeCode: emp?.employee_code ?? "-",
      employeeName: emp ? `${emp.first_name} ${emp.last_name}` : "-",
      employeePhotoUrl: emp?.photo_url ? (signedByPath.get(emp.photo_url) ?? null) : null,
      reviewPeriod: r.review_period,
      rating: r.rating,
      strengths: r.strengths,
      improvements: r.improvements,
      reviewerName: reviewer ? `${reviewer.first_name} ${reviewer.last_name}` : null,
    };
  });

  return (
    <>
      <Topbar title="ประเมินผลงาน (KPI)" subtitle="ผลการประเมินพนักงานทั้งหมด" />
      <div className="space-y-4 p-4 md:p-8">
        <AddReviewForm employees={employees ?? []} />
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  <th className="px-4 py-3 font-bold text-on-surface-variant">พนักงาน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">รอบการประเมิน</th>
                  <th className="px-4 py-3 text-center font-bold text-on-surface-variant">คะแนน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">จุดแข็ง</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">จุดที่ควรพัฒนา</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">ผู้ประเมิน</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">
                      ยังไม่มีผลการประเมิน
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <ReviewRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
