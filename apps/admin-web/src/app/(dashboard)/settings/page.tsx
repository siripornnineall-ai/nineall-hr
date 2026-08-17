import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { NewLeaveTypeForm } from "./NewLeaveTypeForm";
import { OrgInfoForm } from "./OrgInfoForm";
import { EditableList } from "./EditableList";
import { THAI_FIXED_HOLIDAYS } from "@/lib/thaiHolidays";
import {
  createBranchAction,
  updateBranchAction,
  deleteBranchAction,
  createDepartmentAction,
  updateDepartmentAction,
  deleteDepartmentAction,
  createJobPositionAction,
  updateJobPositionAction,
  deleteJobPositionAction,
  createShiftAction,
  updateShiftAction,
  deleteShiftAction,
  createWorkLocationAction,
  updateWorkLocationAction,
  deleteWorkLocationAction,
  createLeaveTypeQuickAction,
  updateLeaveTypeAction,
  deleteLeaveTypeAction,
  createHolidayAction,
  updateHolidayAction,
  deleteHolidayAction,
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
    { data: positions },
  ] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", user.orgId).single(),
    supabase.from("leave_types").select("id, code, name_th, is_paid, is_active").eq("org_id", user.orgId).order("sort_order"),
    supabase.from("work_shifts").select("id, name, start_time, end_time, grace_minutes_late").eq("org_id", user.orgId),
    supabase.from("work_locations").select("id, name, latitude, longitude, radius_meters").eq("org_id", user.orgId),
    supabase.from("branches").select("id, name, address").eq("org_id", user.orgId),
    supabase.from("departments").select("id, name, name_en").eq("org_id", user.orgId),
    supabase.from("job_positions").select("id, title, title_en, department_id, departments(name)").eq("org_id", user.orgId),
  ]);

  const { data: holidays } = await supabase
    .from("company_holidays")
    .select("id, name, holiday_date")
    .eq("org_id", user.orgId)
    .order("holiday_date");

  const { data: leavePolicyRows } = await supabase
    .from("leave_policies")
    .select(
      "leave_type_id, days_per_year, allow_half_day, allow_hourly, requires_attachment, attachment_required_after_days, notice_days_required, min_service_months, effective_date"
    )
    .in("leave_type_id", (leaveTypes ?? []).map((lt) => lt.id))
    .order("effective_date", { ascending: false });
  const latestPolicyByType = new Map<string, NonNullable<typeof leavePolicyRows>[number]>();
  for (const p of leavePolicyRows ?? []) {
    if (!latestPolicyByType.has(p.leave_type_id)) latestPolicyByType.set(p.leave_type_id, p);
  }

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
              { key: "daysPerYear", label: "จำนวนวัน/ปี", type: "number", optional: true },
              { key: "allowHalfDay", label: "ลาครึ่งวันได้ (เช้า/บ่าย)", type: "checkbox" },
              { key: "allowHourly", label: "ลารายชั่วโมงได้", type: "checkbox" },
              { key: "requiresAttachment", label: "ต้องแนบเอกสาร", type: "checkbox" },
              { key: "attachmentRequiredAfterDays", label: "แนบเอกสารเมื่อลาตั้งแต่ (วัน) — 0 = ทุกครั้ง", type: "number", optional: true },
              { key: "noticeDaysRequired", label: "แจ้งล่วงหน้า (วัน)", type: "number", optional: true },
              { key: "minServiceMonths", label: "ต้องทำงานครบ (เดือน) ก่อนมีสิทธิ", type: "number", optional: true },
            ]}
            rows={(leaveTypes ?? []).map((lt) => {
              const policy = latestPolicyByType.get(lt.id);
              const minMonths = policy?.min_service_months ?? 0;
              return {
                id: lt.id,
                code: lt.code,
                nameTh: lt.name_th,
                isPaid: lt.is_paid,
                daysPerYear: policy?.days_per_year ?? 0,
                allowHalfDay: policy?.allow_half_day ?? true,
                allowHourly: policy?.allow_hourly ?? false,
                requiresAttachment: policy?.requires_attachment ?? false,
                attachmentRequiredAfterDays: policy?.attachment_required_after_days ?? 0,
                noticeDaysRequired: policy?.notice_days_required ?? 0,
                minServiceMonths: minMonths,
                label: lt.name_th,
                subLabel: `${lt.is_paid ? "ได้รับค่าจ้าง" : "ไม่รับค่าจ้าง"} • ${policy?.days_per_year ?? 0} วัน/ปี${minMonths > 0 ? ` • ต้องทำงานครบ ${minMonths} เดือน` : ""}${policy?.requires_attachment ? ` • แนบเอกสาร${(policy?.attachment_required_after_days ?? 0) > 0 ? `ตั้งแต่ ${policy.attachment_required_after_days} วัน` : "ทุกครั้ง"}` : ""}`,
              };
            })}
            onCreate={createLeaveTypeQuickAction}
            onSave={updateLeaveTypeAction}
            onDelete={deleteLeaveTypeAction}
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
              label: s.name,
              subLabel: `${s.start_time} - ${s.end_time} (ผ่อนผัน ${s.grace_minutes_late} นาที)`,
            }))}
            onCreate={createShiftAction}
            onSave={updateShiftAction}
            onDelete={deleteShiftAction}
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
              label: l.name,
              subLabel: `${l.radius_meters} เมตร`,
            }))}
            onCreate={createWorkLocationAction}
            onSave={updateWorkLocationAction}
            onDelete={deleteWorkLocationAction}
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
            rows={(branches ?? []).map((b) => ({ id: b.id, name: b.name, address: b.address, label: b.name, subLabel: b.address ?? "" }))}
            onCreate={createBranchAction}
            onSave={updateBranchAction}
            onDelete={deleteBranchAction}
            emptyLabel="ยังไม่มีสาขา"
            addLabel="เพิ่มสาขา"
          />
          <EditableList
            title="แผนก"
            fields={[
              { key: "name", label: "ชื่อแผนก", type: "text" },
              { key: "nameEn", label: "ชื่อภาษาอังกฤษ", type: "text", optional: true },
            ]}
            rows={(departments ?? []).map((d) => ({ id: d.id, name: d.name, nameEn: d.name_en, label: d.name, subLabel: d.name_en ?? "" }))}
            onCreate={createDepartmentAction}
            onSave={updateDepartmentAction}
            onDelete={deleteDepartmentAction}
            emptyLabel="ยังไม่มีแผนก"
            addLabel="เพิ่มแผนก"
          />
        </div>

        <EditableList
          title="ตำแหน่งงาน"
          fields={[
            { key: "title", label: "ชื่อตำแหน่ง", type: "text" },
            { key: "titleEn", label: "ชื่อภาษาอังกฤษ", type: "text", optional: true },
            { key: "departmentId", label: "แผนก", type: "select", options: departmentOptions, optional: true },
          ]}
          rows={(positions ?? []).map((p) => {
            const departmentName = (p.departments as unknown as { name: string } | null)?.name ?? "";
            return {
              id: p.id,
              title: p.title,
              titleEn: p.title_en,
              departmentId: p.department_id,
              label: p.title,
              subLabel: departmentName,
            };
          })}
          onCreate={createJobPositionAction}
          onSave={updateJobPositionAction}
          onDelete={deleteJobPositionAction}
          emptyLabel="ยังไม่มีตำแหน่งงาน"
          addLabel="เพิ่มตำแหน่ง"
        />

        <EditableList
          title="วันหยุดบริษัท"
          fields={[
            { key: "name", label: "ชื่อวันหยุด", type: "text" },
            { key: "holidayDate", label: "วันที่", type: "date" },
          ]}
          rows={(holidays ?? []).map((h) => ({
            id: h.id,
            name: h.name,
            holidayDate: h.holiday_date,
            label: h.name,
            subLabel: new Date(h.holiday_date).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }),
          }))}
          onCreate={createHolidayAction}
          onSave={updateHolidayAction}
          onDelete={deleteHolidayAction}
          dateNameSuggestions={{ dateField: "holidayDate", nameField: "name", byMonthDay: THAI_FIXED_HOLIDAYS }}
          emptyLabel="ยังไม่มีวันหยุดบริษัท"
          addLabel="เพิ่มวันหยุด"
        />

        <section className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-6 text-sm text-on-surface-variant">
          หน้าตั้งค่าขั้นสูง (ภาษี/ประกันสังคมแบบมีเวอร์ชัน, ลำดับผู้อนุมัติ, สิทธิ์ผู้ใช้แบบละเอียด, รูปแบบสลิป) อยู่ระหว่างพัฒนา — ดูสถานะที่{" "}
          <code>IMPLEMENTATION_STATUS.md</code> ปัจจุบันตั้งค่าเหล่านี้แก้ไขได้โดยตรงผ่านตาราง <code>policy_settings</code> /{" "}
          <code>system_settings</code> ใน Supabase
        </section>
      </div>
    </>
  );
}
