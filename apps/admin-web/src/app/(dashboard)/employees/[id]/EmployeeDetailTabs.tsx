"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import { updateContractFieldsAction, uploadEmployeeDocumentAction, deleteEmployeeDocumentAction } from "../actions";
import { createClient } from "@/lib/supabase/client";
import { LeaveBalances } from "./LeaveBalances";
import { ShiftAssignment } from "./ShiftAssignment";

const TABS = [
  { key: "employee", label: "พนักงาน", icon: "person" },
  { key: "contracts", label: "สัญญาจ้าง", icon: "description" },
  { key: "leaves", label: "วันลา", icon: "event_busy" },
  { key: "trainings", label: "การอบรม", icon: "school" },
  { key: "locations", label: "สถานที่", icon: "location_on" },
  { key: "attachments", label: "เอกสารแนบ", icon: "attach_file" },
  { key: "history", label: "ประวัติ", icon: "history" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export interface EmployeeDetailData {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  firstNameEn: string | null;
  lastNameEn: string | null;
  nickname: string | null;
  titlePrefix: string | null;
  gender: string | null;
  genderIdentity: string | null;
  phone: string | null;
  personalEmail: string | null;
  nationalId: string | null;
  idCardAddress: string;
  currentAddress: string;
  hireDate: string;
  probationEndDate: string | null;
  employmentType: string;
  employmentStatus: string;
  department: string | null;
  position: string | null;
  team: string | null;
}

export interface CompensationData {
  baseAmount: number;
  workDaysPerMonth: number;
  workHoursPerDay: number;
  paymentSchedule: string;
  companyCoversSsf: boolean;
  companyCoversTax: boolean;
}

export interface TrainingRow {
  id: string;
  title: string;
  provider: string | null;
  trainingDate: string;
  hours: number | null;
}

export interface DocumentRow {
  id: string;
  documentType: string;
  fileName: string;
  url: string | null;
  createdAt: string;
}

export interface HistoryRow {
  id: string;
  effectiveDate: string;
  department: string | null;
  position: string | null;
  employmentType: string;
  reason: string | null;
}

const PAYMENT_SCHEDULES = [
  { value: "monthly", label: "รายเดือนครั้งเดียว" },
  { value: "twice_monthly", label: "เดือนละ 2 ครั้ง" },
  { value: "weekly", label: "รายสัปดาห์" },
];

export function EmployeeDetailTabs({
  employee,
  bankAccount,
  canSeeSalary,
  canManage,
  compensation,
  leaveTypes,
  leaveBalances,
  trainingRecords,
  shifts,
  workLocations,
  currentShiftAssignment,
  documents,
  employmentHistory,
}: {
  employee: EmployeeDetailData;
  bankAccount: { bank_name: string; account_name: string; account_number: string } | null;
  canSeeSalary: boolean;
  canManage: boolean;
  compensation: CompensationData | null;
  leaveTypes: { id: string; name_th: string }[];
  leaveBalances: { id: string; leave_type_id: string; year: number; entitled_days: number; carried_over_days: number; used_days: number; pending_days: number }[];
  trainingRecords: TrainingRow[];
  shifts: { id: string; name: string; start_time: string; end_time: string }[];
  workLocations: { id: string; name: string }[];
  currentShiftAssignment: { work_date: string; shift_name: string | null } | null;
  documents: DocumentRow[];
  employmentHistory: HistoryRow[];
}) {
  const [tab, setTab] = useState<TabKey>("employee");

  return (
    <div className="md:col-span-2">
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-outline-variant bg-white p-1 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              tab === t.key ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "employee" && <EmployeeTab employee={employee} bankAccount={bankAccount} canSeeSalary={canSeeSalary} />}
      {tab === "contracts" && (
        <ContractsTab employee={employee} compensation={compensation} canSeeSalary={canSeeSalary} onViewHistory={() => setTab("history")} />
      )}
      {tab === "leaves" &&
        (canManage ? (
          <LeaveBalances employeeId={employee.id} leaveTypes={leaveTypes} balances={leaveBalances} />
        ) : (
          <EmptyCard text="ไม่มีสิทธิ์ดูข้อมูลวันลา" />
        ))}
      {tab === "trainings" && <TrainingsTab records={trainingRecords} />}
      {tab === "locations" &&
        (canManage ? (
          <ShiftAssignment employeeId={employee.id} shifts={shifts} workLocations={workLocations} currentAssignment={currentShiftAssignment} />
        ) : (
          <EmptyCard text="ไม่มีสิทธิ์ดูข้อมูลสถานที่ทำงาน" />
        ))}
      {tab === "attachments" && <AttachmentsTab employeeId={employee.id} documents={documents} canManage={canManage} />}
      {tab === "history" && <HistoryTab rows={employmentHistory} />}
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return <div className="rounded-xl border border-outline-variant bg-white p-6 text-center text-sm text-on-surface-variant shadow-sm">{text}</div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-on-surface-variant">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function EmployeeTab({
  employee,
  bankAccount,
  canSeeSalary,
}: {
  employee: EmployeeDetailData;
  bankAccount: { bank_name: string; account_name: string; account_number: string } | null;
  canSeeSalary: boolean;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      <h4 className="font-bold">ข้อมูลส่วนตัว</h4>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <Info label="ชื่อ-นามสกุล" value={`${employee.titlePrefix ?? ""} ${employee.firstName} ${employee.lastName}`.trim()} />
        <Info label="ชื่อ-นามสกุล (ภาษาอังกฤษ)" value={[employee.firstNameEn, employee.lastNameEn].filter(Boolean).join(" ") || "-"} />
        <Info label="ชื่อเล่น" value={employee.nickname ?? "-"} />
        <Info label="เพศ / เพศสภาพ" value={[employee.gender, employee.genderIdentity].filter(Boolean).join(" / ") || "-"} />
        <Info label="เบอร์โทร" value={employee.phone ?? "-"} />
        <Info label="อีเมล" value={employee.personalEmail ?? "-"} />
        {canSeeSalary && <Info label="เลขบัตรประชาชน" value={employee.nationalId ?? "-"} />}
      </dl>
      {canSeeSalary && (employee.idCardAddress !== "-" || employee.currentAddress !== "-") && (
        <dl className="grid grid-cols-1 gap-4 border-t border-outline-variant pt-4 text-sm md:grid-cols-2">
          <Info label="ที่อยู่ตามบัตรประชาชน" value={employee.idCardAddress} />
          <Info label="ที่อยู่ปัจจุบัน" value={employee.currentAddress} />
        </dl>
      )}
      {canSeeSalary && bankAccount && (
        <dl className="grid grid-cols-2 gap-4 border-t border-outline-variant pt-4 text-sm md:grid-cols-3">
          <Info label="ธนาคาร" value={bankAccount.bank_name} />
          <Info label="ชื่อบัญชี" value={bankAccount.account_name} />
          <Info label="เลขที่บัญชี" value={bankAccount.account_number} />
        </dl>
      )}
    </div>
  );
}

function ContractsTab({
  employee,
  compensation,
  canSeeSalary,
  onViewHistory,
}: {
  employee: EmployeeDetailData;
  compensation: CompensationData | null;
  canSeeSalary: boolean;
  onViewHistory: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [workDaysPerMonth, setWorkDaysPerMonth] = useState(String(compensation?.workDaysPerMonth ?? 30));
  const [workHoursPerDay, setWorkHoursPerDay] = useState(String(compensation?.workHoursPerDay ?? 8));
  const [paymentSchedule, setPaymentSchedule] = useState(compensation?.paymentSchedule ?? "monthly");
  const [companyCoversSsf, setCompanyCoversSsf] = useState(compensation?.companyCoversSsf ?? false);
  const [companyCoversTax, setCompanyCoversTax] = useState(compensation?.companyCoversTax ?? false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const otRate =
    compensation && compensation.workDaysPerMonth > 0 && compensation.workHoursPerDay > 0
      ? compensation.baseAmount / compensation.workDaysPerMonth / compensation.workHoursPerDay
      : null;

  async function save() {
    setError(null);
    setIsPending(true);
    const result = await updateContractFieldsAction(employee.id, { workDaysPerMonth, workHoursPerDay, paymentSchedule, companyCoversSsf, companyCoversTax });
    setIsPending(false);
    if (result?.error) setError(result.error);
    else setEditing(false);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="font-bold">ข้อมูลการจ้างงาน</h4>
          <Link href={`/employees/${employee.id}/edit`} className="text-xs font-bold text-primary hover:underline">
            แก้ไข
          </Link>
        </div>
        <dl className="divide-y divide-outline-variant text-sm">
          <Row label="วันที่จ้างงาน" value={new Date(employee.hireDate).toLocaleDateString("th-TH")} />
          <Row
            label="วันที่ผ่านทดลองงาน"
            value={employee.probationEndDate ? new Date(employee.probationEndDate).toLocaleDateString("th-TH") : "-"}
          />
          <Row label="สถานะ" value={<Badge tone={employee.employmentStatus === "active" ? "success" : "neutral"}>{employee.employmentStatus}</Badge>} />
          <Row label="แผนก" value={employee.department ?? "-"} />
          <Row label="ตำแหน่ง" value={employee.position ?? "-"} />
          <Row label="หัวหน้างาน/ทีม" value={employee.team ?? "-"} />
        </dl>
        <button onClick={onViewHistory} className="text-xs font-bold text-primary hover:underline">
          ดูประวัติพนักงาน →
        </button>
      </div>

      {canSeeSalary && compensation && (
        <div className="space-y-3 rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h4 className="font-bold">รายละเอียดสัญญาจ้าง</h4>
            {!editing && (
              <button onClick={() => setEditing(true)} className="text-xs font-bold text-primary hover:underline">
                แก้ไข
              </button>
            )}
          </div>
          {!editing ? (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Info label="ประเภทการจ้าง" value={employee.employmentType} />
              <Info label="เงินเดือน/อัตราค่าจ้าง" value={`${compensation.baseAmount.toLocaleString("th-TH")} บาท`} />
              <Info label="อัตรา OT ต่อชั่วโมง (x1)" value={otRate ? `${otRate.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท` : "-"} />
              <Info label="รอบจ่ายเงิน" value={PAYMENT_SCHEDULES.find((p) => p.value === compensation.paymentSchedule)?.label ?? compensation.paymentSchedule} />
              <Info label="วันทำงาน/เดือน" value={String(compensation.workDaysPerMonth)} />
              <Info label="ชั่วโมงทำงาน/วัน" value={String(compensation.workHoursPerDay)} />
              <Info label="บริษัทออกประกันสังคมให้" value={compensation.companyCoversSsf ? "ใช่" : "ไม่ใช่"} />
              <Info label="บริษัทออกภาษีให้" value={compensation.companyCoversTax ? "ใช่" : "ไม่ใช่"} />
            </dl>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-on-surface-variant">วันทำงาน/เดือน</label>
                  <input
                    type="number"
                    step="0.5"
                    value={workDaysPerMonth}
                    onChange={(e) => setWorkDaysPerMonth(e.target.value)}
                    className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-on-surface-variant">ชั่วโมงทำงาน/วัน</label>
                  <input
                    type="number"
                    step="0.5"
                    value={workHoursPerDay}
                    onChange={(e) => setWorkHoursPerDay(e.target.value)}
                    className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="block text-xs font-semibold text-on-surface-variant">รอบจ่ายเงิน</label>
                  <select
                    value={paymentSchedule}
                    onChange={(e) => setPaymentSchedule(e.target.value)}
                    className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
                  >
                    {PAYMENT_SCHEDULES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={companyCoversSsf} onChange={(e) => setCompanyCoversSsf(e.target.checked)} className="h-4 w-4 accent-primary" />
                บริษัทออกประกันสังคมให้ (ไม่หักจากพนักงาน)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={companyCoversTax} onChange={(e) => setCompanyCoversTax(e.target.checked)} className="h-4 w-4 accent-primary" />
                บริษัทออกภาษีให้ (ไม่หักจากพนักงาน)
              </label>
              <p className="text-xs text-on-surface-variant">
                หมายเหตุ: ตอนนี้ระบบยังไม่นำค่าเหล่านี้ไปคำนวณสลิปเงินเดือนอัตโนมัติ ใช้เป็นข้อมูลบันทึกไว้ก่อน
              </p>
              {error && <p className="text-sm font-semibold text-status-danger">{error}</p>}
              <div className="flex gap-2">
                <button onClick={save} disabled={isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                  {isPending ? "กำลังบันทึก..." : "บันทึก"}
                </button>
                <button onClick={() => setEditing(false)} disabled={isPending} className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant">
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function TrainingsTab({ records }: { records: TrainingRow[] }) {
  return (
    <div className="space-y-3 rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h4 className="font-bold">ประวัติการอบรม</h4>
        <Link href="/training" className="text-xs font-bold text-primary hover:underline">
          + บันทึกการอบรม
        </Link>
      </div>
      {records.length === 0 && <p className="text-sm text-on-surface-variant">ยังไม่มีประวัติการอบรม</p>}
      <div className="space-y-2">
        {records.map((r) => (
          <div key={r.id} className="rounded-lg border border-outline-variant p-3">
            <p className="font-semibold">{r.title}</p>
            <p className="text-xs text-on-surface-variant">
              {new Date(r.trainingDate).toLocaleDateString("th-TH")}
              {r.provider && ` — ${r.provider}`}
              {r.hours != null && ` (${r.hours} ชม.)`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttachmentsTab({ employeeId, documents, canManage }: { employeeId: string; documents: DocumentRow[]; canManage: boolean }) {
  const [documentType, setDocumentType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    setError(null);
    if (!file) {
      setError("กรุณาเลือกไฟล์");
      return;
    }
    if (!documentType.trim()) {
      setError("กรุณาระบุประเภทเอกสาร");
      return;
    }
    setUploading(true);
    const supabase = createClient();
    const path = `${employeeId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type });
    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }
    const result = await uploadEmployeeDocumentAction(employeeId, { documentType, filePath: path, fileName: file.name });
    setUploading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setDocumentType("");
    setFile(null);
  }

  async function remove(documentId: string) {
    await deleteEmployeeDocumentAction(documentId, employeeId);
  }

  return (
    <div className="space-y-4 rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      <h4 className="font-bold">เอกสารแนบ</h4>
      {canManage && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-on-surface-variant">ประเภทเอกสาร</label>
            <input
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              placeholder="เช่น สำเนาบัตรประชาชน, สัญญาจ้าง"
              className="h-9 rounded-lg border border-outline-variant px-3 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-on-surface-variant">ไฟล์</label>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          </div>
          <button onClick={upload} disabled={uploading} className="h-9 rounded-lg bg-primary px-4 text-xs font-bold text-white disabled:opacity-60">
            {uploading ? "กำลังอัปโหลด..." : "อัปโหลด"}
          </button>
          {error && <span className="text-xs font-semibold text-status-danger">{error}</span>}
        </div>
      )}
      {documents.length === 0 && <p className="text-sm text-on-surface-variant">ยังไม่มีเอกสารแนบ</p>}
      <div className="space-y-2">
        {documents.map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-lg border border-outline-variant p-3 text-sm">
            <div>
              <p className="font-semibold">{d.documentType}</p>
              <p className="text-xs text-on-surface-variant">
                {d.fileName} — {new Date(d.createdAt).toLocaleDateString("th-TH")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {d.url && (
                <a href={d.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary hover:underline">
                  ดาวน์โหลด
                </a>
              )}
              {canManage && (
                <button onClick={() => remove(d.id)} className="text-xs font-bold text-status-danger hover:underline">
                  ลบ
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryTab({ rows }: { rows: HistoryRow[] }) {
  return (
    <div className="space-y-3 rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      <h4 className="font-bold">ประวัติการเปลี่ยนแปลง</h4>
      {rows.length === 0 && <p className="text-sm text-on-surface-variant">ยังไม่มีประวัติการเปลี่ยนแปลง (จะบันทึกอัตโนมัติเมื่อมีการแก้ไขแผนก/ตำแหน่ง/หัวหน้างาน/ประเภทการจ้าง)</p>}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-outline-variant p-3 text-sm">
            <p className="font-semibold">{new Date(r.effectiveDate).toLocaleDateString("th-TH")}</p>
            <p className="text-xs text-on-surface-variant">
              {r.department ?? "-"} / {r.position ?? "-"} / {r.employmentType}
            </p>
            {r.reason && <p className="mt-1 text-xs text-on-surface-variant">{r.reason}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
