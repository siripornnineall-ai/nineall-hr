"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";

interface Goal {
  id: string;
  kind: "goal" | "kpi";
  title: string;
  description: string | null;
  target_value: string | null;
  current_value: string | null;
  period: string | null;
  due_date: string | null;
  status: "active" | "done" | "cancelled";
  source: "employee" | "admin";
}

const STATUS_TH: Record<string, string> = { active: "กำลังดำเนินการ", done: "สำเร็จแล้ว", cancelled: "ยกเลิก" };
const STATUS_CLASS: Record<string, string> = { active: "text-status-warning", done: "text-status-success", cancelled: "text-on-surface-variant" };

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        active ? "border-primary bg-primary font-bold text-white" : "border-outline-variant text-on-surface-variant"
      )}
    >
      {label}
    </button>
  );
}

const field = "w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm";
const labelCls = "mb-1.5 block text-sm font-semibold text-on-surface-variant";

// My goals and KPIs: I write my own here; the ones admin / HR set for me show up too (I can update their progress).
export default function GoalsPage() {
  const { t } = useT();
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null); // "new" or a goal id
  const [kind, setKind] = useState<"goal" | "kpi">("kpi");
  const [title, setTitle] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [period, setPeriod] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Goal["status"]>("active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("employee_goals")
      .select("id, kind, title, description, target_value, current_value, period, due_date, status, source")
      .eq("employee_id", profile.employeeId)
      .order("created_at", { ascending: false });
    setGoals((data ?? []) as Goal[]);
    setLoaded(true);
  }, [profile, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setEditingId("new");
    setKind("kpi");
    setTitle("");
    setTargetValue("");
    setCurrentValue("");
    setPeriod("");
    setDueDate("");
    setDescription("");
    setStatus("active");
    setError(null);
  }

  function startEdit(g: Goal) {
    setEditingId(g.id);
    setKind(g.kind);
    setTitle(g.title);
    setTargetValue(g.target_value ?? "");
    setCurrentValue(g.current_value ?? "");
    setPeriod(g.period ?? "");
    setDueDate(g.due_date ?? "");
    setDescription(g.description ?? "");
    setStatus(g.status);
    setError(null);
  }

  const editingGoal = goals.find((g) => g.id === editingId) ?? null;
  const adminSetLocked = editingGoal?.source === "admin"; // admin-set: only progress and status can change

  async function save() {
    if (!profile || !editingId) return;
    setError(null);
    if (!adminSetLocked && !title.trim()) {
      setError(t("กรุณากรอกหัวข้อ"));
      return;
    }
    setSaving(true);
    let result;
    if (editingId === "new") {
      result = await supabase.from("employee_goals").insert({
        org_id: profile.orgId,
        employee_id: profile.employeeId,
        kind,
        title: title.trim(),
        description: description.trim() || null,
        target_value: targetValue.trim() || null,
        current_value: currentValue.trim() || null,
        period: period.trim() || null,
        due_date: dueDate || null,
        status,
        source: "employee",
        created_by_employee_id: profile.employeeId,
      });
    } else if (adminSetLocked) {
      result = await supabase.from("employee_goals").update({ current_value: currentValue.trim() || null, status }).eq("id", editingId);
    } else {
      result = await supabase
        .from("employee_goals")
        .update({
          kind,
          title: title.trim(),
          description: description.trim() || null,
          target_value: targetValue.trim() || null,
          current_value: currentValue.trim() || null,
          period: period.trim() || null,
          due_date: dueDate || null,
          status,
        })
        .eq("id", editingId);
    }
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setEditingId(null);
    load();
  }

  async function remove(id: string) {
    setError(null);
    const { error: delError } = await supabase.from("employee_goals").delete().eq("id", id);
    if (delError) {
      setError(delError.message);
      return;
    }
    setConfirmDeleteId(null);
    load();
  }

  return (
    <div className="safe-top space-y-5 px-4 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-primary">{t("เป้าหมาย & KPI")}</h1>
        {editingId === null && (
          <button onClick={startNew} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white">
            + {t("เพิ่ม")}
          </button>
        )}
      </div>

      {editingId !== null && (
        <div className="space-y-3 rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <p className="text-sm font-bold text-on-surface">{editingId === "new" ? t("เพิ่มเป้าหมาย / KPI ของฉัน") : t("แก้ไข")}</p>
          {adminSetLocked && <p className="text-xs text-on-surface-variant">{t("รายการนี้ผู้ดูแลเป็นคนกำหนด คุณอัปเดตได้เฉพาะความคืบหน้าและสถานะ")}</p>}
          {!adminSetLocked && (
            <>
              <div className="flex gap-2">
                <Chip label="KPI" active={kind === "kpi"} onClick={() => setKind("kpi")} />
                <Chip label={t("เป้าหมาย")} active={kind === "goal"} onClick={() => setKind("goal")} />
              </div>
              <div>
                <label className={labelCls}>{t("หัวข้อ")}</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("เช่น ยอดขายต่อเดือน")} className={field} />
              </div>
              <div>
                <label className={labelCls}>{t("ค่าเป้าหมาย")}</label>
                <input value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder={t("เช่น 100 ออเดอร์/วัน")} className={field} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t("รอบเวลา")}</label>
                  <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder={t("เช่น ไตรมาส 4/2569")} className={field} />
                </div>
                <div>
                  <label className={labelCls}>{t("กำหนดเสร็จ")}</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={field} />
                </div>
              </div>
              <div>
                <label className={labelCls}>{t("รายละเอียด (ไม่บังคับ)")}</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={field} />
              </div>
            </>
          )}
          <div>
            <label className={labelCls}>{t("ความคืบหน้าตอนนี้")}</label>
            <input value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} placeholder={t("เช่น 40 ออเดอร์/วัน")} className={field} />
          </div>
          <div>
            <label className={labelCls}>{t("สถานะ")}</label>
            <div className="flex flex-wrap gap-2">
              {(["active", "done", "cancelled"] as const).map((s) => (
                <Chip key={s} label={t(STATUS_TH[s])} active={status === s} onClick={() => setStatus(s)} />
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-status-danger">{error}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="h-11 flex-1 rounded-2xl bg-primary font-bold text-white disabled:opacity-60">
              {saving ? t("กำลังบันทึก...") : t("บันทึก")}
            </button>
            <button onClick={() => setEditingId(null)} disabled={saving} className="h-11 rounded-2xl px-4 font-semibold text-on-surface-variant">
              {t("ยกเลิก")}
            </button>
          </div>
        </div>
      )}

      {editingId === null && error && <p className="text-sm text-status-danger">{error}</p>}
      {loaded && goals.length === 0 && editingId === null && (
        <p className="text-sm text-on-surface-variant">{t("ยังไม่มีเป้าหมายหรือ KPI กด “+ เพิ่ม” เพื่อบอกว่าคุณมีเป้าหมายอะไร")}</p>
      )}

      <div className="space-y-3">
        {goals.map((g) => (
          <div key={g.id} className="space-y-1.5 rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-primary">
                  {g.kind === "kpi" ? "KPI" : t("เป้าหมาย")}
                  {g.source === "admin" && <span className="ml-2 font-semibold text-on-surface-variant">· {t("ผู้ดูแลกำหนด")}</span>}
                </p>
                <p className="font-semibold text-on-surface">{g.title}</p>
              </div>
              <span className={clsx("shrink-0 text-xs font-bold", STATUS_CLASS[g.status])}>{t(STATUS_TH[g.status])}</span>
            </div>
            <p className="text-sm text-on-surface-variant">
              {g.target_value && (
                <span>
                  {t("เป้า")}: <b className="text-on-surface">{g.target_value}</b>
                </span>
              )}
              {g.current_value && (
                <span>
                  {g.target_value ? " · " : ""}
                  {t("ตอนนี้")}: <b className="text-on-surface">{g.current_value}</b>
                </span>
              )}
              {g.period && <span> · {g.period}</span>}
              {g.due_date && <span> · {t("ภายใน")} {new Date(g.due_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</span>}
            </p>
            {g.description && <p className="whitespace-pre-line text-sm text-on-surface-variant">{g.description}</p>}
            {editingId === null && (
              <div className="flex items-center gap-4 pt-1">
                <button onClick={() => startEdit(g)} className="text-xs font-bold text-primary">
                  {g.source === "admin" ? t("อัปเดตความคืบหน้า") : t("แก้ไข")}
                </button>
                {g.source === "employee" &&
                  (confirmDeleteId === g.id ? (
                    <span className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-status-danger">{t("ลบรายการนี้?")}</span>
                      <button onClick={() => remove(g.id)} className="font-bold text-status-danger">
                        {t("ยืนยัน")}
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="font-semibold text-on-surface-variant">
                        {t("ยกเลิก")}
                      </button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(g.id)} className="text-xs font-bold text-status-danger">
                      {t("ลบ")}
                    </button>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
