"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { signAvatarUrls } from "@/lib/avatars";
import { useT } from "@/lib/i18n";
import { chatErrorText, conversationTitle, shortTime, type ConversationRow } from "@/lib/chat";
import { PeoplePicker } from "./PeoplePicker";

// Chat list: every 1:1 and group conversation the signed-in employee belongs to.
export default function ChatListPage() {
  const { t } = useT();
  const { profile } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [photoMap, setPhotoMap] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [picker, setPicker] = useState<"direct" | "group" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("chat_list_conversations");
    const list = (data ?? []) as ConversationRow[];
    const paths = list.map((r) => r.other_photo_url).filter((p): p is string => !!p);
    if (paths.length > 0) {
      const signed = await signAvatarUrls(supabase, paths);
      setPhotoMap((prev) => {
        const next = new Map(prev);
        for (const [p, u] of signed) next.set(p, u);
        return next;
      });
    }
    setRows(list);
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    if (!profile) return;
    load();
    const interval = setInterval(load, 15_000);
    // Any new message in a conversation we can see → refresh the list right away.
    const channel = supabase
      .channel("chat-list")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => load())
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [profile, load, supabase]);

  async function startDirect(ids: string[]) {
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("chat_start_direct", { p_other_employee_id: ids[0] });
    setBusy(false);
    if (err || !data) {
      setError(chatErrorText(err?.message));
      return;
    }
    setPicker(null);
    router.push(`/chat/${data as string}`);
  }

  async function createGroup(ids: string[], name: string) {
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("chat_create_group", { p_name: name, p_member_ids: ids });
    setBusy(false);
    if (err || !data) {
      setError(chatErrorText(err?.message));
      return;
    }
    setPicker(null);
    router.push(`/chat/${data as string}`);
  }

  return (
    <div className="safe-top space-y-4 px-4 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-primary">{t("แชท")}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setError(null);
              setPicker("group");
            }}
            className="flex items-center gap-1 rounded-full border border-primary px-3 py-1.5 text-xs font-bold text-primary"
          >
            <span className="material-symbols-outlined text-[16px]">group_add</span>
            {t("สร้างกลุ่ม")}
          </button>
          <button
            onClick={() => {
              setError(null);
              setPicker("direct");
            }}
            className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white"
          >
            <span className="material-symbols-outlined text-[16px]">edit_square</span>
            {t("แชทใหม่")}
          </button>
        </div>
      </div>

      {!loaded && (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-5 text-sm text-on-surface-variant shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
          {t("กำลังโหลด...")}
        </div>
      )}

      {loaded && rows.length === 0 && (
        <div className="rounded-2xl bg-white p-8 text-center shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <span className="material-symbols-outlined text-[40px] text-outline-variant">forum</span>
          <p className="mt-2 text-sm font-semibold text-on-surface">{t("ยังไม่มีแชท")}</p>
          <p className="mt-1 text-xs text-on-surface-variant">{t("กดแชทใหม่เพื่อเริ่มคุยกับเพื่อนร่วมงาน หรือสร้างกลุ่ม")}</p>
        </div>
      )}

      {loaded && rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          {rows.map((c) => {
            const photo = c.type === "direct" && c.other_photo_url ? photoMap.get(c.other_photo_url) : null;
            const unread = c.unread_count > 0;
            const preview = c.last_message_preview
              ? c.type === "group" && c.last_sender_name
                ? `${c.last_sender_name}: ${c.last_message_preview}`
                : c.last_message_preview
              : t("ยังไม่มีข้อความ");
            return (
              <Link
                key={c.conversation_id}
                href={`/chat/${c.conversation_id}`}
                className="flex items-center gap-3 border-b border-outline-variant px-4 py-3 last:border-0 active:bg-surface"
              >
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full ${c.type === "group" ? "bg-secondary/15 text-secondary" : "bg-surface-container text-on-surface-variant"}`}>
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-[24px]">{c.type === "group" ? "groups" : "person"}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm ${unread ? "font-bold text-on-surface" : "font-semibold text-on-surface"}`}>
                      {conversationTitle(c)}
                      {c.type === "group" && <span className="ml-1 text-xs font-normal text-on-surface-variant">({c.member_count})</span>}
                    </span>
                    <span className={`shrink-0 text-[11px] ${unread ? "font-bold text-primary" : "text-on-surface-variant"}`}>{shortTime(c.last_message_at)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className={`truncate text-xs ${unread ? "font-semibold text-on-surface" : "text-on-surface-variant"}`}>{preview}</span>
                    {unread && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
                        {c.unread_count > 99 ? "99+" : c.unread_count}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {picker === "direct" && profile && (
        <PeoplePicker
          title={t("แชทใหม่")}
          excludeIds={[profile.employeeId]}
          multi={false}
          submitLabel=""
          busy={busy}
          error={error}
          onClose={() => setPicker(null)}
          onSubmit={startDirect}
        />
      )}
      {picker === "group" && profile && (
        <PeoplePicker
          title={t("สร้างกลุ่ม")}
          excludeIds={[profile.employeeId]}
          multi
          askName
          submitLabel={t("สร้างกลุ่ม")}
          busy={busy}
          error={error}
          onClose={() => setPicker(null)}
          onSubmit={createGroup}
        />
      )}
    </div>
  );
}
