import { createClient } from "@/lib/supabase/server";
import { signAvatarUrls } from "@/lib/avatars";

export interface LateLeaderboardRow {
  employeeId: string;
  employeeCode: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
  totalLateMinutes: number;
  lateDays: number;
}

export interface CookieLeaderboardRow {
  employeeId: string;
  employeeCode: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
  totalCookies: number;
}

interface RawLateRow {
  employee_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  photo_url: string | null;
  total_late_minutes: number;
  late_days: number;
}

interface RawCookieRow {
  employee_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  photo_url: string | null;
  total_cookies: number;
}

// Calendar math on plain Y/M numbers (not a parsed date string), so this is unaffected by
// the server's own UTC clock — only "what month is it in Bangkok right now" depends on TZ.
function currentBangkokMonthRange(): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export async function getLateLeaderboard(): Promise<LateLeaderboardRow[]> {
  const supabase = await createClient();
  const { start, end } = currentBangkokMonthRange();
  const { data, error } = await supabase.rpc("get_late_leaderboard", { p_month_start: start, p_month_end: end });
  if (error || !data) return [];
  const rows = data as RawLateRow[];

  const photoMap = await signAvatarUrls(supabase, rows.map((r) => r.photo_url));
  return rows.map((r) => ({
    employeeId: r.employee_id,
    employeeCode: r.employee_code,
    name: `${r.first_name} ${r.last_name}`,
    nickname: r.nickname,
    photoUrl: r.photo_url ? (photoMap.get(r.photo_url) ?? null) : null,
    totalLateMinutes: r.total_late_minutes,
    lateDays: r.late_days,
  }));
}

export async function getCookieLeaderboard(limit = 3): Promise<CookieLeaderboardRow[]> {
  const supabase = await createClient();
  // Resets every calendar month — matches enforce_cookie_monthly_limit()'s own 5/month
  // cap, which is keyed on the same kindness_cookies.month column.
  const { start } = currentBangkokMonthRange();
  const { data, error } = await supabase.rpc("get_cookie_leaderboard", { p_limit: limit, p_month: start });
  if (error || !data) return [];
  const rows = data as RawCookieRow[];

  const photoMap = await signAvatarUrls(supabase, rows.map((r) => r.photo_url));
  return rows.map((r) => ({
    employeeId: r.employee_id,
    employeeCode: r.employee_code,
    name: `${r.first_name} ${r.last_name}`,
    nickname: r.nickname,
    photoUrl: r.photo_url ? (photoMap.get(r.photo_url) ?? null) : null,
    totalCookies: r.total_cookies,
  }));
}
