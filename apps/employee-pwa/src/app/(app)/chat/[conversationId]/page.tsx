"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { signAvatarUrls } from "@/lib/avatars";
import { useT } from "@/lib/i18n";
import { chatErrorText, dayKey, dayLabel, displayName, messageTime, type MemberRow, type MessageRow } from "@/lib/chat";
import { PeoplePicker } from "../PeoplePicker";

interface ConversationInfo {
  id: string;
  type: "direct" | "group";
  name: string | null;
}

const PAGE_SIZE = 60;

// One conversation: messages (live via realtime + polling fallback), composer, and for
// groups a member sheet with add / rename / leave. Full-screen — the bottom nav hides here.
export default function ChatThreadPage() {
  const { t } = useT();
  const { profile } = useAuth();
  const router = useRouter();
  const params = useParams<{ conversationId: string }>();
  const conversationId = params.conversationId;
  const supabase = useMemo(() => createClient(), []);

  const [conversation, setConversation] = useState<ConversationInfo | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [photoMap, setPhotoMap] = useState<Map<string, string>>(new Map());
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.employee_id, m])), [members]);

  const loadMeta = useCallback(async () => {
    const [{ data: conv }, { data: mem }] = await Promise.all([
      supabase.from("chat_conversations").select("id, type, name").eq("id", conversationId).maybeSingle(),
      supabase.rpc("chat_conversation_members", { p_conversation_id: conversationId }),
    ]);
    if (!conv) {
      setNotFound(true);
      setLoaded(true);
      return;
    }
    setConversation(conv as ConversationInfo);
    const rows = (mem ?? []) as MemberRow[];
    setMembers(rows);
    const paths = rows.map((m) => m.photo_url).filter((p): p is string => !!p);
    if (paths.length > 0) {
      const signed = await signAvatarUrls(supabase, paths);
      setPhotoMap((prev) => {
        const next = new Map(prev);
        for (const [p, u] of signed) next.set(p, u);
        return next;
      });
    }
  }, [supabase, conversationId]);

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from("chat_messages")
      .select("id, conversation_id, sender_employee_id, body, created_at, deleted_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    const rows = ((data ?? []) as MessageRow[]).reverse();
    setMessages((prev) => {
      // Keep older pages the user scrolled up to; merge the newest page on top of them.
      const known = new Map(prev.map((m) => [m.id, m]));
      for (const m of rows) known.set(m.id, m);
      return Array.from(known.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
    setHasMore((data ?? []).length === PAGE_SIZE);
    setLoaded(true);
  }, [supabase, conversationId]);

  const markRead = useCallback(() => {
    supabase.rpc("chat_mark_read", { p_conversation_id: conversationId }).then(() => {});
  }, [supabase, conversationId]);

  useEffect(() => {
    if (!profile) return;
    loadMeta();
    loadMessages().then(markRead);
    const interval = setInterval(loadMessages, 10_000);
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as MessageRow;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.sender_employee_id !== profile.employeeId) markRead();
          // Someone we don't know yet (just added) → refresh the member list for their name.
          if (!memberMap.has(m.sender_employee_id)) loadMeta();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as MessageRow;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
        }
      )
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
    // memberMap intentionally not a dependency: it would re-subscribe on every member load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, conversationId, supabase, loadMeta, loadMessages, markRead]);

  // Scroll to the newest message unless the reader scrolled up to read history.
  useEffect(() => {
    const el = listRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loaded]);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function loadOlder() {
    const oldest = messages[0]?.created_at;
    if (!oldest) return;
    const el = listRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const { data } = await supabase
      .from("chat_messages")
      .select("id, conversation_id, sender_employee_id, body, created_at, deleted_at")
      .eq("conversation_id", conversationId)
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    const older = ((data ?? []) as MessageRow[]).reverse();
    setHasMore(older.length === PAGE_SIZE);
    stickToBottom.current = false;
    setMessages((prev) => [...older, ...prev]);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  }

  async function send() {
    const body = text.trim();
    if (!body || !profile || sending) return;
    setSending(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("chat_messages")
      .insert({ conversation_id: conversationId, sender_employee_id: profile.employeeId, body })
      .select("id, conversation_id, sender_employee_id, body, created_at, deleted_at")
      .single();
    setSending(false);
    if (err) {
      setError(chatErrorText(err.message));
      return;
    }
    setText("");
    stickToBottom.current = true;
    if (data) setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as MessageRow]));
  }

  async function unsend(m: MessageRow) {
    if (!window.confirm(t("ยกเลิกการส่งข้อความนี้?"))) return;
    const deleted_at = new Date().toISOString();
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, deleted_at } : x)));
    await supabase.from("chat_messages").update({ deleted_at }).eq("id", m.id);
  }

  async function addMembers(ids: string[]) {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("chat_add_members", { p_conversation_id: conversationId, p_member_ids: ids });
    setBusy(false);
    if (err) {
      setError(chatErrorText(err.message));
      return;
    }
    setShowAdd(false);
    loadMeta();
    loadMessages();
  }

  async function rename() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const { error: err } = await supabase.rpc("chat_rename_group", { p_conversation_id: conversationId, p_name: name });
    setBusy(false);
    if (err) {
      setError(chatErrorText(err.message));
      return;
    }
    setRenaming(false);
    setConversation((c) => (c ? { ...c, name } : c));
  }

  async function leave() {
    if (!window.confirm(t("ออกจากกลุ่มนี้?"))) return;
    setBusy(true);
    const { error: err } = await supabase.rpc("chat_leave", { p_conversation_id: conversationId });
    setBusy(false);
    if (err) {
      setError(chatErrorText(err.message));
      return;
    }
    router.replace("/chat");
  }

  const other = conversation?.type === "direct" ? members.find((m) => m.employee_id !== profile?.employeeId) : undefined;
  const title = conversation?.type === "group" ? conversation.name || t("กลุ่ม") : other ? displayName(other) : "";
  const subtitle =
    conversation?.type === "group"
      ? `${members.length} ${t("คน")}`
      : other
        ? `${other.first_name} ${other.last_name}`
        : "";

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-surface">
      {/* Header */}
      <div className="safe-top flex items-center gap-2 bg-primary px-2 pb-2.5 pt-2.5 text-white shadow-md">
        <button onClick={() => router.push("/chat")} className="flex h-9 w-9 items-center justify-center rounded-full active:bg-white/20" aria-label={t("กลับ")}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <button onClick={() => setShowMembers(true)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/20">
            {other?.photo_url && photoMap.get(other.photo_url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoMap.get(other.photo_url)} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-[20px]">{conversation?.type === "group" ? "groups" : "person"}</span>
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{title || t("แชท")}</span>
            {subtitle && <span className="block truncate text-[11px] text-white/80">{subtitle}</span>}
          </span>
        </button>
        <button onClick={() => setShowMembers(true)} className="flex h-9 w-9 items-center justify-center rounded-full active:bg-white/20" aria-label={t("ข้อมูลแชท")}>
          <span className="material-symbols-outlined">info</span>
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-3">
        {notFound && <p className="py-10 text-center text-sm text-on-surface-variant">{t("คุณไม่ได้อยู่ในแชทนี้")}</p>}
        {!loaded && !notFound && <p className="py-10 text-center text-sm text-on-surface-variant">{t("กำลังโหลด...")}</p>}
        {loaded && hasMore && (
          <button onClick={loadOlder} className="mx-auto mb-3 block rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-primary shadow-sm">
            {t("โหลดข้อความเก่า")}
          </button>
        )}
        {loaded && !notFound && messages.length === 0 && (
          <p className="py-10 text-center text-sm text-on-surface-variant">{t("ยังไม่มีข้อความ เริ่มทักทายได้เลย")}</p>
        )}
        {messages.map((m, i) => {
          const mine = m.sender_employee_id === profile?.employeeId;
          const prev = messages[i - 1];
          const showDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
          const sameSenderAsPrev = !!prev && !showDay && prev.sender_employee_id === m.sender_employee_id;
          const sender = memberMap.get(m.sender_employee_id);
          const photo = sender?.photo_url ? photoMap.get(sender.photo_url) : null;
          const deleted = !!m.deleted_at;
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-surface-container px-3 py-0.5 text-[11px] font-semibold text-on-surface-variant">{dayLabel(m.created_at)}</span>
                </div>
              )}
              <div className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${sameSenderAsPrev ? "mt-0.5" : "mt-2"}`}>
                {!mine && (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container">
                    {!sameSenderAsPrev &&
                      (photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">person</span>
                      ))}
                  </span>
                )}
                <div className={`max-w-[78%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                  {!mine && !sameSenderAsPrev && conversation?.type === "group" && (
                    <span className="mb-0.5 ml-1 text-[11px] font-semibold text-on-surface-variant">{sender ? displayName(sender) : t("อดีตสมาชิก")}</span>
                  )}
                  <button
                    onClick={() => mine && !deleted && unsend(m)}
                    className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-left text-sm shadow-sm ${
                      deleted
                        ? "bg-surface-container italic text-on-surface-variant"
                        : mine
                          ? "rounded-br-md bg-primary text-white"
                          : "rounded-bl-md bg-white text-on-surface"
                    }`}
                  >
                    {deleted ? t("ยกเลิกการส่งข้อความแล้ว") : m.body}
                  </button>
                  <span className="mt-0.5 px-1 text-[10px] text-on-surface-variant">{messageTime(m.created_at)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      {!notFound && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="safe-bottom border-t border-outline-variant bg-white px-3 py-2"
        >
          {error && <p className="mb-1 text-xs font-semibold text-status-danger">{error}</p>}
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder={t("พิมพ์ข้อความ...")}
              className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-outline-variant bg-surface px-3.5 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"
              aria-label={t("ส่ง")}
            >
              <span className="material-symbols-outlined text-[20px]">send</span>
            </button>
          </div>
        </form>
      )}

      {/* Members / info sheet */}
      {showMembers && conversation && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/40" onClick={() => setShowMembers(false)}>
          <div className="flex max-h-[80vh] w-full flex-col rounded-t-3xl bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4">
              <p className="text-base font-bold text-on-surface">{conversation.type === "group" ? t("สมาชิกกลุ่ม") : t("ข้อมูลแชท")}</p>
              <button onClick={() => setShowMembers(false)} className="text-on-surface-variant" aria-label={t("ปิด")}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            {conversation.type === "group" && (
              <div className="px-4 pt-2">
                {renaming ? (
                  <div className="flex gap-2">
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      maxLength={80}
                      autoFocus
                      className="flex-1 rounded-xl border border-outline-variant px-3 py-2 text-sm"
                    />
                    <button onClick={rename} disabled={busy || !newName.trim()} className="rounded-xl bg-primary px-3 text-sm font-bold text-white disabled:opacity-50">
                      {t("บันทึก")}
                    </button>
                    <button onClick={() => setRenaming(false)} className="text-sm font-semibold text-on-surface-variant">
                      {t("ยกเลิก")}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setNewName(conversation.name ?? "");
                      setRenaming(true);
                    }}
                    className="flex items-center gap-1 text-sm font-semibold text-primary"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                    {conversation.name} · {t("เปลี่ยนชื่อกลุ่ม")}
                  </button>
                )}
              </div>
            )}
            {error && <p className="px-4 pt-2 text-sm font-semibold text-status-danger">{error}</p>}
            <div className="mt-2 flex-1 overflow-y-auto px-2 pb-2">
              {members.map((m) => {
                const photo = m.photo_url ? photoMap.get(m.photo_url) : null;
                const isSelf = m.employee_id === profile?.employeeId;
                return (
                  <Link
                    key={m.employee_id}
                    href={`/colleagues/${m.employee_id}`}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 active:bg-surface"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container">
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-[22px] text-on-surface-variant">person</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-on-surface">
                        {displayName(m)}
                        {isSelf && <span className="ml-1 text-xs font-normal text-primary">({t("คุณ")})</span>}
                        {m.role === "owner" && <span className="ml-1 text-xs font-normal text-on-surface-variant">· {t("ผู้สร้าง")}</span>}
                      </span>
                      <span className="block truncate text-xs text-on-surface-variant">
                        {m.first_name} {m.last_name} · {m.employee_code}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
            {conversation.type === "group" && (
              <div className="safe-bottom flex gap-2 border-t border-outline-variant px-4 py-3">
                <button
                  onClick={() => {
                    setError(null);
                    setShowAdd(true);
                  }}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-white"
                >
                  <span className="material-symbols-outlined text-[18px]">person_add</span>
                  {t("เพิ่มสมาชิก")}
                </button>
                <button onClick={leave} disabled={busy} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-status-danger py-2.5 text-sm font-bold text-status-danger disabled:opacity-50">
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                  {t("ออกจากกลุ่ม")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showAdd && (
        <PeoplePicker
          title={t("เพิ่มสมาชิก")}
          excludeIds={members.map((m) => m.employee_id)}
          multi
          submitLabel={t("เพิ่มสมาชิก")}
          busy={busy}
          error={error}
          onClose={() => setShowAdd(false)}
          onSubmit={addMembers}
        />
      )}
    </div>
  );
}
