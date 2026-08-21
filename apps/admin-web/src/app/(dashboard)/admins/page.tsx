import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { AddAdminForm } from "./AddAdminForm";

const ROLE_LABEL_TH: Record<string, string> = {
  super_admin: "ผู้ดูแลระบบสูงสุด",
  hr: "ฝ่ายบุคคล",
  manager: "หัวหน้าทีม",
};

export default async function AdminsPage() {
  const user = await requireUser();
  requireRole(user, ["super_admin"]);
  const supabase = await createClient();

  const [{ data: admins }, { data: employees }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role, is_active, created_at, employees(employee_code, first_name, last_name)")
      .eq("org_id", user.orgId)
      .in("role", ["super_admin", "hr", "manager"])
      .order("created_at"),
    supabase
      .from("employees")
      .select("id, employee_code, first_name, last_name")
      .eq("org_id", user.orgId)
      .is("deleted_at", null)
      .eq("employment_status", "active")
      .order("employee_code"),
  ]);

  return (
    <>
      <Topbar title="ผู้ดูแลระบบ" subtitle="บัญชีผู้ดูแลระบบสูงสุด / ฝ่ายบุคคล / หัวหน้าทีมทั้งหมด" />
      <div className="grid grid-cols-1 gap-6 p-4 md:grid-cols-3 md:p-8">
        <div className="space-y-4 md:col-span-2">
          <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-container">
                    <th className="px-4 py-3 font-bold text-on-surface-variant">ชื่อ-นามสกุล</th>
                    <th className="px-4 py-3 font-bold text-on-surface-variant">อีเมล</th>
                    <th className="px-4 py-3 font-bold text-on-surface-variant">บทบาท</th>
                    <th className="px-4 py-3 font-bold text-on-surface-variant">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {(admins ?? []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-on-surface-variant">
                        ยังไม่มีบัญชีผู้ดูแลระบบ
                      </td>
                    </tr>
                  )}
                  {(admins ?? []).map((a) => {
                    const emp = a.employees as unknown as { employee_code: string; first_name: string; last_name: string } | null;
                    return (
                      <tr key={a.id}>
                        <td className="px-4 py-3 font-semibold">
                          {a.full_name}
                          {emp && <div className="text-xs font-normal text-on-surface-variant">พนักงาน {emp.employee_code}</div>}
                        </td>
                        <td className="px-4 py-3">{a.email ?? "-"}</td>
                        <td className="px-4 py-3">{ROLE_LABEL_TH[a.role] ?? a.role}</td>
                        <td className="px-4 py-3">
                          <Badge tone={a.is_active ? "success" : "neutral"}>{a.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน"}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <AddAdminForm employees={employees ?? []} />
        </div>
      </div>
    </>
  );
}
