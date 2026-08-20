import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { signAvatarUrls } from "@/lib/avatars";
import { ReimbursementRow } from "./ReimbursementRow";

export default async function ReimbursementPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("reimbursement_requests")
    .select("id, expense_date, category, amount, description, status, receipt_file_path, employees(employee_code, first_name, last_name, photo_url)")
    .eq("org_id", user.orgId)
    .order("expense_date", { ascending: false })
    .limit(50);

  const signedAvatarByPath = await signAvatarUrls(
    supabase,
    (data ?? []).map((r) => (r.employees as unknown as { photo_url: string | null } | null)?.photo_url)
  );

  const rows = await Promise.all(
    (data ?? []).map(async (r) => {
      const emp = r.employees as unknown as { employee_code: string; first_name: string; last_name: string; photo_url: string | null } | null;
      let receiptUrl: string | null = null;
      if (r.receipt_file_path) {
        const { data: signed } = await supabase.storage.from("attachments").createSignedUrl(r.receipt_file_path, 3600);
        receiptUrl = signed?.signedUrl ?? null;
      }
      return {
        id: r.id,
        expenseDate: r.expense_date,
        category: r.category,
        amount: Number(r.amount),
        description: r.description,
        status: r.status,
        receiptUrl,
        employeeCode: emp?.employee_code ?? "-",
        employeeName: emp ? `${emp.first_name} ${emp.last_name}` : "-",
        employeePhotoUrl: emp?.photo_url ? (signedAvatarByPath.get(emp.photo_url) ?? null) : null,
      };
    })
  );

  return (
    <>
      <Topbar title="เบิกค่าใช้จ่ายคืน" subtitle="คำขอเบิกค่าใช้จ่ายทั้งหมด" />
      <div className="space-y-4 p-4 md:p-8">
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  <th className="px-4 py-3 font-bold text-on-surface-variant">พนักงาน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">วันที่</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">หมวดหมู่</th>
                  <th className="px-4 py-3 text-right font-bold text-on-surface-variant">จำนวนเงิน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">รายละเอียด</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">ใบเสร็จ</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">สถานะ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-on-surface-variant">
                      ยังไม่มีคำขอเบิกค่าใช้จ่าย
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <ReimbursementRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
