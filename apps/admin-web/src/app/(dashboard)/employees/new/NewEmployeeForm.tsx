"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createEmployeeAction, type CreateEmployeeState } from "../actions";
import { AddressBlock, type AddressValue } from "../AddressBlock";
import { DateField } from "../DateField";
import { BankNameSelect } from "../BankNameSelect";
import { ThaiIdField } from "../ThaiIdField";
import { BankAccountNumberField } from "../BankAccountNumberField";
import { calculateProbationEndDate } from "@/lib/probation";

const TITLE_PREFIXES = ["นาย", "นาง", "นางสาว"];
const GENDERS = ["ชาย", "หญิง", "อื่น ๆ"];
const GENDER_IDENTITIES = ["ชาย", "หญิง", "LGBTQ+", "ไม่ระบุ"];

const initialState: CreateEmployeeState = {};

export function NewEmployeeForm({
  departments,
  positions,
  managers,
}: {
  departments: { id: string; name: string }[];
  positions: { id: string; title: string; department_id: string | null }[];
  managers: { id: string; first_name: string; last_name: string }[];
}) {
  const [state, formAction, isPending] = useActionState(createEmployeeAction, initialState);
  const [createLogin, setCreateLogin] = useState(true);
  const [loginPassword, setLoginPassword] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const positionsInDepartment = departmentId ? positions.filter((p) => p.department_id === departmentId) : positions;
  const [idCardAddress, setIdCardAddress] = useState<AddressValue>({});
  const [currentAddress, setCurrentAddress] = useState<AddressValue>({});
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
    return (
      <div className="max-w-xl rounded-xl border border-green-200 bg-green-50 p-6">
        <h3 className="flex items-center gap-2 text-lg font-bold text-green-700">
          <span className="material-symbols-outlined">check_circle</span>
          บันทึกพนักงาน {state.employeeCode} สำเร็จ
        </h3>
        {state.loginEmail && (
          <div className="mt-4 rounded-lg bg-white p-4 text-sm">
            <p>
              บัญชีเข้าสู่ระบบ: <span className="font-mono font-bold">{state.loginEmail}</span>
            </p>
            <p className="mt-1">
              รหัสผ่านเริ่มต้น: <span className="font-mono font-bold">{loginPassword}</span>
            </p>
            <p className="mt-2 text-status-success">แจ้งพนักงานให้เข้าสู่ระบบด้วยข้อมูลนี้ — ระบบจะบังคับให้เปลี่ยนรหัสผ่านเองในการเข้าสู่ระบบครั้งแรก</p>
          </div>
        )}
        <div className="mt-4 flex gap-3">
          <Link href="/employees" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">
            ไปที่รายชื่อพนักงาน
          </Link>
          <Link href="/employees/new" className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-bold">
            เพิ่มพนักงานอีกคน
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="max-w-3xl space-y-6 rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      {state.error && <div className="rounded-lg bg-error-container px-4 py-3 text-sm font-semibold text-on-error-container">{state.error}</div>}

      <fieldset className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="รหัสพนักงาน" name="employeeCode" required />
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
        <Select label="คำนำหน้าชื่อ" name="titlePrefix" options={TITLE_PREFIXES.map((v) => ({ value: v, label: v }))} />
        <Field label="ชื่อ" name="firstName" required />
        <Field label="นามสกุล" name="lastName" required />
        <Field label="ชื่อ (ภาษาอังกฤษ)" name="firstNameEn" />
        <Field label="นามสกุล (ภาษาอังกฤษ)" name="lastNameEn" />
        <Field label="ชื่อเล่น" name="nickname" />
        <Select label="เพศ" name="gender" options={GENDERS.map((v) => ({ value: v, label: v }))} />
        <Select label="เพศสภาพ" name="genderIdentity" options={GENDER_IDENTITIES.map((v) => ({ value: v, label: v }))} />
        <Field label="เบอร์โทร" name="phone" />
        <Field label="อีเมลส่วนตัว" name="personalEmail" type="email" />
        <ThaiIdField label="เลขบัตรประชาชน" name="nationalId" />
        <ThaiIdField label="เลขผู้เสียภาษี" name="taxId" />
        <ThaiIdField label="เลขประกันสังคม" name="socialSecurityId" />
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
          options={positionsInDepartment.map((p) => ({ value: p.id, label: p.title }))}
        />
        <Select
          label="หัวหน้างาน"
          name="managerEmployeeId"
          options={managers.map((m) => ({ value: m.id, label: `${m.first_name} ${m.last_name}` }))}
        />
        <Select
          label="ประเภทการจ้าง"
          name="employmentType"
          options={[
            { value: "monthly", label: "รายเดือน (ประจำ)" },
            { value: "daily", label: "รายวัน" },
            { value: "hourly", label: "รายชั่วโมง" },
            { value: "part_time", label: "พาร์ทไทม์" },
            { value: "contract", label: "สัญญาจ้าง" },
          ]}
        />
        <Field label="เงินเดือน / อัตราค่าจ้าง (บาท)" name="baseAmountBaht" type="number" step="0.01" required />
      </fieldset>

      <div className="space-y-3 rounded-lg border border-outline-variant p-4">
        <p className="text-sm font-semibold text-on-surface">บัญชีธนาคาร (ไม่บังคับ)</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <BankNameSelect name="bankName" />
          <Field label="ชื่อบัญชี" name="bankAccountName" />
          <BankAccountNumberField />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-outline-variant p-4">
        <p className="text-sm font-semibold text-on-surface">ที่อยู่ตามบัตรประชาชน (ไม่บังคับ)</p>
        <AddressBlock namePrefix="idCard" value={idCardAddress} onChange={patchIdCardAddress} />
      </div>

      <div className="space-y-3 rounded-lg border border-outline-variant p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-on-surface">ที่อยู่ปัจจุบัน (ไม่บังคับ)</p>
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

      <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            name="createLoginAccount"
            checked={createLogin}
            onChange={(e) => setCreateLogin(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          สร้างบัญชีเข้าสู่ระบบ (แอปพนักงาน) ให้พนักงานคนนี้
        </label>
        {createLogin && (
          <div className="mt-3 space-y-3">
            <Field label="อีเมลสำหรับเข้าสู่ระบบ" name="loginEmail" type="email" required />
            <div className="space-y-1">
              <label className="block text-sm font-semibold text-on-surface-variant" htmlFor="loginPassword">
                รหัสผ่านเริ่มต้น <span className="text-primary">*</span>
              </label>
              <input
                id="loginPassword"
                name="loginPassword"
                type="text"
                autoComplete="off"
                required
                minLength={8}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="อย่างน้อย 8 ตัวอักษร"
                className="h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <p className="text-xs text-on-surface-variant">
              พี่เป็นคนตั้งรหัสผ่านเริ่มต้นให้เอง แล้วแจ้งพนักงานด้วยตัวเอง (ไลน์/ปากเปล่า) ระบบจะบังคับให้พนักงานเปลี่ยนรหัสผ่านเองตอนเข้าสู่ระบบครั้งแรก
            </p>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="h-12 w-full rounded-xl bg-primary font-bold text-white shadow-md disabled:opacity-60 md:w-auto md:px-8"
      >
        {isPending ? "กำลังบันทึก..." : "บันทึกพนักงาน"}
      </button>
    </form>
  );
}

function Field({ label, name, type = "text", required, step }: { label: string; name: string; type?: string; required?: boolean; step?: string }) {
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
        step={step}
        required={required}
        className="h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}

function Select({ label, name, options }: { label: string; name: string; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-semibold text-on-surface-variant" htmlFor={name}>
        {label}
      </label>
      <select id={name} name={name} className="h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm">
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
