import { requireRole, requireUser } from "@/lib/auth";
import { listDepartments, listJobPositions, listManagerCandidates } from "@/lib/queries/employees";
import { Topbar } from "@/components/Topbar";
import { NewEmployeeForm } from "./NewEmployeeForm";

export default async function NewEmployeePage() {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  const [departments, positions, managers] = await Promise.all([
    listDepartments(user.orgId),
    listJobPositions(user.orgId),
    listManagerCandidates(user.orgId),
  ]);

  return (
    <>
      <Topbar title="เพิ่มพนักงานใหม่" subtitle="กรอกข้อมูลพนักงานให้ครบถ้วน" />
      <div className="p-4 md:p-8">
        <NewEmployeeForm departments={departments} positions={positions} managers={managers} />
      </div>
    </>
  );
}
