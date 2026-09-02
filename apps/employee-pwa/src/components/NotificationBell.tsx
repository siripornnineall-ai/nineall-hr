"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

// Where tapping a notification should take you — keyed by notifications.type.
const NOTIFICATION_LINKS: Record<string, string> = {
  leave_request_decided: "/leave",
  note_comment: "/",
};

function timeAgoTh(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชม.ที่แล้ว`;
  const days = Math.floor(hours / 24);
  return `${days} วันที่แล้ว`;
}

export function NotificationBell() {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, is_read, created_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications(data ?? []);
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function markAsRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
  }

  function openNotification(n: NotificationRow) {
    if (!n.is_read) markAsRead(n.id);
    setOpen(false);
    const href = NOTIFICATION_LINKS[n.type];
    if (href) router.push(href);
  }

  async function markAllAsRead() {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).in("id", unreadIds);
  }

  return (
    <div ref={containerRef} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="relative text-white" aria-label="การแจ้งเตือน">
        <span className="material-symbols-outlined text-[26px]">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2.5rem))] rounded-2xl bg-white text-on-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
            <p className="font-bold text-on-surface">การแจ้งเตือน</p>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="text-xs font-semibold text-primary hover:underline">
                อ่านทั้งหมด
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loaded && notifications.length === 0 && <p className="p-4 text-center text-sm text-on-surface-variant">ยังไม่มีการแจ้งเตือน</p>}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={`block w-full border-b border-outline-variant px-4 py-3 text-left last:border-0 hover:bg-surface-container-low ${
                  n.is_read ? "" : "bg-primary/5"
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-on-surface">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs text-on-surface-variant">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-on-surface-variant">{timeAgoTh(n.created_at)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
