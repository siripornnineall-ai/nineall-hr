import { LogoutButton } from "./LogoutButton";

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-40 flex h-20 w-full items-center justify-between border-b border-outline-variant bg-surface px-4 shadow-sm md:px-8">
      <div>
        <h2 className="text-xl font-bold md:text-2xl">{title}</h2>
        {subtitle && <p className="text-sm text-on-surface-variant">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4">
        <button className="relative text-on-surface-variant transition-colors hover:text-primary" aria-label="การแจ้งเตือน">
          <span className="material-symbols-outlined">notifications</span>
        </button>
        <LogoutButton />
      </div>
    </header>
  );
}
