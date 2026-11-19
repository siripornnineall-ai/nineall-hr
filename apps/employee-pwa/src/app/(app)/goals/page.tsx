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
  parent_id: string | null;
  is_group: boolean;
  link_url: string | null;
  attachment_path: string | null;
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

const addDaysIso = (n: number) => {
  const d = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date())}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmtFullDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });

const normLink = (v: string): string | null => {
  const x = v.trim();
  if (!x) return null;
  return /^https?:\/\//i.test(x) ? x : `https://${x}`;
};
const safeHref = (v: string) => (/^https?:\/\//i.test(v) ? v : "#");

// Phone photos are several MB: shrink to 1600px JPEG before uploading (falls back to the original file).
async function shrinkImage(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("resize"))), "image/jpeg", 0.82));
  } catch {
    return file;
  }
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
  const [myDeptId, setMyDeptId] = useState<string>("");
  const [isReviewer, setIsReviewer] = useState(false); // checks the work of everyone, in every department
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
  const [draftItems, setDraftItems] = useState<string[]>([]); // checklist items typed while creating a new card
  const [draftText, setDraftText] = useState("");
  const [link, setLink] = useState("");
  const [attachPath, setAttachPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [groupOpenId, setGroupOpenId] = useState<string | null>(null); // a heading opened from the board
  const [groupItemText, setGroupItemText] = useState("");
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dept = depts.find((d) => d.id === deptId) ?? null;
  const isHead = !!dept && !!me && dept.head_employee_id === me;
  // Every department's board is visible to everyone (transparency), but only my own department (or one I head) is editable.
  const readOnly = !!dept && !isHead && dept.id !== myDeptId;
  const itemsOf = (parentId: string) => cards.filter((c) => c.parent_id === parentId);
  const memberById = useMemo(() => new Map(members.map((m) => [m.employee_id, m])), [members]);

  // All departments, read-only except my own / ones I head.
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [{ data: meRow }, { data: deptRows }] = await Promise.all([
        supabase.from("employees").select("department_id, task_reviewer").eq("id", profile.employeeId).maybeSingle(),
        supabase.from("departments").select("id, name, head_employee_id").eq("org_id", profile.orgId).is("deleted_at", null).order("name"),
      ]);
      const all = (deptRows ?? []) as Dept[];
      setMyDeptId(meRow?.department_id ?? "");
      setIsReviewer(!!(meRow as { task_reviewer?: boolean } | null)?.task_reviewer);
      setDepts(all);
      setDeptId((cur) => cur || meRow?.department_id || all[0]?.id || "");
      if (all.length === 0) setLoaded(true);
    })();
  }, [profile, supabase]);

  const load = useCallback(async () => {
    if (!deptId) return;
    const { from, to } = monthRange(month);
    const [{ data: cardRows, error: cardErr }, { data: memberRows }, { data: scoreRows }] = await Promise.all([
      supabase
        .from("task_cards")
        .select("id, department_id, title, description, status, assignee_employee_id, created_by_employee_id, weight, due_date, position, quality, is_late, review_note, submitted_at, parent_id, is_group, link_url, attachment_path")
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
  const own = !readOnly && !!openCard && (openCard.assignee_employee_id === me || openCard.created_by_employee_id === me);
  const canEditText = !readOnly && (openId === "new" || isHead || (own && (openCard?.status === "todo" || openCard?.status === "doing")));
  // The checklist builder: on a new card, or on an existing standalone card that has not been started yet
  // (adding items turns the card into a heading; its items become the cards on the board).
  const canAddItems =
    !readOnly && (openId === "new" || (!!openCard && !openCard.parent_id && !openCard.is_group && openCard.status === "todo" && (isHead || own)));
  // Proof of work (optional link / image): the assignee before sending for review, or the head.
  // Checking work: the department head or the reviewer — never on their own card (a head's own work goes to the reviewer).
  const canReviewCard = (c: Card) => (isHead || isReviewer) && c.assignee_employee_id !== me;
  const canEditProof = !readOnly && !!openCard && !openCard.is_group && (isHead || (own && (openCard.status === "todo" || openCard.status === "doing")));
  const proofExtra = () => (canEditProof ? { link_url: normLink(link), attachment_path: attachPath || null } : {});
  const canEditPlan = !readOnly && (openId === "new" ? true : isHead); // due date / weight / assignee (members: only when creating)

  useEffect(() => {
    if (!attachPath) {
      void Promise.resolve().then(() => setPreviewUrl(null));
      return;
    }
    let cancelled = false;
    supabase.storage
      .from("task-attachments")
      .createSignedUrl(attachPath, 3600)
      .then(({ data }) => {
        if (!cancelled) setPreviewUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [attachPath, supabase]);

  async function uploadProof(file: File) {
    if (!profile || !openCard) return;
    setUploading(true);
    setError(null);
    try {
      const blob = await shrinkImage(file);
      const path = `${profile.orgId}/${openCard.department_id}/${openCard.id}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("task-attachments").upload(path, blob, { contentType: blob.type || "image/jpeg" });
      if (upErr) setError(upErr.message);
      else setAttachPath(path);
    } finally {
      setUploading(false);
    }
  }

  function startNew() {
    setOpenId("new");
    setLink("");
    setAttachPath("");
    setDraftItems([]);
    setDraftText("");
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
    if (c.is_group) {
      setGroupOpenId(c.id);
      setGroupItemText("");
      setConfirmDeleteGroup(false);
      setError(null);
      return;
    }
    setOpenId(c.id);
    setLink(c.link_url ?? "");
    setAttachPath(c.attachment_path ?? "");
    setDraftItems([]);
    setDraftText("");
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
      const base = {
        org_id: profile.orgId,
        department_id: deptId,
        assignee_employee_id: isHead ? assignee || me : me,
        weight: isHead ? weight : 1,
        due_date: dueDate || null,
      };
      const pending = [...draftItems, draftText].map((x) => x.trim()).filter(Boolean);
      if (pending.length === 0) {
        const ok = await run(() => supabase.from("task_cards").insert({ ...base, title: title.trim(), description: description.trim() || null }));
        if (ok) setOpenId(null);
        return;
      }
      // A heading with checklist items: the heading is a container row, every item is its own card on the board.
      const ok = await run(async () => {
        const { data: group, error: gErr } = await supabase
          .from("task_cards")
          .insert({ ...base, title: title.trim(), description: description.trim() || null, is_group: true, weight: 1 })
          .select("id")
          .single();
        if (gErr || !group) return { error: gErr ?? { message: "สร้างหัวข้อไม่สำเร็จ" } };
        const { error: iErr } = await supabase.from("task_cards").insert(pending.map((it, i) => ({ ...base, title: it, parent_id: group.id, position: Date.now() / 1000 + i * 0.001 })));
        if (iErr) await supabase.from("task_cards").delete().eq("id", group.id); // don't leave an empty heading behind
        return { error: iErr };
      });
      if (ok) setOpenId(null);
      return;
    }
    if (!openCard) return;
    const pendingItems = [...draftItems, draftText].map((x) => x.trim()).filter(Boolean);
    if (canAddItems && pendingItems.length > 0) {
      const ok = await run(async () => {
        const base = {
          org_id: profile.orgId,
          department_id: openCard.department_id,
          assignee_employee_id: isHead ? assignee || openCard.assignee_employee_id : openCard.assignee_employee_id,
          weight: isHead ? weight : openCard.weight,
          due_date: (isHead ? dueDate : openCard.due_date) || null,
        };
        const { error: uErr } = await supabase
          .from("task_cards")
          .update({ title: title.trim(), description: description.trim() || null, is_group: true })
          .eq("id", openCard.id);
        if (uErr) return { error: uErr };
        const { error: iErr } = await supabase.from("task_cards").insert(pendingItems.map((it, i) => ({ ...base, title: it, parent_id: openCard.id, position: Date.now() / 1000 + i * 0.001 })));
        if (iErr) await supabase.from("task_cards").update({ is_group: false }).eq("id", openCard.id); // turn it back into a normal card
        return { error: iErr };
      });
      if (ok) setOpenId(null);
      return;
    }
    const patch: Record<string, unknown> = { ...proofExtra() };
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

  const openGroup = cards.find((c) => c.id === groupOpenId && c.is_group) ?? null;
  const groupItems = openGroup ? itemsOf(openGroup.id) : [];
  // the head, or the person who created the heading, can edit it and add items
  const canEditGroup = !!openGroup && !readOnly && (isHead || openGroup.created_by_employee_id === me);

  async function addGroupItem() {
    if (!openGroup || !profile || !groupItemText.trim()) return;
    const last = groupItems[groupItems.length - 1];
    const ok = await run(() =>
      supabase.from("task_cards").insert({
        org_id: profile.orgId,
        department_id: openGroup.department_id,
        title: groupItemText.trim(),
        assignee_employee_id: isHead ? openGroup.assignee_employee_id : me,
        weight: isHead ? (last?.weight ?? 2) : 1,
        due_date: isHead ? (last?.due_date ?? openGroup.due_date) : null,
        parent_id: openGroup.id,
        position: (last?.position ?? Date.now() / 1000) + 1,
      })
    );
    if (ok) setGroupItemText("");
  }

  async function setAllDue(date: string | null) {
    if (!openGroup) return;
    await run(() => supabase.from("task_cards").update({ due_date: date }).or(`id.eq.${openGroup.id},parent_id.eq.${openGroup.id}`).neq("status", "done"));
  }

  async function saveGroupTitle(titleText: string, descText: string) {
    if (!openGroup || !titleText.trim()) return;
    await run(() => supabase.from("task_cards").update({ title: titleText.trim(), description: descText.trim() || null }).eq("id", openGroup.id));
  }

  async function removeGroup() {
    if (!openGroup) return;
    const ok = await run(() => supabase.from("task_cards").delete().eq("id", openGroup.id));
    if (ok) setGroupOpenId(null);
  }

  async function remove(c: Card) {
    const ok = await run(() => supabase.from("task_cards").delete().eq("id", c.id));
    if (ok) setOpenId(null);
  }

  const today = bangkokToday();
  const groupById = new Map(cards.filter((c) => c.is_group).map((c) => [c.id, c]));
  // The board shows standalone cards and headings; a heading's items live inside it (opened by tapping the heading).
  const boardCards = cards.filter((c) => !c.parent_id);
  const visible = onlyMine ? boardCards.filter((c) => (c.is_group ? itemsOf(c.id).some((i) => i.assignee_employee_id === me) : c.assignee_employee_id === me)) : boardCards;

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
            {readOnly ? (
              <span className="text-xs text-on-surface-variant">{t("ดูได้อย่างเดียว (แผนกอื่น)")}</span>
            ) : (
              <button onClick={startNew} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white">
                + {t("เพิ่มการ์ด")}
              </button>
            )}
          </div>

          <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2">
            {COLUMNS.map((col) => {
              // A heading card shows up in every column that holds some of its items, listing only those items:
              // ticking one item moves just that item, not the whole heading.
              const itemsHere = (c: Card) => itemsOf(c.id).filter((i) => i.status === col.status && (!onlyMine || i.assignee_employee_id === me));
              const list = visible.filter((c) => (c.is_group ? itemsHere(c).length > 0 || (col.status === "todo" && itemsOf(c.id).length === 0) : c.status === col.status));
              return (
                <div key={col.status} className={clsx("w-[78vw] max-w-[300px] shrink-0 snap-start rounded-2xl p-3", col.tone)}>
                  <p className="mb-2 text-sm font-bold text-on-surface">
                    {t(col.label)} <span className="font-semibold text-on-surface-variant">({list.length})</span>
                  </p>
                  <div className="space-y-2">
                    {list.length === 0 && <p className="py-4 text-center text-xs text-on-surface-variant">{t("ไม่มีการ์ด")}</p>}
                    {list.map((c) => {
                      if (c.is_group) {
                        const its = itemsOf(c.id);
                        const done = its.filter((i) => i.status === "done").length;
                        const waiting = its.filter((i) => i.status === "review").length;
                        const names = Array.from(new Set(its.map((i) => memberName(memberById.get(i.assignee_employee_id)))));
                        return (
                          <button
                            key={c.id}
                            onClick={() => startOpen(c)}
                            className="block w-full space-y-1.5 rounded-xl bg-white p-3 text-left shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                          >
                            <p className="text-sm font-semibold text-on-surface">{c.title}</p>
                            <div className="h-1.5 overflow-hidden rounded-full bg-outline-variant/50">
                              <div className="h-full bg-status-success" style={{ width: `${its.length ? (done / its.length) * 100 : 0}%` }} />
                            </div>
                            <ul className="space-y-0.5 text-xs text-on-surface">
                              {itemsHere(c).map((i) => (
                                <li key={i.id} className={clsx("flex gap-1", i.status === "done" && "text-on-surface-variant line-through")}>
                                  <span>•</span>
                                  <span>{i.title}</span>
                                </li>
                              ))}
                            </ul>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-surface-variant">
                              <span className="font-bold text-primary">
                                ☑ {done}/{its.length} {t("รายการ")}
                              </span>
                              <span>{names.join(", ")}</span>
                              {(isHead || isReviewer) && col.status === "review" && waiting > 0 && <span className="font-bold text-status-warning">· {waiting} {t("รอตรวจ")}</span>}
                            </div>
                          </button>
                        );
                      }
                      const overdue = c.status !== "done" && !!c.due_date && c.due_date < today;
                      return (
                        <button
                          key={c.id}
                          onClick={() => startOpen(c)}
                          className="block w-full space-y-1.5 rounded-xl bg-white p-3 text-left shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                        >
                          {c.parent_id && groupById.get(c.parent_id) && (
                            <p className="text-[11px] font-bold text-primary">
                              {groupById.get(c.parent_id)!.title} ›{" "}
                              <span className="font-semibold text-on-surface-variant">
                                {itemsOf(c.parent_id).filter((x) => x.status === "done").length}/{itemsOf(c.parent_id).length}
                              </span>
                            </p>
                          )}
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

      <p className="pt-2 text-center text-[10px] text-on-surface-variant/60">v{process.env.NEXT_PUBLIC_BUILD_ID}</p>

      {openGroup && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={() => !saving && setGroupOpenId(null)}>
          <div className="max-h-[90vh] w-full space-y-3 overflow-y-auto rounded-t-3xl bg-white p-5 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-on-surface">{t("งานหัวข้อ")}</p>
              <span className="text-xs font-bold text-on-surface-variant">
                {groupItems.filter((i) => i.status === "done").length}/{groupItems.length} {t("รายการ")}
              </span>
            </div>

            <div>
              <label className={labelCls}>{t("ชื่องาน")}</label>
              <input
                key={`gt-${openGroup.id}-${openGroup.title}`}
                defaultValue={openGroup.title}
                disabled={!canEditGroup}
                onBlur={(e) => e.target.value.trim() !== openGroup.title && saveGroupTitle(e.target.value, openGroup.description ?? "")}
                className={field}
              />
            </div>
            <div>
              <label className={labelCls}>{t("รายละเอียด")}</label>
              <textarea
                key={`gd-${openGroup.id}-${openGroup.description ?? ""}`}
                defaultValue={openGroup.description ?? ""}
                disabled={!canEditGroup}
                rows={2}
                onBlur={(e) => e.target.value.trim() !== (openGroup.description ?? "") && saveGroupTitle(openGroup.title, e.target.value)}
                className={field}
              />
            </div>

            {isHead && groupItems.length > 0 && (
              <div>
                <label className={labelCls}>{t("กำหนดส่งทั้งหัวข้อ (ใช้กับรายการที่ยังไม่เสร็จทุกอัน)")}</label>
                <div className="flex items-center gap-2">
                  <input
                    key={`gdue-${openGroup.id}-${groupItems.find((i) => i.status !== "done")?.due_date ?? ""}`}
                    type="date"
                    defaultValue={groupItems.find((i) => i.status !== "done")?.due_date ?? ""}
                    onChange={(e) => e.target.value && setAllDue(e.target.value)}
                    className={field}
                  />
                  <button type="button" disabled={saving} onClick={() => setAllDue(null)} className="shrink-0 rounded-xl border border-outline-variant px-3 py-2 text-xs font-semibold text-on-surface-variant">
                    {t("ล้างวันที่")}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-on-surface-variant">{t("ตั้งวันที่รายการใดรายการหนึ่งโดยเฉพาะ ให้กดที่รายการนั้น")}</p>
              </div>
            )}

            <div>
              <p className={labelCls}>{t("รายการย่อย (เรียงตามลำดับที่ต้องทำ)")}</p>
              <div className="space-y-1.5">
                {groupItems.length === 0 && <p className="text-xs text-on-surface-variant">{t("ยังไม่มีรายการ")}</p>}
                {groupItems.map((it, idx) => {
                  const mine = !readOnly && it.assignee_employee_id === me;
                  const canTick = mine && it.status === "todo";
                  return (
                    <div key={it.id} className="flex items-center gap-2 rounded-xl bg-surface-container px-3 py-2 text-sm">
                      <button
                        type="button"
                        disabled={!canTick || saving}
                        onClick={() => move(it, "doing")}
                        className={clsx(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-bold",
                          it.status === "done" ? "border-status-success bg-status-success text-white" : it.status === "todo" ? "border-outline-variant bg-white" : "border-primary bg-primary/10 text-primary"
                        )}
                        aria-label={t("เริ่มทำ")}
                      >
                        {it.status === "done" ? "✓" : it.status === "todo" ? "" : "…"}
                      </button>
                      <button type="button" onClick={() => startOpen(it)} className="min-w-0 flex-1 text-left">
                        <span className={clsx("block", it.status === "done" && "text-on-surface-variant line-through")}>
                          {idx + 1}. {it.title}
                        </span>
                        <span className="block text-[11px] text-on-surface-variant">
                          {t(COLUMNS.find((c) => c.status === it.status)?.label ?? "")}
                          {it.assignee_employee_id !== openGroup.assignee_employee_id && ` · ${memberName(memberById.get(it.assignee_employee_id))}`}
                          {it.due_date && ` · ${fmtDay(it.due_date)}`}
                        </span>
                      </button>
                      {mine && it.status === "doing" && (
                        <button type="button" disabled={saving} onClick={() => startOpen(it)} className="shrink-0 rounded-lg bg-[#eaf2ff] px-2 py-1 text-[11px] font-bold text-primary">
                          ➜ {t("ส่งตรวจ")}
                        </button>
                      )}
                      {canReviewCard(it) && it.status === "review" && (
                        <button type="button" onClick={() => startOpen(it)} className="shrink-0 rounded-lg bg-status-warning/20 px-2 py-1 text-[11px] font-bold text-status-warning">
                          {t("ตรวจ")}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {!isHead && groupItems.some((i) => i.status === "todo") && (
                <p className="mt-2 text-[11px] text-on-surface-variant">{t("ติ๊กช่องว่างเพื่อเริ่มทำ (ย้ายไปกำลังทำ) แล้วกดส่งตรวจเมื่อเสร็จ")}</p>
              )}
            </div>

            {canEditGroup && (
              <div className="flex gap-2">
                <input
                  value={groupItemText}
                  onChange={(e) => setGroupItemText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addGroupItem();
                    }
                  }}
                  className={field}
                  placeholder={t("เพิ่มรายการย่อย เช่น ศึกษาตลาด")}
                />
                <button
                  type="button"
                  disabled={saving || !groupItemText.trim()}
                  onClick={addGroupItem}
                  className="shrink-0 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  + {t("เพิ่ม")}
                </button>
              </div>
            )}
            {canEditGroup && <p className="text-[11px] text-on-surface-variant">{t("กดที่รายการเพื่อแก้ไข ตั้งน้ำหนัก กำหนดส่ง หรือลบรายการนั้น")}</p>}

            {error && <p className="text-sm text-status-danger">{error}</p>}

            {isHead &&
              (confirmDeleteGroup ? (
                <span className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-status-danger">{t("ลบทั้งหัวข้อและรายการย่อยทั้งหมด?")}</span>
                  <button onClick={removeGroup} className="font-bold text-status-danger">
                    {t("ยืนยัน")}
                  </button>
                  <button onClick={() => setConfirmDeleteGroup(false)} className="text-on-surface-variant">
                    {t("ไม่ลบ")}
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmDeleteGroup(true)} className="rounded-xl px-3 py-2 text-sm font-semibold text-status-danger">
                  {t("ลบทั้งหัวข้อ")}
                </button>
              ))}

            <button onClick={() => setGroupOpenId(null)} disabled={saving} className="h-10 w-full text-sm font-semibold text-on-surface-variant">
              {t("ปิด")}
            </button>
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

            {/* new card: optional checklist — each item becomes its own card on the board */}
            {canAddItems && (
              <div>
                <label className={labelCls}>{openId === "new" ? t("รายการย่อย (ไม่บังคับ)") : t("เพิ่มรายการย่อยในการ์ดนี้")}</label>
                <p className="mb-2 text-xs text-on-surface-variant">{t("เพิ่มได้หลายรายการ เรียงตามลำดับที่ต้องทำ แตะที่รายการเพื่อแก้ไขข้อความได้ ติ๊กเริ่มทำและส่งตรวจทีละรายการได้")}</p>
                <div className="space-y-1.5">
                  {draftItems.map((it, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-xl bg-surface-container px-3 py-1.5 text-sm">
                      <span className="text-xs font-bold text-on-surface-variant">{i + 1}.</span>
                      <input
                        value={it}
                        onChange={(e) => setDraftItems((d) => d.map((x, j) => (j === i ? e.target.value : x)))}
                        className="min-w-0 flex-1 bg-transparent py-1 outline-none"
                        aria-label={t("แก้ไขรายการ")}
                      />
                      <button type="button" onClick={() => setDraftItems((d) => d.filter((_, j) => j !== i))} className="text-status-danger" aria-label={t("ลบ")}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && draftText.trim()) {
                        e.preventDefault();
                        setDraftItems((d) => [...d, draftText.trim()]);
                        setDraftText("");
                      }
                    }}
                    className={field}
                    placeholder={t("เช่น ยิงแอด")}
                  />
                  <button
                    type="button"
                    disabled={!draftText.trim()}
                    onClick={() => {
                      setDraftItems((d) => [...d, draftText.trim()]);
                      setDraftText("");
                    }}
                    className="shrink-0 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-50"
                  >
                    + {t("เพิ่ม")}
                  </button>
                </div>
              </div>
            )}

            {/* an item opened from the board: the whole checklist of its heading, tick to start / send for review */}
            {openCard?.parent_id && groupById.get(openCard.parent_id) && (
              <div className="rounded-xl bg-surface-container p-3">
                <p className="mb-2 text-sm font-bold text-on-surface">{t("อยู่ในงาน")}: {groupById.get(openCard.parent_id)!.title}</p>
                <div className="space-y-1.5">
                  {itemsOf(openCard.parent_id).map((it) => {
                    const mine = !readOnly && it.assignee_employee_id === me;
                    const canTick = mine && it.status === "todo";
                    return (
                      <div key={it.id} className="flex items-center gap-2 text-sm">
                        <button
                          type="button"
                          disabled={!canTick || saving}
                          onClick={() => move(it, "doing")}
                          className={clsx(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-bold",
                            it.status === "done" ? "border-status-success bg-status-success text-white" : it.status === "todo" ? "border-outline-variant bg-white" : "border-primary bg-primary/10 text-primary",
                            !canTick && "opacity-80"
                          )}
                          aria-label={t("เริ่มทำ")}
                        >
                          {it.status === "done" ? "✓" : it.status === "todo" ? "" : "…"}
                        </button>
                        <button type="button" onClick={() => startOpen(it)} className={clsx("flex-1 text-left", it.id === openCard.id && "font-bold")}>
                          {it.title}
                        </button>
                        <span className="text-[11px] text-on-surface-variant">{t(COLUMNS.find((c) => c.status === it.status)?.label ?? "")}</span>
                        {mine && it.status === "doing" && (
                          <button type="button" disabled={saving} onClick={() => startOpen(it)} className="rounded-lg bg-[#eaf2ff] px-2 py-1 text-[11px] font-bold text-primary">
                            ➜ {t("ส่งตรวจ")}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {!isHead && <p className="mt-2 text-[11px] text-on-surface-variant">{t("ติ๊กช่องว่างเพื่อเริ่มทำ (ย้ายไปช่องกำลังทำ) แล้วกดส่งตรวจเมื่อเสร็จ")}</p>}
              </div>
            )}
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
                {canEditPlan && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {[
                      { label: t("วันนี้"), v: addDaysIso(0) },
                      { label: t("พรุ่งนี้"), v: addDaysIso(1) },
                      { label: t("+7 วัน"), v: addDaysIso(7) },
                    ].map((q) => (
                      <button key={q.label} type="button" onClick={() => setDueDate(q.v)} className="rounded-full border border-outline-variant px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
                        {q.label}
                      </button>
                    ))}
                    {dueDate && (
                      <button type="button" onClick={() => setDueDate("")} className="rounded-full border border-status-danger px-2.5 py-1 text-xs font-semibold text-status-danger">
                        {t("ล้างวันที่")}
                      </button>
                    )}
                  </div>
                )}
                {dueDate && <p className="mt-1 text-[11px] text-on-surface-variant">{fmtFullDay(dueDate)}</p>}
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

            {/* optional proof of work: a link and / or an image, so the head can see it while checking */}
            {openCard && !openCard.is_group && (canEditProof || link || attachPath) && (
              <div className="space-y-2 rounded-xl bg-surface-container p-3">
                <p className="text-sm font-bold text-on-surface">
                  {t("แนบผลงาน")} <span className="text-xs font-normal text-on-surface-variant">({t("ไม่บังคับ")})</span>
                </p>
                {canEditProof ? (
                  <input value={link} onChange={(e) => setLink(e.target.value)} inputMode="url" className={field} placeholder={t("ลิงก์งาน เช่น https://...")} />
                ) : (
                  link && (
                    <a href={safeHref(link)} target="_blank" rel="noopener noreferrer" className="block break-all text-sm font-semibold text-primary underline">
                      🔗 {link}
                    </a>
                  )
                )}
                {attachPath && previewUrl && (
                  <div className="relative">
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewUrl} alt={t("ผลงาน")} className="max-h-56 w-full rounded-xl object-contain bg-white" />
                    </a>
                    {canEditProof && (
                      <button type="button" onClick={() => setAttachPath("")} className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">
                        ✕ {t("เอารูปออก")}
                      </button>
                    )}
                  </div>
                )}
                {canEditProof && !attachPath && (
                  <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-outline-variant bg-white py-3 text-sm font-semibold text-on-surface-variant">
                    {uploading ? t("กำลังอัปโหลด...") : `📷 ${t("แนบรูป")}`}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void uploadProof(f);
                      }}
                    />
                  </label>
                )}
              </div>
            )}

            {openCard?.status === "done" && (
              <div className="rounded-xl bg-[#e9f8ee] p-3 text-sm">
                <Stars value={openCard.quality ?? 0} /> {openCard.is_late && <span className="ml-2 text-xs font-bold text-status-warning">{t("ส่งเกินกำหนด (ได้ 80%)")}</span>}
                {openCard.review_note && <p className="mt-1 text-xs text-on-surface-variant">{openCard.review_note}</p>}
              </div>
            )}

            {/* the head checks a card that was sent for review */}
            {openCard?.status === "review" && canReviewCard(openCard) && (
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

            {openCard?.status === "review" && !canReviewCard(openCard) && isHead && openCard.assignee_employee_id === me && (
              <p className="rounded-xl bg-[#eaf2ff] p-3 text-xs text-on-surface-variant">{t("งานของคุณเอง ต้องให้ผู้ตรวจงานเป็นผู้ตรวจและอนุมัติ")}</p>
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
                    <button onClick={() => move(openCard, "review", proofExtra())} disabled={saving || uploading} className="rounded-xl bg-[#eaf2ff] px-3 py-2 text-sm font-bold text-primary">
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
