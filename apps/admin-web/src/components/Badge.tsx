import clsx from "clsx";

const TONE_CLASSES = {
  success: "bg-green-100 text-green-700",
  warning: "bg-orange-100 text-orange-700",
  danger: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-700",
  holiday: "bg-purple-100 text-purple-700",
  neutral: "bg-gray-100 text-gray-500",
} as const;

export function Badge({ tone, children }: { tone: keyof typeof TONE_CLASSES; children: React.ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase", TONE_CLASSES[tone])}>
      {children}
    </span>
  );
}
