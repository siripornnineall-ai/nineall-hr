"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { updateEmployeeAction, type UpdateEmployeeState } from "../../actions";

interface EmployeeRow {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  phone: string | null;
  personal_email: string | null;
  hire_date: string;
  employment_type: string;
  branch_id: string | null;
  department_id: string | null;
  team_id: string | null;
  job_position_id: string | null;
  manager_employee_id: string | null;
}

const initialState: UpdateEmployeeState = {};

export function EditEmployeeForm({
  employee,
  currentBaseAmount,
  departments,
  teams,
  positions,
  managers,
  branches,
}: {
  employee: EmployeeRow;
  currentBaseAmount: number | null;
  departments: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  positions: { id: string; title: string }[];
  managers: { id: string; first_name: string; last_name: string }[];
  branches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const boundAction = updateEmployeeAction.bind(null, employee.id);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  if (state.success) {
    router.push(`/employees/${employee.id}`);
    router.refresh();
  }

  return (
    <form action={formAction} className="max-w-3xl space-y-6 rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      {state.error && <div className="rounded-lg bg-error-container px-4 py-3 text-sm font-semibold text-on-error-container">{state.error}</div>}

      <fieldset className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="รหัสพนักงาน" name="employeeCode" defaultValue={employee.employee_code} required />
        <Field label="วันที่เริ่มงาน" name="hireDate" type="date" defaultValue={employee.hire_date} required />
        <Field label="ชื่อ" name="firstName" defaultValue={employee.first_name} required />
        <Field label="นามสกุล" name="lastName" defaultValue={employee.last_name} required />
        <Field label="ชื่อเล่น" name="nickname" defaultValue={employee.nickname ?? ""} />
        <Field label="เบอร์โทร" name="phone" defaultValue={employee.phone ?? ""} />
        <Field label="อีเมลส่วนตัว" name="personalEmail" type="email" defaultValue={employee.personal_email ?? ""} />
        <Select label="สาขา" name="branchId" defaultValue={employee.branch_id ?? ""} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
        <Select
          label="แผนก"
          name="departmentId"
          defaultValue={employee.department_id ?? ""}
          options={departments.map((d) => ({ value: d.id, label: d.name }))}
        />
        <Select label="ทีม" name="teamId" defaultValue={employee.team_id ?? ""} options={teams.map((t) => ({ value: t.id, label: t.name }))} />
        <Select
          label="ตำแหน่ง"
          name="jobPositionId"
          defaultValue={employee.job_position_id ?? ""}
          options={positions.map((p) => ({ value: p.id, label: p.title }))}
        />
        <Select
          label="หัวหน้างาน"
          name="managerEmployeeId"
          defaultValue={employee.manager_employee_id ?? ""}
          options={managers.map((m) => ({ value: m.id, label: `${m.first_name} ${m.last_name}` }))}
        />
        <Select
          label="ประเภทการจ้าง"
          name="employmentType"
          defaultValue={employee.employment_type}
          options={[
            { value: "monthly", label: "รายเดือน (ประจำ)" },
            { value: "daily", label: "รายวัน" },
            { value: "hourly", label: "รายชั่วโมง" },
            { value: "part_time", label: "พาร์ทไทม์" },
            { value: "contract", label: "สัญญาจ้าง" },
          ]}
        />
      </fieldset>

      <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
        <label className="mb-1 block text-sm font-semibold text-on-surface-variant" htmlFor="newBaseAmountBaht">
          เงินเดือน/อัตราค่าจ้างใหม่ (บาท)
        </label>
        <input
          id="newBaseAmountBaht"
          name="newBaseAmountBaht"
          type="number"
          step="0.01"
          className="h-11 w-full max-w-xs rounded-lg border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary"
        />
        <p className="mt-1 text-xs text-on-surface-variant">
          ปัจจุบัน: {currentBaseAmount != null ? `${currentBaseAmount.toLocaleString("th-TH")} บาท` : "ยังไม่มีข้อมูล"} — เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน
          กรอกเฉพาะเมื่อมีการปรับเงินเดือน (จะบันทึกเป็นอัตราใหม่ตั้งแต่วันนี้ ประวัติอัตราเดิมยังเก็บไว้)
        </p>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="h-12 rounded-xl bg-primary px-8 font-bold text-white shadow-md disabled:opacity-60"
        >
          {isPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-semibold text-on-surface-variant" htmlFor={name}>
        {label}
        {required && <span className="text-primary"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}

function Select({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-semibold text-on-surface-variant" htmlFor={name}>
        {label}
      </label>
      <select id={name} name={name} defaultValue={defaultValue} className="h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm">
        <option value="">-- ไม่ระบุ --</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
