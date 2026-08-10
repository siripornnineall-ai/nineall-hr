import clsx from "clsx";

export function StatCard({
  label,
  value,
  icon,
  accent = "primary",
  hint,
}: {
  label: string;
  value: string | number;
  icon: string;
  accent?: "primary" | "success" | "warning" | "danger" | "info";
  hint?: string;
}) {
  const accentClass = {
    primary: "border-primary text-primary",
    success: "border-green-500 text-green-600",
    warning: "border-orange-400 text-orange-500",
    danger: "border-red-600 text-red-600",
    info: "border-tertiary text-tertiary",
  }[accent];

  return (
    <div className={clsx("rounded-xl border-l-4 bg-white p-6 shadow-sm", accentClass)}>
      <div className="flex items-start justify-between">
        <span className="text-sm font-semibold text-on-surface-variant">{label}</span>
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-bold text-on-surface">{value}</p>
      {hint && <p className="mt-1 text-xs text-on-surface-variant">{hint}</p>}
    </div>
  );
}
