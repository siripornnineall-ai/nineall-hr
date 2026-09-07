import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { signAvatarUrls } from "@/lib/avatars";
import { OrgChartTree, type OrgChartEmployee } from "./OrgChartTree";

export default async function OrgChartPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: employees }, { data: departments }, { data: secondaryManagers }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, first_name, last_name, photo_url, manager_employee_id, department_id, job_positions(title), departments(name)")
      .eq("org_id", user.orgId)
      .is("deleted_at", null)
      .in("employment_status", ["active", "probation"])
      .order("first_name"),
    supabase.from("departments").select("id, name").eq("org_id", user.orgId).is("deleted_at", null).order("name"),
    supabase.from("employee_secondary_managers").select("id, employee_id, manager_employee_id").eq("org_id", user.orgId),
  ]);

  const signedByPath = await signAvatarUrls(supabase, (employees ?? []).map((e) => e.photo_url));

  const nodes: OrgChartEmployee[] = (employees ?? []).map((e) => ({
    id: e.id,
    name: `${e.first_name} ${e.last_name}`,
    photoUrl: e.photo_url ? (signedByPath.get(e.photo_url) ?? null) : null,
    position: (e.job_positions as unknown as { title: string } | null)?.title ?? null,
    departmentId: e.department_id,
    departmentName: (e.departments as unknown as { name: string } | null)?.name ?? null,
    managerId: e.manager_employee_id,
  }));

  return (
    <>
      <Topbar title="ผังองค์กร" subtitle="โครงสร้างสายบังคับบัญชาของทั้งบริษัท" backHref="/dashboard" />
      <div className="space-y-4 p-4 md:p-8">
        <div className="flex items-center justify-between">
          <p className="text-sm text-on-surface-variant">ทั้งหมด {nodes.length} คน — กดที่การ์ดเพื่อดูรายละเอียด</p>
          {["super_admin", "hr"].includes(user.role) && (
            <Link href="/employees/new" className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm">
              <span className="material-symbols-outlined text-[18px]">add</span>
              เพิ่มพนักงาน
            </Link>
          )}
        </div>

        <OrgChartTree
          employees={nodes}
          departments={departments ?? []}
          secondaryManagers={(secondaryManagers ?? []).map((m) => ({ id: m.id, employeeId: m.employee_id, managerId: m.manager_employee_id }))}
          canManage={["super_admin", "hr"].includes(user.role)}
        />
      </div>
    </>
  );
}
