import { t } from "@/lib/i18n";

// How long a leave request is, in words people understand (owner 2026-10-15): hourly leave is
// shown in hours/minutes with the times ("30 นาที (17:00-17:30)") instead of a fraction of a day
// like 0.44; half-day says morning/afternoon; whole days stay as a number of days.
function toMinutes(time: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

const hhmm = (time: string) => time.slice(0, 5);

export function formatLeaveDuration(unit: string | null | undefined, totalDays: number, startTime: string | null, endTime: string | null): string {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (unit === "hourly" && start != null && end != null && end > start) {
    // The 12:00-13:00 lunch break is not leave time.
    const lunchOverlap = Math.max(0, Math.min(end, 13 * 60) - Math.max(start, 12 * 60));
    const minutes = end - start - lunchOverlap;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const words = h > 0 && m > 0 ? `${h} ${t("ชม.")} ${m} ${t("นาที")}` : h > 0 ? `${h} ${t("ชม.")}` : `${m} ${t("นาที")}`;
    return `${words} (${hhmm(startTime!)}-${hhmm(endTime!)})`;
  }
  if (unit === "half_day") {
    const period = start != null && start >= 12 * 60 ? t("บ่าย") : t("เช้า");
    return `${t("ครึ่งวัน")} (${period})`;
  }
  return `${totalDays} ${t("วัน")}`;
}
