"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { updateEmployeeAction, type UpdateEmployeeState } from "../../actions";
import { AddressBlock, type AddressValue } from "../../AddressBlock";
import { DateField } from "../../DateField";
import { BankNameSelect } from "../../BankNameSelect";
import { ThaiIdField } from "../../ThaiIdField";
import { BankAccountNumberField } from "../../BankAccountNumberField";
import { calculateProbationEndDate } from "@/lib/probation";

const TITLE_PREFIXES = ["นาย", "นาง", "นางสาว"];
const GENDERS = ["ชาย", "หญิง", "อื่น ๆ"];
const GENDER_IDENTITIES = ["ชาย", "หญิง", "LGBTQ+", "ไม่ระบุ"];

interface EmployeeRow {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  first_name_en: string | null;
  last_name_en: string | null;
  title_prefix: string | null;
  gender: string | null;
  gender_identity: string | null;
  phone: string | null;
  personal_email: string | null;
  hire_date: string;
  date_of_birth: string | null;
  probation_end_date: string | null;
  employment_type: string;
  branch_id: string | null;
  department_id: string | null;
  job_position_id: string | null;
  manager_employee_id: string | null;
  national_id: string | null;
  tax_id: string | null;
  social_security_id: string | null;
  id_card_address: AddressValue | null;
  current_address: AddressValue | null;
  attendance_exempt: boolean;
  tax_exempt: boolean;
}

const initialState: UpdateEmployeeState = {};

export function EditEmployeeForm({
  employee,
  currentBaseAmount,
  bankAccount,
  departments,
  positions,
  managers,
  branches,
}: {
  employee: EmployeeRow;
  currentBaseAmount: number | null;
  bankAccount: { bank_name: string; account_name: string; account_number: string } | null;
  departments: { id: string; name: string }[];
  positions: { id: string; title: string; department_id: string | null }[];
  managers: { id: string; first_name: string; last_name: string }[];
  branches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const boundAction = updateEmployeeAction.bind(null, employee.id);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);
  const [hireDate, setHireDate] = useState(employee.hire_date);
  const [dateOfBirth, setDateOfBirth] = useState(employee.date_of_birth ?? "");
  const [departmentId, setDepartmentId] = useState(employee.department_id ?? "");
  const positionsInDepartment = departmentId ? positions.filter((p) => p.department_id === departmentId) : positions;
  const [idCardAddress, setIdCardAddress] = useState<AddressValue>(employee.id_card_address ?? {});
  const [currentAddress, setCurrentAddress] = useState<AddressValue>(employee.current_address ?? {});
  const [sameAsIdCard, setSameAsIdCard] = useState(false);

  function patchIdCardAddress(patch: Partial<AddressValue>) {
    const next = { ...idCardAddress, ...patch };
    setIdCardAddress(next);
    if (sameAsIdCard) setCurrentAddress(next);
  }

  function toggleSameAsIdCard(checked: boolean) {
    setSameAsIdCard(checked);
    if (checked) setCurrentAddress(idCardAddress);
  }

  if (state.success) {
    router.push(`/employees/${employee.id}`);
    router.refresh();
  }

  return (
    <form action={formAction} className="max-w-3xl space-y-6 rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      {state.error && <div className="rounded-lg bg-error-container px-4 py-3 text-sm font-semibold text-on-error-container">{state.error}</div>}

      <fieldset className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="รหัสพนักงาน" name="employeeCode" defaultValue={employee.employee_code} required />
        <div className="space-y-1">
          <DateField label="วันที่เริ่มงาน" name="hireDate" required value={hireDate} onChange={setHireDate} />
          {hireDate && (
            <p className="text-xs text-on-surface-variant">
              ผ่านทดลองงาน (119 วัน):{" "}
              <span className="font-semibold text-primary">
                {new Date(calculateProbationEndDate(hireDate)!).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </p>
          )}
        </div>
        <Select label="คำนำหน้าชื่อ" name="titlePrefix" defaultValue={employee.title_prefix ?? ""} options={TITLE_PREFIXES.map((v) => ({ value: v, label: v }))} />
        <Field label="ชื่อ" name="firstName" defaultValue={employee.first_name} required />
        <Field label="นามสกุล" name="lastName" defaultValue={employee.last_name} required />
        <Field label="ชื่อ (ภาษาอังกฤษ)" name="firstNameEn" defaultValue={employee.first_name_en ?? ""} />
        <Field label="นามสกุล (ภาษาอังกฤษ)" name="lastNameEn" defaultValue={employee.last_name_en ?? ""} />
        <Field label="ชื่อเล่น" name="nickname" defaultValue={employee.nickname ?? ""} />
        <DateField label="วันเกิด" name="dateOfBirth" value={dateOfBirth} onChange={setDateOfBirth} />
        <Select label="เพศ" name="gender" defaultValue={employee.gender ?? ""} options={GENDERS.map((v) => ({ value: v, label: v }))} />
        <Select
          label="เพศสภาพ"
          name="genderIdentity"
          defaultValue={employee.gender_identity ?? ""}
          options={GENDER_IDENTITIES.map((v) => ({ value: v, label: v }))}
        />
        <Field label="เบอร์โทร" name="phone" defaultValue={employee.phone ?? ""} />
        <Field label="อีเมลส่วนตัว" name="personalEmail" type="email" defaultValue={employee.personal_email ?? ""} />
        <ThaiIdField label="เลขบัตรประชาชน" name="nationalId" defaultValue={employee.national_id} />
        <ThaiIdField label="เลขผู้เสียภาษี" name="taxId" defaultValue={employee.tax_id} />
        <ThaiIdField label="เลขประกันสังคม" name="socialSecurityId" defaultValue={employee.social_security_id} />
        <Select label="สาขา" name="branchId" defaultValue={employee.branch_id ?? ""} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-on-surface-variant" htmlFor="departmentId">
            แผนก
          </label>
          <select
            id="departmentId"
            name="departmentId"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm"
          >
            <option value="">-- ไม่ระบุ --</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <Select
          label="ตำแหน่ง"
          name="jobPositionId"
          defaultValue={employee.job_position_id ?? ""}
          options={positionsInDepartment.map((p) => ({ value: p.id, label: p.title }))}
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

      <label className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-4 text-sm font-semibold">
        <input type="checkbox" name="attendanceExempt" defaultChecked={employee.attendance_exempt} className="h-4 w-4 accent-primary" />
        ไม่ต้องลงเวลาเข้า-ออกงาน (คิดเงินเดือนเต็มตามปกติ โดยไม่แจ้งเตือนว่าข้อมูลเวลาขาดหาย)
      </label>

      <label className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-4 text-sm font-semibold">
        <input type="checkbox" name="taxExempt" defaultChecked={employee.tax_exempt} className="h-4 w-4 accent-primary" />
        ไม่ต้องหักภาษี ณ ที่จ่าย (พนักงานยื่นภาษีเอง ไม่ว่าเงินเดือนเท่าไหร่)
      </label>

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

      <div className="space-y-3 rounded-lg border border-outline-variant p-4">
        <p className="text-sm font-semibold text-on-surface">บัญชีธนาคาร</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <BankNameSelect name="bankName" defaultValue={bankAccount?.bank_name ?? ""} />
          <Field label="ชื่อบัญชี" name="bankAccountName" defaultValue={bankAccount?.account_name ?? ""} />
          <BankAccountNumberField defaultValue={bankAccount?.account_number} />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-outline-variant p-4">
        <p className="text-sm font-semibold text-on-surface">ที่อยู่ตามบัตรประชาชน</p>
        <AddressBlock namePrefix="idCard" value={idCardAddress} onChange={patchIdCardAddress} />
      </div>

      <div className="space-y-3 rounded-lg border border-outline-variant p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-on-surface">ที่อยู่ปัจจุบัน</p>
          <label className="flex items-center gap-2 text-xs text-on-surface-variant">
            <input type="checkbox" checked={sameAsIdCard} onChange={(e) => toggleSameAsIdCard(e.target.checked)} />
            เหมือนที่อยู่ตามบัตรประชาชน
          </label>
        </div>
        <AddressBlock
          namePrefix="current"
          value={currentAddress}
          onChange={(patch) => setCurrentAddress({ ...currentAddress, ...patch })}
          disabled={sameAsIdCard}
        />
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
