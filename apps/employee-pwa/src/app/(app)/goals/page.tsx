"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";

// Department task board (owner 2026-11-13): Trello-style columns. The head and the members add cards; members move
// their own cards and send them to the head; ONLY the department head approves a card as done and scores its
// quality. The % score is computed by the database (task_scores) — the rules are enforced there too.

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
  position: number;
  quality: number | null;
  is_late: boolean | null;
  review_note: string | null;
  submitted_at: string | null;
}

interface Member {
  employee_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  is_head: boolean;
}

interface Dept {
  id: string;
  name: string;
  head_employee_id: string | null;
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

const field = "w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm";
const labelCls = "mb-1.5 block text-sm font-semibold text-on-surface-variant";

const bangkokToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
const memberName = (m: Member | undefined) => (m ? m.nickname || m.first_name : "-");

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
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
          aria-label={`${n}`}
        >
          ★
        </button>
      ))}
    </span>
  );
}

function Weight({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-0.5" title="น้ำหนักงาน">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={clsx("h-1.5 w-1.5 rounded-full", n <= value ? "bg-primary" : "bg-outline-variant")} />
      ))}
    </span>
  );
}

function pctTone(p: number | null) {
  if (p == null) return "text-on-surface-variant";
  if (p >= 80) return "text-status-success";
  if (p >= 60) return "text-status-warning";
  return "text-status-danger";
}

export default function TaskBoardPage() {
  const { t } = useT();
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const me = profile?.employeeId ?? "";

  const [depts, setDepts] = useState<Dept[]>([]);
  const [deptId, setDeptId] = useState<string>("");
  const [members, setMembers] = useState<Member[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [tab, setTab] = useState<"board" | "score">("board");
  const [month, setMonth] = useState(bangkokToday().slice(0, 7));
  const [onlyMine, setOnlyMine] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // editor
  const [openId, setOpenId] = useState<string | null>(null); // "new" or card id
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [weight, setWeight] = useState(1);
  const [dueDate, setDueDate] = useState("");
  const [quality, setQuality] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dept = depts.find((d) => d.id === deptId) ?? null;
  const isHead = !!dept && !!me && dept.head_employee_id === me;
  const memberById = useMemo(() => new Map(members.map((m) => [m.employee_id, m])), [members]);

  // Departments I can open: my own, plus any I am the head of.
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [{ data: meRow }, { data: deptRows }] = await Promise.all([
        supabase.from("employees").select("department_id").eq("id", profile.employeeId).maybeSingle(),
        supabase.from("departments").select("id, name, head_employee_id").eq("org_id", profile.orgId).is("deleted_at", null).order("name"),
      ]);
      const mine = (deptRows ?? []).filter((d) => d.id === meRow?.department_id || d.head_employee_id === profile.employeeId) as Dept[];
      setDepts(mine);
      setDeptId((cur) => cur || meRow?.department_id || mine[0]?.id || "");
      if (mine.length === 0) setLoaded(true);
    })();
  }, [profile, supabase]);

  const load = useCallback(async () => {
    if (!deptId) return;
    const { from, to } = monthRange(month);
    const [{ data: cardRows, error: cardErr }, { data: memberRows }, { data: scoreRows }] = await Promise.all([
      supabase
        .from("task_cards")
        .select("id, department_id, title, description, status, assignee_employee_id, created_by_employee_id, weight, due_date, position, quality, is_late, review_note, submitted_at")
        .eq("department_id", deptId)
        .neq("status", "cancelled")
        .order("position"),
      supabase.rpc("task_board_members", { p_department_id: deptId }),
      supabase.rpc("task_scores", { p_from: from, p_to: to }),
    ]);
    if (cardErr) setError(cardErr.message);
    setCards((cardRows ?? []) as Card[]);
    setMembers((memberRows ?? []) as Member[]);
    setScores(((scoreRows ?? []) as Score[]).filter((s) => s.department_id === deptId));
    setLoaded(true);
  }, [deptId, month, supabase]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const openCard = cards.find((c) => c.id === openId) ?? null;
  const own = !!openCard && (openCard.assignee_employee_id === me || openCard.created_by_employee_id === me);
  const canEditText = openId === "new" || isHead || (own && (openCard?.status === "todo" || openCard?.status === "doing"));
  const canEditPlan = openId === "new" ? true : isHead; // due date / weight / assignee (members: only when creating)

  function startNew() {
    setOpenId("new");
    setTitle("");
    setDescription("");
    setAssignee(me);
    setWeight(isHead ? 2 : 1);
    setDueDate("");
    setQuality(0);
    setNote("");
    setError(null);
    setConfirmDelete(false);
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
    setConfirmDelete(false);
  }

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

  async function saveDetails() {
    if (!profile || !deptId) return;
    if (!title.trim()) {
      setError(t("กรุณากรอกชื่องาน"));
      return;
    }
    if (openId === "new") {
      const ok = await run(() =>
        supabase.from("task_cards").insert({
          org_id: profile.orgId,
          department_id: deptId,
          title: title.trim(),
          description: description.trim() || null,
          assignee_employee_id: isHead ? assignee || me : me,
          weight: isHead ? weight : 1,
          due_date: dueDate || null,
        })
      );
      if (ok) setOpenId(null);
      return;
    }
    if (!openCard) return;
    const patch: Record<string, unknown> = {};
    if (canEditText) {
      patch.title = title.trim();
      patch.description = description.trim() || null;
    }
    if (isHead) {
      patch.assignee_employee_id = assignee;
      patch.weight = weight;
      patch.due_date = dueDate || null;
    }
    const ok = await run(() => supabase.from("task_cards").update(patch).eq("id", openCard.id));
    if (ok) setOpenId(null);
  }

  async function move(c: Card, status: Status, extra: Record<string, unknown> = {}) {
    const ok = await run(() => supabase.from("task_cards").update({ status, ...extra }).eq("id", c.id));
    if (ok) setOpenId(null);
  }

  async function remove(c: Card) {
    const ok = await run(() => supabase.from("task_cards").delete().eq("id", c.id));
    if (ok) setOpenId(null);
  }

  const today = bangkokToday();
  const visible = onlyMine ? cards.filter((c) => c.assignee_employee_id === me) : cards;

  const deptTotals = scores.reduce(
    (acc, s) => ({ earned: acc.earned + Number(s.earned), possible: acc.possible + Number(s.possible) }),
    { earned: 0, possible: 0 }
  );
  const deptPct = deptTotals.possible > 0 ? Math.round((1000 * deptTotals.earned) / deptTotals.possible) / 10 : null;
  const myScore = scores.find((s) => s.employee_id === me);

  if (loaded && depts.length === 0) {
    return (
      <div className="space-y-3 p-5">
        <h1 className="text-xl font-bold text-on-surface">{t("บอร์ดงาน & KPI")}</h1>
        <p className="text-sm text-on-surface-variant">{t("คุณยังไม่ได้อยู่ในแผนกใด กรุณาติดต่อ HR")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-5 pb-28">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-on-surface">{t("บอร์ดงาน & KPI")}</h1>
          <p className="text-xs text-on-surface-variant">
            {dept?.name ?? ""} · {t("หัวหน้า")}: {dept?.head_employee_id ? memberName(memberById.get(dept.head_employee_id)) : t("ยังไม่ได้กำหนด")}
            {isHead && <span className="ml-1 font-bold text-primary">({t("คุณ")})</span>}
          </p>
        </div>
        {depts.length > 1 && (
          <select value={deptId} onChange={(e) => setDeptId(e.target.value)} className="rounded-xl border border-outline-variant px-2 py-1.5 text-sm">
            {depts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {!dept?.head_employee_id && (
        <p className="rounded-xl bg-[#fff6e5] p-3 text-xs text-on-surface">
          {t("แผนกนี้ยังไม่มีหัวหน้าผู้อนุมัติงาน เพิ่มการ์ดและส่งตรวจได้ แต่จะยังอนุมัติไม่ได้จนกว่า HR จะกำหนดหัวหน้า")}
        </p>
      )}

      <div className="flex gap-2">
        {(["board", "score"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={clsx(
              "rounded-full border px-4 py-1.5 text-sm",
              tab === k ? "border-primary bg-primary font-bold text-white" : "border-outline-variant text-on-surface-variant"
            )}
          >
            {k === "board" ? t("บอร์ดงาน") : t("คะแนนผลงาน")}
          </button>
        ))}
      </div>

      {error && openId === null && <p className="text-sm text-status-danger">{error}</p>}

      {tab === "board" && (
        <>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-on-surface-variant">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              {t("เฉพาะงานของฉัน")}
            </label>
            <button onClick={startNew} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white">
              + {t("เพิ่มการ์ด")}
            </button>
          </div>

          <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2">
            {COLUMNS.map((col) => {
              const list = visible.filter((c) => c.status === col.status);
              return (
                <div key={col.status} className={clsx("w-[78vw] max-w-[300px] shrink-0 snap-start rounded-2xl p-3", col.tone)}>
                  <p className="mb-2 text-sm font-bold text-on-surface">
                    {t(col.label)} <span className="font-semibold text-on-surface-variant">({list.length})</span>
                  </p>
                  <div className="space-y-2">
                    {list.length === 0 && <p className="py-4 text-center text-xs text-on-surface-variant">{t("ไม่มีการ์ด")}</p>}
                    {list.map((c) => {
                      const overdue = c.status !== "done" && !!c.due_date && c.due_date < today;
                      return (
                        <button
                          key={c.id}
                          onClick={() => startOpen(c)}
                          className="block w-full space-y-1.5 rounded-xl bg-white p-3 text-left shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                        >
                          <p className="text-sm font-semibold text-on-surface">{c.title}</p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-surface-variant">
                            <span className={clsx(c.assignee_employee_id === me && "font-bold text-primary")}>
                              {memberName(memberById.get(c.assignee_employee_id))}
                            </span>
                            <Weight value={c.weight} />
                            {c.due_date && (
                              <span className={clsx(overdue && "font-bold text-status-danger")}>
                                {overdue ? "⚠ " : ""}
                                {fmtDay(c.due_date)}
                              </span>
                            )}
                          </div>
                          {c.status === "done" && (
                            <div className="flex items-center gap-2">
                              <Stars value={c.quality ?? 0} />
                              {c.is_late && <span className="text-[11px] font-bold text-status-warning">{t("ส่งเกินกำหนด")}</span>}
                            </div>
                          )}
                          {c.status === "doing" && c.review_note && (
                            <p className="text-[11px] text-status-danger">↩ {c.review_note}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "score" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border border-outline-variant px-3 py-1.5 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
              <p className="text-xs text-on-surface-variant">{t("ของฉัน")}</p>
              <p className={clsx("text-3xl font-bold", pctTone(myScore?.percent ?? null))}>{myScore?.percent != null ? `${myScore.percent}%` : "-"}</p>
              {myScore && (
                <p className="text-[11px] text-on-surface-variant">
                  {t("เสร็จ")} {myScore.done_count}/{myScore.cards_counted} · {t("เกินกำหนด")} {myScore.late_count}
                </p>
              )}
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
              <p className="text-xs text-on-surface-variant">{t("ทั้งแผนก")}</p>
              <p className={clsx("text-3xl font-bold", pctTone(deptPct))}>{deptPct != null ? `${deptPct}%` : "-"}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <table className="w-full text-sm">
              <thead className="bg-surface-container text-xs text-on-surface-variant">
                <tr>
                  <th className="px-3 py-2 text-left">{t("ชื่อ")}</th>
                  <th className="px-2 py-2 text-right">{t("เสร็จ/นับ")}</th>
                  <th className="px-2 py-2 text-right">{t("ค้าง")}</th>
                  <th className="px-3 py-2 text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {scores.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-xs text-on-surface-variant">
                      {t("ยังไม่มีงานที่นับคะแนนในเดือนนี้")}
                    </td>
                  </tr>
                )}
                {[...scores]
                  .sort((a, b) => Number(b.percent ?? 0) - Number(a.percent ?? 0))
                  .map((s) => (
                    <tr key={s.employee_id} className={clsx(s.employee_id === me && "bg-[#f3f7ff]")}>
                      <td className="px-3 py-2">{memberName(memberById.get(s.employee_id))}</td>
                      <td className="px-2 py-2 text-right">
                        {s.done_count}/{s.cards_counted}
                      </td>
                      <td className="px-2 py-2 text-right">{s.overdue_open_count}</td>
                      <td className={clsx("px-3 py-2 text-right font-bold", pctTone(s.percent))}>{s.percent != null ? `${s.percent}%` : "-"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-1 rounded-2xl bg-white p-4 text-xs text-on-surface-variant shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <p className="font-bold text-on-surface">{t("วิธีคิดคะแนน")}</p>
            <p>• {t("แต่ละการ์ดมีน้ำหนักงาน 1–5 ที่หัวหน้ากำหนด (งานยากได้น้ำหนักมาก)")}</p>
            <p>• {t("คะแนนเต็มของการ์ด = น้ำหนัก × 5")}</p>
            <p>• {t("คะแนนที่ได้ = น้ำหนัก × ดาวคุณภาพที่หัวหน้าให้ตอนอนุมัติ (ส่งเกินกำหนดได้ 80%)")}</p>
            <p>• {t("งานที่เลยกำหนดแล้วยังไม่เสร็จ นับเป็น 0 · งานที่ยังไม่ถึงกำหนดยังไม่นับ")}</p>
            <p>• {t("% = คะแนนที่ได้ ÷ คะแนนเต็มของงานที่ได้รับ ในเดือนที่ครบกำหนด")}</p>
          </div>
        </div>
      )}

      {openId !== null && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => !saving && setOpenId(null)}>
          <div className="max-h-[90vh] w-full space-y-3 overflow-y-auto rounded-t-3xl bg-white p-5 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-on-surface">{openId === "new" ? t("เพิ่มการ์ดงาน") : t("รายละเอียดงาน")}</p>
              {openCard && (
                <span className="text-xs font-bold text-on-surface-variant">{t(COLUMNS.find((c) => c.status === openCard.status)?.label ?? "")}</span>
              )}
            </div>

            <div>
              <label className={labelCls}>{t("ชื่องาน")}</label>
              <input value={title} disabled={!canEditText} onChange={(e) => setTitle(e.target.value)} className={field} placeholder={t("เช่น ทำคอนเทนต์โปรโมชัน 11.11")} />
            </div>
            <div>
              <label className={labelCls}>{t("รายละเอียด")}</label>
              <textarea value={description} disabled={!canEditText} onChange={(e) => setDescription(e.target.value)} rows={3} className={field} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t("ผู้รับผิดชอบ")}</label>
                <select value={assignee} disabled={!isHead} onChange={(e) => setAssignee(e.target.value)} className={field}>
                  {members.map((m) => (
                    <option key={m.employee_id} value={m.employee_id}>
                      {memberName(m)}
                      {m.is_head ? ` (${t("หัวหน้า")})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t("กำหนดส่ง")}</label>
                <input type="date" value={dueDate} disabled={!canEditPlan} onChange={(e) => setDueDate(e.target.value)} className={field} />
              </div>
            </div>
            <div>
              <label className={labelCls}>
                {t("น้ำหนักงาน (ความยาก)")} {!isHead && <span className="font-normal">· {t("หัวหน้าเป็นผู้กำหนด")}</span>}
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={!isHead}
                    onClick={() => setWeight(n)}
                    className={clsx(
                      "h-10 flex-1 rounded-xl border text-sm font-bold",
                      weight === n ? "border-primary bg-primary text-white" : "border-outline-variant text-on-surface-variant",
                      !isHead && "opacity-60"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {openCard?.status === "done" && (
              <div className="rounded-xl bg-[#e9f8ee] p-3 text-sm">
                <Stars value={openCard.quality ?? 0} /> {openCard.is_late && <span className="ml-2 text-xs font-bold text-status-warning">{t("ส่งเกินกำหนด (ได้ 80%)")}</span>}
                {openCard.review_note && <p className="mt-1 text-xs text-on-surface-variant">{openCard.review_note}</p>}
              </div>
            )}

            {/* the head checks a card that was sent for review */}
            {openCard?.status === "review" && isHead && (
              <div className="space-y-2 rounded-xl bg-[#eaf2ff] p-3">
                <p className="text-sm font-bold text-on-surface">{t("ตรวจงาน: ให้คะแนนคุณภาพ")}</p>
                <Stars value={quality} onChange={setQuality} />
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={field} placeholder={t("ความเห็นถึงผู้รับผิดชอบ (ไม่บังคับ)")} />
                <div className="flex gap-2">
                  <button
                    disabled={saving || quality === 0}
                    onClick={() => move(openCard, "done", { quality, review_note: note.trim() || null })}
                    className="h-11 flex-1 rounded-2xl bg-status-success font-bold text-white disabled:opacity-50"
                  >
                    ✓ {t("อนุมัติเสร็จ")}
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => move(openCard, "doing", { review_note: note.trim() || null })}
                    className="h-11 flex-1 rounded-2xl border border-status-danger font-bold text-status-danger disabled:opacity-50"
                  >
                    ↩ {t("ส่งกลับแก้ไข")}
                  </button>
                </div>
                {quality === 0 && <p className="text-xs text-on-surface-variant">{t("เลือกดาวก่อนกดอนุมัติ")}</p>}
              </div>
            )}

            {error && <p className="text-sm text-status-danger">{error}</p>}

            {(openId === "new" || canEditText || isHead) && openCard?.status !== "done" && (
              <button onClick={saveDetails} disabled={saving} className="h-11 w-full rounded-2xl bg-primary font-bold text-white disabled:opacity-60">
                {saving ? t("กำลังบันทึก...") : openId === "new" ? t("เพิ่มการ์ด") : t("บันทึกการแก้ไข")}
              </button>
            )}

            {openCard && (
              <div className="flex flex-wrap gap-2 pt-1">
                {(own || isHead) && openCard.status === "todo" && (
                  <button onClick={() => move(openCard, "doing")} disabled={saving} className="rounded-xl bg-surface-container px-3 py-2 text-sm font-bold">
                    ▶ {t("เริ่มทำ")}
                  </button>
                )}
                {(own || isHead) && openCard.status === "doing" && (
                  <>
                    <button onClick={() => move(openCard, "review")} disabled={saving} className="rounded-xl bg-[#eaf2ff] px-3 py-2 text-sm font-bold text-primary">
                      ➜ {t("ส่งให้หัวหน้าตรวจ")}
                    </button>
                    <button onClick={() => move(openCard, "todo")} disabled={saving} className="rounded-xl bg-surface-container px-3 py-2 text-sm font-semibold">
                      ← {t("กลับไปต้องทำ")}
                    </button>
                  </>
                )}
                {own && !isHead && openCard.status === "review" && (
                  <button onClick={() => move(openCard, "doing")} disabled={saving} className="rounded-xl bg-surface-container px-3 py-2 text-sm font-semibold">
                    ← {t("ดึงกลับมาแก้")}
                  </button>
                )}
                {isHead && openCard.status === "done" && (
                  <button onClick={() => move(openCard, "doing")} disabled={saving} className="rounded-xl bg-surface-container px-3 py-2 text-sm font-semibold">
                    ↺ {t("เปิดงานใหม่")}
                  </button>
                )}
                {isHead && openCard.status !== "done" && (
                  <button onClick={() => move(openCard, "cancelled")} disabled={saving} className="rounded-xl px-3 py-2 text-sm font-semibold text-on-surface-variant">
                    {t("ยกเลิกงาน (ไม่นับคะแนน)")}
                  </button>
                )}
                {(isHead || (openCard.created_by_employee_id === me && (openCard.status === "todo" || openCard.status === "doing"))) &&
                  (confirmDelete ? (
                    <span className="flex items-center gap-2 text-sm">
                      <span className="font-semibold text-status-danger">{t("ลบการ์ดนี้?")}</span>
                      <button onClick={() => remove(openCard)} className="font-bold text-status-danger">
                        {t("ยืนยัน")}
                      </button>
                      <button onClick={() => setConfirmDelete(false)} className="text-on-surface-variant">
                        {t("ไม่ลบ")}
                      </button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmDelete(true)} className="rounded-xl px-3 py-2 text-sm font-semibold text-status-danger">
                      {t("ลบ")}
                    </button>
                  ))}
              </div>
            )}

            <button onClick={() => setOpenId(null)} disabled={saving} className="h-10 w-full text-sm font-semibold text-on-surface-variant">
              {t("ปิด")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
