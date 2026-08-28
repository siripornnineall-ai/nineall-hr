"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface BasicInfo {
  first_name: string;
  last_name: string;
  nickname: string | null;
  photo_url: string | null;
  job_title: string | null;
  bio: string | null;
}

interface Note {
  id: string;
  text: string;
  created_at: string;
}

interface ReactionRow {
  employee_id: string;
  emoji: string;
}

interface CommentRow {
  id: string;
  employee_id: string;
  text: string;
  created_at: string;
}

interface PersonInfo {
  employee_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  photo_url: string | null;
}

const REACTION_EMOJIS = ["😂", "❤️", "👍", "😮", "😢"];
const NOTE_MAX_LENGTH = 100;

export default function ColleagueProfilePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const isSelf = employeeId === profile?.employeeId;

  const [info, setInfo] = useState<BasicInfo | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [peopleMap, setPeopleMap] = useState<Map<string, PersonInfo>>(new Map());
  const [loaded, setLoaded] = useState(false);

  const [noteDraft, setNoteDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [cookieBalance, setCookieBalance] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [{ data: basicData }, { data: noteData }, balance] = await Promise.all([
      supabase.rpc("get_employee_basic_info", { p_employee_id: employeeId }).maybeSingle(),
      supabase
        .from("employee_notes")
        .select("id, text, created_at")
        .eq("employee_id", employeeId)
        .gte("created_at", dayAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      isSelf ? Promise.resolve(null) : supabase.rpc("get_my_cookie_balance"),
    ]);

    const basic = basicData as BasicInfo | null;
    setInfo(basic);
    if (basic?.photo_url) {
      const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(basic.photo_url, 3600);
      setPhotoUrl(signed?.signedUrl ?? null);
    } else {
      setPhotoUrl(null);
    }
    if (!isSelf && balance) setCookieBalance((balance.data as number | null) ?? null);

    const currentNote = (noteData as Note | null) ?? null;
    setNote(currentNote);

    if (currentNote) {
      const [{ data: reactionData }, { data: commentData }] = await Promise.all([
        supabase.from("note_reactions").select("employee_id, emoji").eq("note_id", currentNote.id),
        supabase.from("note_comments").select("id, employee_id, text, created_at").eq("note_id", currentNote.id).order("created_at"),
      ]);
      const reactionRows = (reactionData ?? []) as ReactionRow[];
      const commentRows = (commentData ?? []) as CommentRow[];
      setReactions(reactionRows);
      setComments(commentRows);

      const ids = Array.from(new Set([...reactionRows.map((r) => r.employee_id), ...commentRows.map((c) => c.employee_id)]));
      if (ids.length > 0) {
        const { data: people } = await supabase.rpc("get_employees_basic_info", { p_employee_ids: ids });
        setPeopleMap(new Map((people as PersonInfo[] | null ?? []).map((p) => [p.employee_id, p])));
      }
    } else {
      setReactions([]);
      setComments([]);
    }
    setLoaded(true);
  }, [profile, supabase, employeeId, isSelf]);

  useEffect(() => {
    load();
  }, [load]);

  async function postNote() {
    if (!noteDraft.trim() || !profile) return;
    setMessage(null);
    const { error } = await supabase.from("employee_notes").insert({
      org_id: profile.orgId,
      employee_id: profile.employeeId,
      text: noteDraft.trim(),
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    setNoteDraft("");
    load();
  }

  async function toggleReaction(emoji: string) {
    if (!note || !profile) return;
    const mine = reactions.find((r) => r.employee_id === profile.employeeId);
    if (mine?.emoji === emoji) {
      await supabase.from("note_reactions").delete().eq("note_id", note.id).eq("employee_id", profile.employeeId);
    } else {
      await supabase
        .from("note_reactions")
        .upsert({ org_id: profile.orgId, note_id: note.id, employee_id: profile.employeeId, emoji }, { onConflict: "note_id,employee_id" });
    }
    load();
  }

  async function postComment() {
    if (!commentDraft.trim() || !note || !profile) return;
    setMessage(null);
    const { error } = await supabase.from("note_comments").insert({
      org_id: profile.orgId,
      note_id: note.id,
      employee_id: profile.employeeId,
      text: commentDraft.trim(),
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    setCommentDraft("");
    load();
  }

  async function giveCookie() {
    if (!profile || isSelf) return;
    setMessage(null);
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const { error } = await supabase.from("kindness_cookies").insert({
      org_id: profile.orgId,
      giver_employee_id: profile.employeeId,
      receiver_employee_id: employeeId,
      month: monthStart,
    });
    if (error) {
      setMessage(error.message.includes("COOKIE_LIMIT_REACHED") ? "ให้คุกกี้ครบ 5 ชิ้นของเดือนนี้แล้ว" : error.message);
      return;
    }
    setMessage("ให้คุกกี้แล้ว 🍪");
    setCookieBalance((b) => (b !== null ? b - 1 : b));
  }

  function personLabel(id: string): string {
    const p = peopleMap.get(id);
    return p ? p.nickname || p.first_name : "-";
  }

  const myReaction = profile ? reactions.find((r) => r.employee_id === profile.employeeId)?.emoji : undefined;
  const reactionCounts = REACTION_EMOJIS.map((e) => ({ emoji: e, count: reactions.filter((r) => r.emoji === e).length }));

  if (!loaded) {
    return (
      <div className="safe-top flex min-h-[50vh] items-center justify-center px-4 pt-4">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="safe-top space-y-4 px-4 pb-6 pt-4">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm font-semibold text-primary">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        เพื่อนร่วมงาน
      </button>

      <div className="flex flex-col items-center gap-2 pt-2">
        {note && (
          <div className="relative max-w-[85%] rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-on-surface shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
            {note.text}
          </div>
        )}
        <span className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container ring-4 ring-white">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant">person</span>
          )}
        </span>
        <p className="text-xs font-semibold text-on-surface-variant">{isSelf ? "โน้ตของคุณ" : ""}</p>
        <p className="text-lg font-bold text-on-surface">{info?.nickname || `${info?.first_name} ${info?.last_name}`}</p>
        <p className="text-xs text-on-surface-variant">
          {info?.first_name} {info?.last_name}
        </p>
        {info?.job_title && <p className="text-xs text-on-surface-variant">{info.job_title}</p>}
      </div>

      {info?.bio && (
        <div className="rounded-2xl bg-white p-4 text-center shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <p className="text-sm text-on-surface">{info.bio}</p>
        </div>
      )}

      {!isSelf && (
        <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <div>
            <p className="text-sm font-bold text-on-surface">รางวัลคนมีน้ำใจ 🍪</p>
            <p className="text-xs text-on-surface-variant">{cookieBalance !== null ? `เหลือให้ได้อีก ${Math.max(0, cookieBalance)} ชิ้นเดือนนี้` : ""}</p>
          </div>
          <button
            onClick={giveCookie}
            disabled={cookieBalance !== null && cookieBalance <= 0}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            ให้คุกกี้
          </button>
        </div>
      )}

      {isSelf && (
        <div className="space-y-2 rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <p className="text-sm font-bold text-on-surface">วันนี้อยากพูดอะไร?</p>
          <p className="text-xs text-on-surface-variant">โน้ตจะหายไปภายใน 24 ชม.</p>
          <div className="flex gap-2">
            <input
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value.slice(0, NOTE_MAX_LENGTH))}
              placeholder="เขียนโน้ต..."
              className="flex-1 rounded-xl border border-outline-variant px-3.5 py-2.5 text-sm"
            />
            <button onClick={postNote} disabled={!noteDraft.trim()} className="rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-40">
              โพสต์
            </button>
          </div>
        </div>
      )}

      {message && <p className="text-center text-sm font-semibold text-secondary">{message}</p>}

      {note && (
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap gap-2">
            {reactionCounts.map(({ emoji, count }) => (
              <button
                key={emoji}
                onClick={() => toggleReaction(emoji)}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors ${
                  myReaction === emoji ? "border-primary bg-primary/10" : "border-outline-variant"
                }`}
              >
                <span>{emoji}</span>
                {count > 0 && <span className="text-xs font-bold text-on-surface-variant">{count}</span>}
              </button>
            ))}
          </div>

          <div className="space-y-2 border-t border-outline-variant pt-3">
            {comments.length === 0 && <p className="text-xs text-on-surface-variant">ยังไม่มีความคิดเห็น</p>}
            {comments.map((c) => (
              <div key={c.id} className="text-sm">
                <span className="font-bold text-on-surface">{personLabel(c.employee_id)}</span>{" "}
                <span className="text-on-surface-variant">{c.text}</span>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <input
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value.slice(0, 200))}
                placeholder="แสดงความคิดเห็น..."
                className="flex-1 rounded-xl border border-outline-variant px-3.5 py-2 text-sm"
              />
              <button onClick={postComment} disabled={!commentDraft.trim()} className="rounded-xl bg-primary px-3 text-sm font-bold text-white disabled:opacity-40">
                ส่ง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
