import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import { NotificationBell } from "./NotificationBell";

export function Topbar({ title, subtitle, backHref }: { title: string; subtitle?: string; backHref?: string }) {
  return (
    <header className="sticky top-0 z-40 flex h-20 w-full items-center justify-between border-b border-outline-variant bg-surface px-4 shadow-sm md:px-8">
      <div className="flex items-center gap-3">
        {backHref && (
          <Link
            href={backHref}
            aria-label="ย้อนกลับ"
            className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
        )}
        <div>
          <h2 className="text-xl font-bold md:text-2xl">{title}</h2>
          {subtitle && <p className="text-sm text-on-surface-variant">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <LogoutButton />
        <NotificationBell />
      </div>
    </header>
  );
}
