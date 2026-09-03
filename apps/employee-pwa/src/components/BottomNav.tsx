"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const ITEMS = [
  { href: "/", label: "หน้าแรก", icon: "home" },
  { href: "/attendance", label: "ลงเวลา", icon: "fingerprint" },
  { href: "/leave", label: "ลางาน", icon: "event_note" },
  { href: "/performance", label: "ผลงาน", icon: "insights" },
  { href: "/profile", label: "โปรไฟล์", icon: "person" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="safe-bottom fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-outline-variant bg-white px-2 py-1 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      {ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1.5 transition-colors",
              active ? "bg-secondary/10 text-secondary" : "text-on-surface-variant"
            )}
          >
            <span className="material-symbols-outlined text-[22px]" style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}>
              {item.icon}
            </span>
            <span className="text-[11px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
