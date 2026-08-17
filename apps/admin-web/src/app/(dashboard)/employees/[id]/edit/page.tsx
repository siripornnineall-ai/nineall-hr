import { notFound } from "next/navigation";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listDepartments, listJobPositions, listManagerCandidates } from "@/lib/queries/employees";
import { Topbar } from "@/components/Topbar";
import { EditEmployeeForm } from "./EditEmployeeForm";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: employee }, departments, positions, managers, { data: branches }, { data: compensation }] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, employee_code, first_name, last_name, nickname, phone, personal_email, hire_date, employment_type, branch_id, department_id, job_position_id, manager_employee_id, national_id, id_card_address, current_address"
      )
      .eq("org_id", user.orgId)
      .eq("id", id)
      .maybeSingle(),
    listDepartments(user.orgId),
    listJobPositions(user.orgId),
    listManagerCandidates(user.orgId),
    supabase.from("branches").select("id, name").eq("org_id", user.orgId).is("deleted_at", null).order("name"),
    supabase
      .from("employee_compensation")
      .select("base_amount")
      .eq("employee_id", id)
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!employee) notFound();

  return (
    <>
      <Topbar title={`แก้ไขข้อมูล: ${employee.first_name} ${employee.last_name}`} subtitle={employee.employee_code} />
      <div className="p-4 md:p-8">
        <EditEmployeeForm
          employee={employee}
          currentBaseAmount={compensation?.base_amount ?? null}
          departments={departments}
          positions={positions}
          managers={managers.filter((m) => m.id !== employee.id)}
          branches={branches ?? []}
        />
      </div>
    </>
  );
}
