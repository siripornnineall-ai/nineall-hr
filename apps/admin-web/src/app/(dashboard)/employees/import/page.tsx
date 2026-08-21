import { requireRole, requireUser } from "@/lib/auth";
import { Topbar } from "@/components/Topbar";
import { ImportEmployeesForm } from "./ImportEmployeesForm";

export default async function ImportEmployeesPage() {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  return (
    <>
      <Topbar title="นำเข้าพนักงานจาก Excel" subtitle="เพิ่มพนักงานหลายคนพร้อมกันด้วยไฟล์ Excel" />
      <div className="p-4 md:p-8">
        <ImportEmployeesForm />
      </div>
    </>
  );
}
