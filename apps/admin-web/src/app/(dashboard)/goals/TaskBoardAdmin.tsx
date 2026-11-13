"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";

// Admin view of the department task boards (owner 2026-11-13). HR / admin can pick each department's head, add and
// assign cards, set weight / due date and cancel cards — but approving a card as done is the department head's alone
// (also enforced by the database trigger guard_task_card).

type Status = "todo" | "doing" | "review" | "done" | "cancelled";

interface Card {
  id: string;
  department_id: string;
  title: string;
  description: string | null;
  status: Status;
  assignee_employee_id: string;
  created_by_employee_id: string | null;
  weight: number;
  due_date: string | null;
  quality: number | null;
  is_late: boolean | null;
  review_note: string | null;
}

interface Dept {
  id: string;
  name: string;
  head_employee_id: string | null;
}

interface Emp {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  department_id: string | null;
}

interface Score {
  department_id: string;
  employee_id: string;
  cards_counted: number;
  done_count: number;
  late_count: number;
  overdue_open_count: number;
  earned: number;
  possible: number;
  percent: number | null;
}

const COLUMNS: { status: Status; label: string; tone: string }[] = [
  { status: "todo", label: "ต้องทำ", tone: "bg-surface-container" },
  { status: "doing", label: "กำลังทำ", tone: "bg-[#fff6e5]" },
  { status: "review", label: "รอหัวหน้าตรวจ", tone: "bg-[#eaf2ff]" },
  { status: "done", label: "เสร็จแล้ว", tone: "bg-[#e9f8ee]" },
];

const field = "w-full rounded-lg border border-outline-variant px-3 py-2 text-sm disabled:bg-surface-container";
const labelCls = "mb-1 block text-xs font-semibold text-on-surface-variant";

const bangkokToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function pctTone(p: number | null) {
  if (p == null) return "text-on-surface-variant";
  if (p >= 80) return "text-status-success";
  if (p >= 60) return "text-status-warning";
  return "text-status-danger";
}

function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={clsx(onChange ? "text-2xl" : "text-xs", n <= value ? "text-[#f5a623]" : "text-outline-variant")}
        >
          ★
        </button>
      ))}
    </span>
  );
}

export function TaskBoardAdmin({
  orgId,
  myEmployeeId,
  canManage,
  departments,
  employees,
}: {
  orgId: string;
  myEmployeeId: string | null;
  canManage: boolean;
  departments: Dept[];
  employees: Emp[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [depts, setDepts] = useState<Dept[]>(departments);
  const [view, setView] = useState<string>("overview"); // "overview" or a department id
  const [month, setMonth] = useState(bangkokToday().slice(0, 7));
  const [cards, setCards] = useState<Card[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [weight, setWeight] = useState(2);
  const [dueDate, setDueDate] = useState("");
  const [quality, setQuality] = useState(0);
  const [note, setNote] = useState("");

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const name = (id: string | null | undefined) => {
    const e = id ? empById.get(id) : undefined;
    return e ? e.nickname || e.first_name : "-";
  };
  const dept = depts.find((d) => d.id === view) ?? null;
  const isHead = !!dept && !!myEmployeeId && dept.head_employee_id === myEmployeeId;
  const deptMembers = dept ? employees.filter((e) => e.department_id === dept.id || e.id === dept.head_employee_id) : [];

  const load = useCallback(async () => {
    const { from, to } = monthRange(month);
    const [{ data: scoreRows, error: sErr }, cardRes] = await Promise.all([
      supabase.rpc("task_scores", { p_from: from, p_to: to }),
      view !== "overview"
        ? supabase
            .from("task_cards")
            .select("id, department_id, title, description, status, assignee_employee_id, created_by_employee_id, weight, due_date, quality, is_late, review_note")
            .eq("department_id", view)
            .neq("status", "cancelled")
            .order("position")
        : Promise.resolve({ data: [] as Card[], error: null }),
    ]);
    if (sErr || cardRes.error) setError((sErr ?? cardRes.error)?.message ?? null);
    setScores((scoreRows ?? []) as Score[]);
    setCards((cardRes.data ?? []) as Card[]);
  }, [month, supabase, view]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setSaving(true);
    setError(null);
    const { error: err } = await fn();
    setSaving(false);
    if (err) {
      setError(err.message);
      return false;
    }
    await load();
    return true;
  }

  async function setHead(deptId: string, headId: string) {
    const ok = await run(() => supabase.from("departments").update({ head_employee_id: headId || null }).eq("id", deptId));
    if (ok) setDepts((ds) => ds.map((d) => (d.id === deptId ? { ...d, head_employee_id: headId || null } : d)));
  }

  const openCard = cards.find((c) => c.id === openId) ?? null;
  const canEdit = canManage || isHead;

  function startNew() {
    setOpenId("new");
    setTitle("");
    setDescription("");
    setAssignee(deptMembers[0]?.id ?? "");
    setWeight(2);
    setDueDate("");
    setQuality(0);
    setNote("");
    setError(null);
  }

  function startOpen(c: Card) {
    setOpenId(c.id);
    setTitle(c.title);
    setDescription(c.description ?? "");
    setAssignee(c.assignee_employee_id);
    setWeight(c.weight);
    setDueDate(c.due_date ?? "");
    setQuality(c.quality ?? 0);
    setNote(c.review_note ?? "");
    setError(null);
  }

  async function save() {
    if (!dept) return;
    if (!title.trim()) return setError("กรุณากรอกชื่องาน");
    if (!assignee) return setError("กรุณาเลือกผู้รับผิดชอบ");
    const values = { title: title.trim(), description: description.trim() || null, assignee_employee_id: assignee, weight, due_date: dueDate || null };
    const ok =
      openId === "new"
        ? await run(() => supabase.from("task_cards").insert({ org_id: orgId, department_id: dept.id, ...values }))
        : await run(() => supabase.from("task_cards").update(values).eq("id", openId!));
    if (ok) setOpenId(null);
  }

  async function move(c: Card, status: Status, extra: Record<string, unknown> = {}) {
    const ok = await run(() => supabase.from("task_cards").update({ status, ...extra }).eq("id", c.id));
    if (ok) setOpenId(null);
  }

  // ---- overview: % per department and per person -------------------------------------------------------------
  const byDept = new Map<string, Score[]>();
  for (const s of scores) byDept.set(s.department_id, [...(byDept.get(s.department_id) ?? []), s]);
  const deptPct = (list: Score[]) => {
    const e = list.reduce((a, s) => a + Number(s.earned), 0);
    const p = list.reduce((a, s) => a + Number(s.possible), 0);
    return p > 0 ? Math.round((1000 * e) / p) / 10 : null;
  };
  const today = bangkokToday();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setView("overview")}
          className={clsx("rounded-full border px-4 py-1.5 text-sm", view === "overview" ? "border-primary bg-primary font-bold text-white" : "border-outline-variant")}
        >
          ภาพรวมคะแนน
        </button>
        {depts.map((d) => (
          <button
            key={d.id}
            onClick={() => setView(d.id)}
            className={clsx("rounded-full border px-4 py-1.5 text-sm", view === d.id ? "border-primary bg-primary font-bold text-white" : "border-outline-variant")}
          >
            {d.name}
          </button>
        ))}
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="ml-auto h-9 rounded-lg border border-outline-variant px-3 text-sm" />
      </div>

      {error && openId === null && <p className="text-sm font-semibold text-status-danger">{error}</p>}

      {view === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {depts.map((d) => {
            const list = [...(byDept.get(d.id) ?? [])].sort((a, b) => Number(b.percent ?? 0) - Number(a.percent ?? 0));
            const pct = deptPct(list);
            return (
              <section key={d.id} className="space-y-3 rounded-xl border border-outline-variant bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-on-surface">{d.name}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-on-surface-variant">
                      หัวหน้าแผนก:
                      {canManage ? (
                        <select
                          value={d.head_employee_id ?? ""}
                          disabled={saving}
                          onChange={(e) => setHead(d.id, e.target.value)}
                          className="h-8 rounded-lg border border-outline-variant px-2 text-xs"
                        >
                          <option value="">— ยังไม่กำหนด —</option>
                          {employees
                            .filter((e) => e.department_id === d.id || e.id === d.head_employee_id)
                            .map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.nickname ? `${e.nickname} · ` : ""}
                                {e.first_name} {e.last_name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <b>{d.head_employee_id ? name(d.head_employee_id) : "ยังไม่กำหนด"}</b>
                      )}
                    </div>
                  </div>
                  <p className={clsx("text-3xl font-bold", pctTone(pct))}>{pct != null ? `${pct}%` : "-"}</p>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs text-on-surface-variant">
                    <tr className="border-b border-outline-variant">
                      <th className="py-1.5 text-left">พนักงาน</th>
                      <th className="py-1.5 text-right">เสร็จ/นับ</th>
                      <th className="py-1.5 text-right">ส่งช้า</th>
                      <th className="py-1.5 text-right">ค้างเลยกำหนด</th>
                      <th className="py-1.5 text-right">คะแนน</th>
                      <th className="py-1.5 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {list.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-xs text-on-surface-variant">
                          ยังไม่มีงานที่นับคะแนนในเดือนนี้
                        </td>
                      </tr>
                    )}
                    {list.map((s) => (
                      <tr key={s.employee_id}>
                        <td className="py-1.5">{name(s.employee_id)}</td>
                        <td className="py-1.5 text-right">
                          {s.done_count}/{s.cards_counted}
                        </td>
                        <td className="py-1.5 text-right">{s.late_count}</td>
                        <td className="py-1.5 text-right">{s.overdue_open_count}</td>
                        <td className="py-1.5 text-right text-xs text-on-surface-variant">
                          {Number(s.earned)}/{Number(s.possible)}
                        </td>
                        <td className={clsx("py-1.5 text-right font-bold", pctTone(s.percent))}>{s.percent != null ? `${s.percent}%` : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
          <section className="space-y-1 rounded-xl border border-outline-variant bg-white p-4 text-xs text-on-surface-variant shadow-sm lg:col-span-2">
            <p className="font-bold text-on-surface">วิธีคิดคะแนน</p>
            <p>• แต่ละการ์ดมีน้ำหนักงาน 1–5 ที่หัวหน้าแผนกกำหนด · คะแนนเต็มของการ์ด = น้ำหนัก × 5</p>
            <p>• คะแนนที่ได้ = น้ำหนัก × ดาวคุณภาพ (1–5) ที่หัวหน้าให้ตอนอนุมัติ · ส่งตรวจหลังกำหนดได้ 80%</p>
            <p>• งานที่เลยกำหนดแล้วยังไม่เสร็จนับเป็น 0 · งานที่ยังไม่ถึงกำหนดหรือไม่มีกำหนดส่งยังไม่นับ · งานที่ยกเลิกไม่นับ</p>
            <p>• % = คะแนนที่ได้ ÷ คะแนนเต็มของงานที่ได้รับ ในเดือนที่ครบกำหนด · % แผนก = รวมทุกคนในแผนก</p>
          </section>
        </div>
      )}

      {dept && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-on-surface-variant">
              หัวหน้าแผนก: <b className="text-on-surface">{dept.head_employee_id ? name(dept.head_employee_id) : "ยังไม่กำหนด (ตั้งได้ที่ ภาพรวมคะแนน)"}</b>
              {isHead && <span className="ml-1 font-bold text-primary">(คุณ)</span>}
            </p>
            {canEdit && (
              <button onClick={startNew} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">
                + เพิ่มการ์ด
              </button>
            )}
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {COLUMNS.map((col) => {
              const list = cards.filter((c) => c.status === col.status);
              return (
                <div key={col.status} className={clsx("w-72 shrink-0 rounded-xl p-3", col.tone)}>
                  <p className="mb-2 text-sm font-bold">
                    {col.label} <span className="font-semibold text-on-surface-variant">({list.length})</span>
                  </p>
                  <div className="space-y-2">
                    {list.map((c) => {
                      const overdue = c.status !== "done" && !!c.due_date && c.due_date < today;
                      return (
                        <button key={c.id} onClick={() => startOpen(c)} className="block w-full space-y-1 rounded-lg bg-white p-3 text-left shadow-sm hover:shadow">
                          <p className="text-sm font-semibold">{c.title}</p>
                          <p className="text-xs text-on-surface-variant">
                            {name(c.assignee_employee_id)} · น้ำหนัก {c.weight}
                            {c.due_date && <span className={clsx(overdue && "font-bold text-status-danger")}> · {overdue ? "⚠ " : ""}{fmtDay(c.due_date)}</span>}
                          </p>
                          {c.status === "done" && (
                            <p className="flex items-center gap-2">
                              <Stars value={c.quality ?? 0} />
                              {c.is_late && <span className="text-[11px] font-bold text-status-warning">ส่งเกินกำหนด</span>}
                            </p>
                          )}
                        </button>
                      );
                    })}
                    {list.length === 0 && <p className="py-4 text-center text-xs text-on-surface-variant">ไม่มีการ์ด</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {openId !== null && dept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setOpenId(null)}>
          <div className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold">{openId === "new" ? `เพิ่มการ์ด · ${dept.name}` : "รายละเอียดงาน"}</p>
            <div>
              <label className={labelCls}>ชื่องาน</label>
              <input value={title} disabled={!canEdit} onChange={(e) => setTitle(e.target.value)} className={field} />
            </div>
            <div>
              <label className={labelCls}>รายละเอียด</label>
              <textarea value={description} disabled={!canEdit} onChange={(e) => setDescription(e.target.value)} rows={3} className={field} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>ผู้รับผิดชอบ</label>
                <select value={assignee} disabled={!canEdit} onChange={(e) => setAssignee(e.target.value)} className={field}>
                  {deptMembers.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nickname || e.first_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>น้ำหนัก (1–5)</label>
                <select value={weight} disabled={!canEdit} onChange={(e) => setWeight(Number(e.target.value))} className={field}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>กำหนดส่ง</label>
                <input type="date" value={dueDate} disabled={!canEdit} onChange={(e) => setDueDate(e.target.value)} className={field} />
              </div>
            </div>

            {openCard?.status === "done" && (
              <div className="rounded-lg bg-[#e9f8ee] p-3 text-sm">
                <Stars value={openCard.quality ?? 0} /> {openCard.is_late && <span className="ml-2 text-xs font-bold text-status-warning">ส่งเกินกำหนด (ได้ 80%)</span>}
                {openCard.review_note && <p className="mt-1 text-xs text-on-surface-variant">{openCard.review_note}</p>}
              </div>
            )}

            {openCard?.status === "review" &&
              (isHead ? (
                <div className="space-y-2 rounded-lg bg-[#eaf2ff] p-3">
                  <p className="text-sm font-bold">ตรวจงาน: ให้คะแนนคุณภาพ</p>
                  <Stars value={quality} onChange={setQuality} />
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={field} placeholder="ความเห็นถึงผู้รับผิดชอบ (ไม่บังคับ)" />
                  <div className="flex gap-2">
                    <button
                      disabled={saving || quality === 0}
                      onClick={() => move(openCard, "done", { quality, review_note: note.trim() || null })}
                      className="h-10 flex-1 rounded-lg bg-status-success font-bold text-white disabled:opacity-50"
                    >
                      ✓ อนุมัติเสร็จ
                    </button>
                    <button
                      disabled={saving}
                      onClick={() => move(openCard, "doing", { review_note: note.trim() || null })}
                      className="h-10 flex-1 rounded-lg border border-status-danger font-bold text-status-danger disabled:opacity-50"
                    >
                      ↩ ส่งกลับแก้ไข
                    </button>
                  </div>
                </div>
              ) : (
                <p className="rounded-lg bg-[#eaf2ff] p-3 text-xs text-on-surface-variant">
                  รอหัวหน้าแผนก ({dept.head_employee_id ? name(dept.head_employee_id) : "ยังไม่กำหนด"}) ตรวจและอนุมัติ — HR / แอดมินอนุมัติแทนไม่ได้
                </p>
              ))}

            {error && <p className="text-sm font-semibold text-status-danger">{error}</p>}

            <div className="flex flex-wrap gap-2">
              {canEdit && openCard?.status !== "done" && (
                <button onClick={save} disabled={saving} className="h-10 rounded-lg bg-primary px-5 font-bold text-white disabled:opacity-60">
                  {saving ? "กำลังบันทึก..." : openId === "new" ? "เพิ่มการ์ด" : "บันทึก"}
                </button>
              )}
              {openCard && isHead && openCard.status === "done" && (
                <button onClick={() => move(openCard, "doing")} disabled={saving} className="h-10 rounded-lg border border-outline-variant px-4 text-sm font-semibold">
                  ↺ เปิดงานใหม่
                </button>
              )}
              {openCard && canEdit && openCard.status !== "done" && (
                <button onClick={() => move(openCard, "cancelled")} disabled={saving} className="h-10 rounded-lg px-4 text-sm font-semibold text-on-surface-variant">
                  ยกเลิกงาน (ไม่นับคะแนน)
                </button>
              )}
              <button onClick={() => setOpenId(null)} disabled={saving} className="ml-auto h-10 px-4 text-sm font-semibold text-on-surface-variant">
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
