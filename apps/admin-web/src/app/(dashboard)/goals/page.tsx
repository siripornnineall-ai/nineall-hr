import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { TaskBoardAdmin } from "./TaskBoardAdmin";

// Department task boards + performance % (owner 2026-11-13). HR / admin choose each department's head, see every
// board and the scores of all departments; only the department head approves cards (enforced in the database).
export default async function GoalsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const canManage = ["super_admin", "hr"].includes(user.role);

  const [{ data: departments }, { data: employees }] = await Promise.all([
    supabase.from("departments").select("id, name, head_employee_id").eq("org_id", user.orgId).is("deleted_at", null).order("name"),
    supabase
      .from("employees")
      .select("id, employee_code, first_name, last_name, nickname, department_id")
      .eq("org_id", user.orgId)
      .is("deleted_at", null)
      .in("employment_status", ["active", "probation"])
      .order("employee_code"),
  ]);

  return (
    <>
      <Topbar title="บอร์ดงาน & KPI" subtitle="งานของแต่ละแผนกแบบ Trello · หัวหน้าแผนกเป็นผู้อนุมัติ · คะแนนผลงานเป็น %" />
      <div className="p-4 md:p-8">
        <TaskBoardAdmin
          orgId={user.orgId}
          myEmployeeId={user.employeeId}
          canManage={canManage}
          departments={departments ?? []}
          employees={employees ?? []}
        />
      </div>
    </>
  );
}
