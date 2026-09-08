"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";

interface EmployeeOption {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
}

interface LeaveTypeOption {
  id: string;
  name_th: string;
}

type Unit = "full_day" | "half_day" | "hourly";

function UnitChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-full border px-3 py-1.5 text-xs transition-colors",
        active ? "border-primary bg-primary font-bold text-white" : "border-outline-variant text-on-surface-variant"
      )}
    >
      {label}
    </button>
  );
}

// Mirrors admin-web's createBackdatedLeaveAction (apps/admin-web/src/app/(dashboard)/leave/actions.ts)
// but as a direct client insert + the shared decide_leave_request RPC (migration 0085) instead
// of a server action — employee-pwa has no server-actions layer, and decide_leave_request
// already does the "approve + auto-fill attendance" work identically to that action.
export function AddBackdatedLeaveForm({ orgId, onSaved }: { orgId: string; onSaved: () => void }) {
  const [supabase] = useState(() => createClient());
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOption[]>([]);

  const [employeeId, setEmployeeId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [unit, setUnit] = useState<Unit>("full_day");
  const [halfDayPeriod, setHalfDayPeriod] = useState<"morning" | "afternoon">("morning");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hourlyStart, setHourlyStart] = useState("09:00");
  const [hourlyEnd, setHourlyEnd] = useState("12:00");
  const [totalDays, setTotalDays] = useState("1");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: emps }, { data: types }] = await Promise.all([
        supabase
          .from("employees")
          .select("id, employee_code, first_name, last_name")
          .eq("org_id", orgId)
          .is("deleted_at", null)
          .in("employment_status", ["active", "probation"])
          .order("employee_code"),
        supabase.from("leave_types").select("id, name_th").eq("org_id", orgId).eq("is_active", true).order("sort_order"),
      ]);
      setEmployees(emps ?? []);
      setLeaveTypes(types ?? []);
    })();
  }, [open, supabase, orgId]);

  function computeHourlyHours(): number {
    const [sh, sm] = hourlyStart.split(":").map(Number);
    const [eh, em] = hourlyEnd.split(":").map(Number);
    const hours = eh + em / 60 - (sh + sm / 60);
    return hours > 0 ? hours : 0;
  }

  function changeUnit(next: Unit) {
    setUnit(next);
    if (next === "half_day") setTotalDays("0.5");
    else if (next === "hourly") setTotalDays(String(Math.round((computeHourlyHours() / 8) * 100) / 100));
    else setTotalDays("1");
  }

  function reset() {
    setEmployeeId("");
    setLeaveTypeId("");
    setUnit("full_day");
    setStartDate("");
    setEndDate("");
    setHourlyStart("09:00");
    setHourlyEnd("12:00");
    setTotalDays("1");
    setReason("");
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!employeeId) return setError("กรุณาเลือกพนักงาน");
    if (!leaveTypeId || !startDate) return setError("กรุณากรอกข้อมูลให้ครบถ้วน");
    const effectiveEndDate = unit === "full_day" ? endDate : startDate;
    if (unit === "full_day" && (!endDate || endDate < startDate)) return setError("วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มลา");
    const totalDaysNum = Number(totalDays);
    if (!Number.isFinite(totalDaysNum) || totalDaysNum <= 0) return setError("จำนวนวันลาไม่ถูกต้อง");

    const startTime = unit === "half_day" ? (halfDayPeriod === "morning" ? "08:00" : "13:00") : unit === "hourly" ? hourlyStart : null;
    const endTime = unit === "half_day" ? (halfDayPeriod === "morning" ? "12:00" : "17:00") : unit === "hourly" ? hourlyEnd : null;

    setSaving(true);
    const { data: request, error: insertError } = await supabase
      .from("leave_requests")
      .insert({
        org_id: orgId,
        employee_id: employeeId,
        leave_type_id: leaveTypeId,
        start_date: startDate,
        end_date: effectiveEndDate,
        start_time: startTime,
        end_time: endTime,
        total_days: totalDaysNum,
        unit,
        reason: reason || "บันทึกย้อนหลังโดยแอดมิน",
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !request) {
      setSaving(false);
      setError(insertError?.message ?? "บันทึกคำขอลาไม่สำเร็จ");
      return;
    }

    const { error: decideError } = await supabase.rpc("decide_leave_request", {
      p_request_id: request.id,
      p_decision: "approved",
      p_comment: "อนุมัติอัตโนมัติ (บันทึกย้อนหลังโดยแอดมิน)",
    });
    setSaving(false);
    if (decideError) {
      setError(decideError.message);
      return;
    }

    reset();
    setOpen(false);
    onSaved();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-white shadow-sm">
        + บันทึกการลาย้อนหลัง
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
      <p className="text-sm font-bold text-on-surface">บันทึกการลาย้อนหลังให้พนักงาน (อนุมัติทันที)</p>

      <div>
        <label className="text-xs font-semibold text-on-surface-variant">พนักงาน</label>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm">
          <option value="">-- เลือกพนักงาน --</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.employee_code} — {e.first_name} {e.last_name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold text-on-surface-variant">ประเภทลา</label>
        <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm">
          <option value="">-- เลือกประเภทลา --</option>
          {leaveTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name_th}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold text-on-surface-variant">หน่วย</label>
        <div className="mt-1 flex flex-wrap gap-2">
          <UnitChip label="เต็มวัน" active={unit === "full_day"} onClick={() => changeUnit("full_day")} />
          <UnitChip label="ครึ่งวัน" active={unit === "half_day"} onClick={() => changeUnit("half_day")} />
          <UnitChip label="รายชั่วโมง" active={unit === "hourly"} onClick={() => changeUnit("hourly")} />
        </div>
      </div>

      {unit === "full_day" && (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-semibold text-on-surface-variant">วันที่เริ่มลา</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold text-on-surface-variant">วันที่สิ้นสุด</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
          </div>
        </div>
      )}

      {unit === "half_day" && (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-semibold text-on-surface-variant">วันที่ลา</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold text-on-surface-variant">ช่วง</label>
            <div className="mt-1 flex gap-2">
              <UnitChip label="เช้า" active={halfDayPeriod === "morning"} onClick={() => setHalfDayPeriod("morning")} />
              <UnitChip label="บ่าย" active={halfDayPeriod === "afternoon"} onClick={() => setHalfDayPeriod("afternoon")} />
            </div>
          </div>
        </div>
      )}

      {unit === "hourly" && (
        <div className="space-y-2">
          <div>
            <label className="text-xs font-semibold text-on-surface-variant">วันที่ลา</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-semibold text-on-surface-variant">เวลาเริ่ม</label>
              <input
                type="time"
                value={hourlyStart}
                onChange={(e) => {
                  setHourlyStart(e.target.value);
                  setTotalDays(String(Math.round((computeHourlyHours() / 8) * 100) / 100));
                }}
                className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-on-surface-variant">เวลาสิ้นสุด</label>
              <input
                type="time"
                value={hourlyEnd}
                onChange={(e) => {
                  setHourlyEnd(e.target.value);
                  setTotalDays(String(Math.round((computeHourlyHours() / 8) * 100) / 100));
                }}
                className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-on-surface-variant">จำนวนวัน{unit === "hourly" && ` (${computeHourlyHours()} ชม.)`}</label>
        <input
          type="number"
          step="0.5"
          min="0.01"
          value={totalDays}
          onChange={(e) => setTotalDays(e.target.value)}
          disabled={unit !== "full_day"}
          className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm disabled:bg-surface-container-low disabled:text-on-surface-variant"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-on-surface-variant">เหตุผล (ไม่บังคับ)</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="บันทึกย้อนหลังโดยแอดมิน"
          className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
        />
      </div>

      {error && <p className="text-sm font-semibold text-status-danger">{error}</p>}

      <div className="flex gap-2">
        <button onClick={submit} disabled={saving} className="h-10 flex-1 rounded-lg bg-primary text-sm font-bold text-white disabled:opacity-60">
          {saving ? "กำลังบันทึก..." : "บันทึกและอนุมัติ"}
        </button>
        <button
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={saving}
          className="h-10 flex-1 rounded-lg border border-outline-variant text-sm font-semibold text-on-surface-variant"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
