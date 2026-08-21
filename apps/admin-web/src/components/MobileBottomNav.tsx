"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const ITEMS = [
  { href: "/dashboard", label: "หน้าแรก", icon: "home" },
  { href: "/employees", label: "พนักงาน", icon: "group" },
  { href: "/attendance", label: "เช็คอิน", icon: "fingerprint" },
  { href: "/leave", label: "การลา", icon: "event_note" },
  { href: "/payroll", label: "เงินเดือน", icon: "receipt_long" },
  { href: "/settings", label: "โปรไฟล์", icon: "person" },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 z-50 flex h-16 w-full items-center justify-around border-t border-outline-variant bg-white px-4 shadow-lg md:hidden">
      {ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx("flex flex-col items-center justify-center", active ? "font-bold text-primary" : "text-on-surface-variant")}
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="text-[10px]">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
