"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

// ผังองค์กร moved to a quick link on the home screen when chat took its slot (2026-09-29).
const ITEMS = [
  { href: "/", label: "หน้าแรก", icon: "home" },
  { href: "/attendance", label: "ลงเวลา", icon: "fingerprint" },
  { href: "/leave", label: "ลางาน", icon: "event_note" },
  { href: "/performance", label: "ผลงาน", icon: "insights" },
  { href: "/chat", label: "แชท", icon: "chat" },
  { href: "/profile", label: "โปรไฟล์", icon: "person" },
];

export function BottomNav() {
  const { t } = useT();
  const { profile } = useAuth();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [unreadChats, setUnreadChats] = useState(0);

  // Unread-message badge on the chat tab: polled, plus refreshed on any new message we
  // can see (realtime) so it moves as soon as someone writes.
  useEffect(() => {
    if (!profile) return;
    let active = true;
    const load = () => supabase.rpc("chat_unread_total").then(({ data }) => active && setUnreadChats(typeof data === "number" ? data : 0));
    load();
    const interval = setInterval(load, 30_000);
    const channel = supabase
      .channel("chat-unread")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => load())
      .subscribe();
    return () => {
      active = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [profile, supabase, pathname]);

  // An open conversation is full-screen with its own composer at the bottom.
  if (/^\/chat\/[^/]+/.test(pathname)) return null;

  return (
    <nav className="safe-bottom fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-outline-variant bg-white px-2 py-1 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      {ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const badge = item.href === "/chat" && unreadChats > 0 ? unreadChats : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1.5 transition-colors",
              active ? "bg-secondary/10 text-secondary" : "text-on-surface-variant"
            )}
          >
            <span className="relative">
              <span className="material-symbols-outlined text-[22px]" style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                {item.icon}
              </span>
              {badge > 0 && (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger px-1 text-[10px] font-bold text-white">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </span>
            <span className="text-[11px] font-medium">{t(item.label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
