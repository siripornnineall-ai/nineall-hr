import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { NewLeaveTypeForm } from "./NewLeaveTypeForm";
import { OrgInfoForm } from "./OrgInfoForm";
import { EditableList } from "./EditableList";
import {
  createBranchAction,
  updateBranchAction,
  createDepartmentAction,
  updateDepartmentAction,
  createTeamAction,
  updateTeamAction,
  createJobPositionAction,
  updateJobPositionAction,
  createShiftAction,
  updateShiftAction,
  createWorkLocationAction,
  updateWorkLocationAction,
  createLeaveTypeQuickAction,
  updateLeaveTypeAction,
} from "./actions";

export default async function SettingsPage() {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const [
    { data: org },
    { data: leaveTypes },
    { data: shifts },
    { data: locations },
    { data: branches },
    { data: departments },
    { data: teams },
    { data: positions },
  ] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", user.orgId).single(),
    supabase.from("leave_types").select("id, code, name_th, is_paid, is_active").eq("org_id", user.orgId).order("sort_order"),
    supabase.from("work_shifts").select("id, name, start_time, end_time, grace_minutes_late").eq("org_id", user.orgId),
    supabase.from("work_locations").select("id, name, latitude, longitude, radius_meters").eq("org_id", user.orgId),
    supabase.from("branches").select("id, name, address").eq("org_id", user.orgId),
    supabase.from("departments").select("id, name, name_en").eq("org_id", user.orgId),
    supabase.from("teams").select("id, name, department_id, departments(name)").eq("org_id", user.orgId),
    supabase.from("job_positions").select("id, title, title_en, department_id, departments(name)").eq("org_id", user.orgId),
  ]);

  const departmentOptions = (departments ?? []).map((d) => ({ value: d.id, label: d.name }));

  return (
    <>
      <Topbar title="Settings" subtitle="ตั้งค่าระบบ" />
      <div className="space-y-6 p-4 md:p-8">
        <OrgInfoForm name={org?.name ?? ""} timezone={org?.timezone ?? ""} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <EditableList
            title="ประเภทการลา"
            fields={[
              { key: "code", label: "รหัส", type: "text" },
              { key: "nameTh", label: "ชื่อภาษาไทย", type: "text" },
              { key: "isPaid", label: "ได้รับค่าจ้าง", type: "checkbox" },
            ]}
            rows={(leaveTypes ?? []).map((lt) => ({ id: lt.id, code: lt.code, nameTh: lt.name_th, isPaid: lt.is_paid }))}
            displayLabel={(row) => String(row.nameTh)}
            displaySubLabel={(row) => (row.isPaid ? "ได้รับค่าจ้าง" : "ไม่รับค่าจ้าง")}
            onCreate={createLeaveTypeQuickAction}
            onSave={updateLeaveTypeAction}
            emptyLabel="ยังไม่มีประเภทการลา"
            addLabel="เพิ่มแบบย่อ"
          />
          <NewLeaveTypeForm />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <EditableList
            title="กะการทำงาน"
            fields={[
              { key: "name", label: "ชื่อกะ", type: "text" },
              { key: "startTime", label: "เวลาเข้า", type: "time" },
              { key: "endTime", label: "เวลาออก", type: "time" },
              { key: "graceMinutesLate", label: "ผ่อนผัน (นาที)", type: "number", optional: true },
            ]}
            rows={(shifts ?? []).map((s) => ({
              id: s.id,
              name: s.name,
              startTime: s.start_time,
              endTime: s.end_time,
              graceMinutesLate: s.grace_minutes_late,
            }))}
            displayLabel={(row) => String(row.name)}
            displaySubLabel={(row) => `${row.startTime} - ${row.endTime} (ผ่อนผัน ${row.graceMinutesLate} นาที)`}
            onCreate={createShiftAction}
            onSave={updateShiftAction}
            emptyLabel="ยังไม่มีการตั้งค่ากะ"
            addLabel="เพิ่มกะ"
          />
          <EditableList
            title="สถานที่ทำงาน / รัศมี GPS"
            fields={[
              { key: "name", label: "ชื่อสถานที่", type: "text" },
              { key: "latitude", label: "ละติจูด", type: "number" },
              { key: "longitude", label: "ลองจิจูด", type: "number" },
              { key: "radiusMeters", label: "รัศมี (เมตร)", type: "number", optional: true },
            ]}
            rows={(locations ?? []).map((l) => ({
              id: l.id,
              name: l.name,
              latitude: l.latitude,
              longitude: l.longitude,
              radiusMeters: l.radius_meters,
            }))}
            displayLabel={(row) => String(row.name)}
            displaySubLabel={(row) => `${row.radiusMeters} เมตร`}
            onCreate={createWorkLocationAction}
            onSave={updateWorkLocationAction}
            emptyLabel="ยังไม่มีสถานที่ทำงาน"
            addLabel="เพิ่มสถานที่"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <EditableList
            title="สาขา"
            fields={[
              { key: "name", label: "ชื่อสาขา", type: "text" },
              { key: "address", label: "ที่อยู่", type: "text", optional: true },
            ]}
            rows={(branches ?? []).map((b) => ({ id: b.id, name: b.name, address: b.address }))}
            displayLabel={(row) => String(row.name)}
            displaySubLabel={(row) => String(row.address ?? "")}
            onCreate={createBranchAction}
            onSave={updateBranchAction}
            emptyLabel="ยังไม่มีสาขา"
            addLabel="เพิ่มสาขา"
          />
          <EditableList
            title="แผนก"
            fields={[
              { key: "name", label: "ชื่อแผนก", type: "text" },
              { key: "nameEn", label: "ชื่อภาษาอังกฤษ", type: "text", optional: true },
            ]}
            rows={(departments ?? []).map((d) => ({ id: d.id, name: d.name, nameEn: d.name_en }))}
            displayLabel={(row) => String(row.name)}
            displaySubLabel={(row) => String(row.nameEn ?? "")}
            onCreate={createDepartmentAction}
            onSave={updateDepartmentAction}
            emptyLabel="ยังไม่มีแผนก"
            addLabel="เพิ่มแผนก"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <EditableList
            title="ทีม"
            fields={[
              { key: "name", label: "ชื่อทีม", type: "text" },
              { key: "departmentId", label: "แผนก", type: "select", options: departmentOptions, optional: true },
            ]}
            rows={(teams ?? []).map((t) => ({
              id: t.id,
              name: t.name,
              departmentId: t.department_id,
              departmentName: (t.departments as unknown as { name: string } | null)?.name ?? null,
            }))}
            displayLabel={(row) => String(row.name)}
            displaySubLabel={(row) => String(row.departmentName ?? "")}
            onCreate={createTeamAction}
            onSave={updateTeamAction}
            emptyLabel="ยังไม่มีทีม"
            addLabel="เพิ่มทีม"
          />
          <EditableList
            title="ตำแหน่งงาน"
            fields={[
              { key: "title", label: "ชื่อตำแหน่ง", type: "text" },
              { key: "titleEn", label: "ชื่อภาษาอังกฤษ", type: "text", optional: true },
              { key: "departmentId", label: "แผนก", type: "select", options: departmentOptions, optional: true },
            ]}
            rows={(positions ?? []).map((p) => ({
              id: p.id,
              title: p.title,
              titleEn: p.title_en,
              departmentId: p.department_id,
              departmentName: (p.departments as unknown as { name: string } | null)?.name ?? null,
            }))}
            displayLabel={(row) => String(row.title)}
            displaySubLabel={(row) => String(row.departmentName ?? "")}
            onCreate={createJobPositionAction}
            onSave={updateJobPositionAction}
            emptyLabel="ยังไม่มีตำแหน่งงาน"
            addLabel="เพิ่มตำแหน่ง"
          />
        </div>

        <section className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-6 text-sm text-on-surface-variant">
          หน้าตั้งค่าขั้นสูง (ภาษี/ประกันสังคมแบบมีเวอร์ชัน, ลำดับผู้อนุมัติ, สิทธิ์ผู้ใช้แบบละเอียด, รูปแบบสลิป) อยู่ระหว่างพัฒนา — ดูสถานะที่{" "}
          <code>IMPLEMENTATION_STATUS.md</code> ปัจจุบันตั้งค่าเหล่านี้แก้ไขได้โดยตรงผ่านตาราง <code>policy_settings</code> /{" "}
          <code>system_settings</code> ใน Supabase
        </section>
      </div>
    </>
  );
}
