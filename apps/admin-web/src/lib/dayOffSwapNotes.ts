// Owner 2026-11-18: day-off swaps (work on a regular day off, take another day / half day off instead).
//  * the DAY TAKEN OFF carries a note saying which day was swapped in ("ใช้วันที่ 7 พ.ย. มาสลับวันหยุด");
//  * the DAY OFF THAT WAS WORKED is cut back to a regular day off once its credit is fully used (1 full day, or 2 halves);
//    while only half is used it stays a worked day, noted as "used half, half left".
// Display only — attendance rows, hours and payroll are never changed by this.

export interface DayOffSwap {
  employee_id?: string;
  unit: "full_day" | "half_day";
  period: "morning" | "afternoon" | null;
  original_date: string | null;
  substitute_date: string;
}

const fmt = (d: string) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
const periodTh = (s: DayOffSwap) => (s.unit === "half_day" ? (s.period === "morning" ? "ครึ่งเช้า" : s.period === "afternoon" ? "ครึ่งบ่าย" : "ครึ่งวัน") : "เต็มวัน");

/** Note for a day the employee took off by swapping (null when `date` is not a substitute date). */
export function substituteNote(swaps: DayOffSwap[], date: string): string | null {
  const mine = swaps.filter((s) => s.substitute_date === date && s.original_date);
  if (mine.length === 0) return null;
  return mine.map((s) => `${s.unit === "half_day" ? `หยุด${periodTh(s)} · ` : ""}ใช้วันที่ ${fmt(s.original_date!)} มาสลับวันหยุด`).join(" · ");
}

/** For a day off that was worked and swapped away: cut back to a day off when fully used. */
export function originalDayInfo(swaps: DayOffSwap[], date: string): { cut: boolean; note: string } | null {
  const mine = swaps.filter((s) => s.original_date === date);
  if (mine.length === 0) return null;
  const used = mine.reduce((sum, s) => sum + (s.unit === "half_day" ? 0.5 : 1), 0);
  const where = mine.map((s) => `${fmt(s.substitute_date)}${s.unit === "half_day" ? ` (${periodTh(s)})` : ""}`).join(", ");
  if (used >= 1) return { cut: true, note: `ทำงานวันหยุดแล้วสลับไปหยุด ${where} → นับเป็นวันหยุดประจำเหมือนเดิม` };
  return { cut: false, note: `ทำงานวันหยุด · ใช้สลับไปแล้วครึ่งวัน (${where}) · เหลืออีกครึ่งวัน` };
}
