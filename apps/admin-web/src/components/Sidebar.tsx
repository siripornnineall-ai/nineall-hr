"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { UserRole } from "@nineall-hr/shared-types";

const NAV_ITEMS: { href: string; label: string; icon: string; roles?: UserRole[] }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/employees", label: "Employees", icon: "group" },
  { href: "/attendance", label: "Attendance", icon: "schedule" },
  { href: "/leave", label: "Leave", icon: "event_busy" },
  { href: "/overtime", label: "OT", icon: "history_toggle_off" },
  { href: "/reimbursement", label: "เบิกค่าใช้จ่าย", icon: "receipt_long" },
  { href: "/shift-swap", label: "สลับกะ", icon: "swap_horiz" },
  { href: "/holiday-swap", label: "สลับวันหยุดนักขัตฤกษ์", icon: "event_repeat" },
  { href: "/schedule", label: "ตารางกะประจำ", icon: "calendar_view_week", roles: ["super_admin", "hr"] },
  { href: "/org-chart", label: "ผังองค์กร", icon: "account_tree" },
  { href: "/recruitment", label: "รับสมัครงาน", icon: "work" },
  { href: "/reviews", label: "ประเมินผลงาน", icon: "military_tech" },
  { href: "/training", label: "การอบรม", icon: "school" },
  { href: "/payroll", label: "Payroll", icon: "payments", roles: ["super_admin", "hr"] },
  { href: "/reports", label: "Reports", icon: "assessment", roles: ["super_admin", "hr"] },
  { href: "/announcements", label: "ประกาศ", icon: "campaign" },
  { href: "/translations", label: "ภาษา", icon: "translate", roles: ["super_admin", "hr"] },
  { href: "/admins", label: "ผู้ดูแลระบบ", icon: "admin_panel_settings", roles: ["super_admin"] },
  { href: "/settings", label: "Settings", icon: "settings", roles: ["super_admin", "hr"] },
];

export function Sidebar({ role, fullName, roleLabel }: { role: UserRole; fullName: string; roleLabel: string }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));

  return (
    <aside className="fixed left-0 top-0 hidden h-screen w-[260px] flex-col bg-sidebar py-2 md:flex">
      <div className="flex items-center gap-3 px-6 py-8">
        <Image src="/logo-mark.png" alt="Nineall HR" width={36} height={36} className="rounded bg-white p-1" />
        <div>
          <h1 className="text-lg font-bold text-white">Nineall Group</h1>
          <p className="text-xs text-white/60">HR Management System</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center rounded-lg px-4 py-3 text-sm font-semibold transition-all",
                active
                  ? "border-l-4 border-primary bg-primary-container/10 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              )}
            >
              <span className="material-symbols-outlined mr-3 text-[20px]">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex items-center gap-3 border-t border-white/10 px-6 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container text-white">
          <span className="material-symbols-outlined text-[20px]">account_circle</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{fullName}</p>
          <p className="truncate text-xs text-white/50">{roleLabel}</p>
        </div>
      </div>
    </aside>
  );
}
