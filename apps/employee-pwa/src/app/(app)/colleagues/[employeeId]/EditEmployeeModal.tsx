"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Option {
  id: string;
  label: string;
}

interface EmployeeRow {
  first_name: string;
  last_name: string;
  job_position_id: string | null;
  department_id: string | null;
  manager_employee_id: string | null;
  employment_status: string;
}

// Mirrors admin-web's detectManagerCycle() (apps/admin-web/src/app/(dashboard)/employees/actions.ts)
// exactly, just walking the chain via direct client queries instead of a server action —
// employee-pwa has no server-actions layer, everything here goes through the browser
// Supabase client under RLS (employees_write_admin_hr already gates the actual save).
async function detectManagerCycle(supabase: ReturnType<typeof createClient>, employeeId: string, proposedManagerId: string): Promise<string | null> {
  if (proposedManagerId === employeeId) return "พนักงานไม่สามารถเป็นหัวหน้าของตัวเองได้";
  const visited = new Set<string>();
  let currentId: string | null = proposedManagerId;
  for (let i = 0; i < 100 && currentId; i++) {
    if (currentId === employeeId) {
      return "ไม่สามารถตั้งหัวหน้าคนนี้ได้ เพราะจะทำให้เกิดโครงสร้างวนลูป (หัวหน้าที่เลือกอยู่ใต้บังคับบัญชาของพนักงานคนนี้อยู่แล้ว)";
    }
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const result: { data: { manager_employee_id: string | null } | null } = await supabase
      .from("employees")
      .select("manager_employee_id")
      .eq("id", currentId)
      .maybeSingle();
    currentId = result.data?.manager_employee_id ?? null;
  }
  return null;
}

export function EditEmployeeModal({ employeeId, onClose, onSaved }: { employeeId: string; onClose: () => void; onSaved: () => void }) {
  const [supabase] = useState(() => createClient());
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jobPositionId, setJobPositionId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [managerEmployeeId, setManagerEmployeeId] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("active");

  const [jobPositions, setJobPositions] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);

  const [offboarding, setOffboarding] = useState(false);
  const [offboardStatus, setOffboardStatus] = useState<"resigned" | "terminated">("resigned");
  const [offboardDate, setOffboardDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [offboardReason, setOffboardReason] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: emp }, { data: jp }, { data: dept }, { data: emps }] = await Promise.all([
        supabase.from("employees").select("first_name, last_name, job_position_id, department_id, manager_employee_id, employment_status").eq("id", employeeId).single(),
        supabase.from("job_positions").select("id, title").is("deleted_at", null).eq("status", "active").order("title"),
        supabase.from("departments").select("id, name").is("deleted_at", null).eq("status", "active").order("name"),
        supabase.from("employees").select("id, employee_code, first_name, last_name").is("deleted_at", null).in("employment_status", ["active", "probation"]).order("first_name"),
      ]);
      const row = emp as EmployeeRow | null;
      if (row) {
        setFirstName(row.first_name);
        setLastName(row.last_name);
        setJobPositionId(row.job_position_id ?? "");
        setDepartmentId(row.department_id ?? "");
        setManagerEmployeeId(row.manager_employee_id ?? "");
        setEmploymentStatus(row.employment_status);
      }
      setJobPositions((jp ?? []).map((r) => ({ id: r.id, label: r.title })));
      setDepartments((dept ?? []).map((r) => ({ id: r.id, label: r.name })));
      setEmployees(
        (emps ?? [])
          .filter((r) => r.id !== employeeId)
          .map((r) => ({ id: r.id, label: `${r.first_name} ${r.last_name} (${r.employee_code})` }))
      );
      setLoaded(true);
    })();
  }, [supabase, employeeId]);

  async function handleSave() {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError("กรุณากรอกชื่อ-นามสกุล");
      return;
    }
    setSaving(true);

    if (managerEmployeeId) {
      const cycleError = await detectManagerCycle(supabase, employeeId, managerEmployeeId);
      if (cycleError) {
        setError(cycleError);
        setSaving(false);
        return;
      }
    }

    const { error: updateError } = await supabase
      .from("employees")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        job_position_id: jobPositionId || null,
        department_id: departmentId || null,
        manager_employee_id: managerEmployeeId || null,
      })
      .eq("id", employeeId);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved();
  }

  async function handleOffboard() {
    setError(null);
    if (!offboardDate) {
      setError("กรุณาระบุวันที่มีผล");
      return;
    }
    setSaving(true);

    // Same guard as admin-web's offboardEmployeeAction — block if this person still has
    // active direct reports, so the org chart never loses a manager out from under them.
    const { count } = await supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("manager_employee_id", employeeId)
      .is("deleted_at", null)
      .in("employment_status", ["active", "probation"]);
    if ((count ?? 0) > 0) {
      setError(`บันทึกไม่ได้ เพราะยังมีพนักงาน ${count} คนที่รายงานตรงกับคนนี้อยู่ในผังองค์กร กรุณาเปลี่ยน "หัวหน้างาน" ของพวกเขาก่อน`);
      setSaving(false);
      return;
    }

    const { error: rpcError } = await supabase.rpc("offboard_employee", {
      p_employee_id: employeeId,
      p_status: offboardStatus,
      p_effective_date: offboardDate,
      p_reason: offboardReason || null,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-on-surface">แก้ไขข้อมูลพนักงาน</h3>
          <button onClick={onClose} className="text-on-surface-variant">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {!loaded ? (
          <div className="flex justify-center py-8">
            <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
          </div>
        ) : (
          <div className="space-y-3">
            {error && <p className="text-sm font-semibold text-status-danger">{error}</p>}

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-semibold text-on-surface-variant">ชื่อ</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold text-on-surface-variant">นามสกุล</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-on-surface-variant">ตำแหน่ง</label>
              <select value={jobPositionId} onChange={(e) => setJobPositionId(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm">
                <option value="">-- ไม่ระบุ --</option>
                {jobPositions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-on-surface-variant">แผนก</label>
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm">
                <option value="">-- ไม่ระบุ --</option>
                {departments.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-on-surface-variant">หัวหน้างาน</label>
              <select value={managerEmployeeId} onChange={(e) => setManagerEmployeeId(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm">
                <option value="">-- ไม่มี (ตำแหน่งสูงสุด) --</option>
                {employees.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <button onClick={handleSave} disabled={saving} className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-white disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>

            {(employmentStatus === "active" || employmentStatus === "probation") && (
              <div className="border-t border-outline-variant pt-3">
                {!offboarding ? (
                  <button onClick={() => setOffboarding(true)} className="text-xs font-semibold text-status-danger">
                    บันทึกว่าลาออก / พ้นสภาพ
                  </button>
                ) : (
                  <div className="space-y-2 rounded-xl bg-status-danger/5 p-3">
                    <p className="text-xs font-bold text-status-danger">บันทึกว่าลาออก / พ้นสภาพ</p>
                    <select
                      value={offboardStatus}
                      onChange={(e) => setOffboardStatus(e.target.value as "resigned" | "terminated")}
                      className="h-9 w-full rounded-lg border border-outline-variant px-3 text-sm"
                    >
                      <option value="resigned">ลาออก</option>
                      <option value="terminated">พ้นสภาพ / ให้ออก</option>
                    </select>
                    <input
                      type="date"
                      value={offboardDate}
                      onChange={(e) => setOffboardDate(e.target.value)}
                      className="h-9 w-full rounded-lg border border-outline-variant px-3 text-sm"
                    />
                    <input
                      value={offboardReason}
                      onChange={(e) => setOffboardReason(e.target.value)}
                      placeholder="เหตุผล (ถ้ามี)"
                      className="h-9 w-full rounded-lg border border-outline-variant px-3 text-sm"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setOffboarding(false)} className="h-9 flex-1 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface-variant">
                        ยกเลิก
                      </button>
                      <button onClick={handleOffboard} disabled={saving} className="h-9 flex-1 rounded-lg bg-status-danger text-xs font-bold text-white disabled:opacity-50">
                        ยืนยัน
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
