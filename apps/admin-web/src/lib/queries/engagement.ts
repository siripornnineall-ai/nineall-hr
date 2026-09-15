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

export interface NotePerson {
  employeeId: string;
  employeeCode: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
}

export interface EmployeeNoteRow {
  id: string;
  text: string;
  createdAt: string;
  author: NotePerson;
  reactions: { emoji: string; by: NotePerson }[];
  comments: { id: string; text: string; createdAt: string; by: NotePerson }[];
}

interface RawBasicInfo {
  employee_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  photo_url: string | null;
}

// Employee notes are the Instagram-style status bubbles employees post from the PWA home
// page. The PWA only ever shows the last 24 hours (nothing expires server-side), so admins
// get the same default window plus an opt-in longer history. Authors/reactors/commenters are
// resolved through get_employees_basic_info() — the security-definer RPC the PWA uses — not a
// PostgREST embed, because employees_select would hide non-team members from a manager-role
// admin user.
export async function getEmployeeNotes(options: { sinceHours: number; limit?: number }): Promise<EmployeeNoteRow[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - options.sinceHours * 60 * 60 * 1000).toISOString();
  const { data: notes, error } = await supabase
    .from("employee_notes")
    .select("id, employee_id, text, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 200);
  if (error || !notes || notes.length === 0) return [];

  const noteIds = notes.map((n) => n.id);
  const [{ data: reactions }, { data: comments }] = await Promise.all([
    supabase.from("note_reactions").select("note_id, employee_id, emoji, created_at").in("note_id", noteIds).order("created_at"),
    supabase.from("note_comments").select("id, note_id, employee_id, text, created_at").in("note_id", noteIds).order("created_at"),
  ]);

  const personIds = Array.from(
    new Set([
      ...notes.map((n) => n.employee_id),
      ...(reactions ?? []).map((r) => r.employee_id),
      ...(comments ?? []).map((c) => c.employee_id),
    ])
  );
  const { data: people } = await supabase.rpc("get_employees_basic_info", { p_employee_ids: personIds });
  const peopleRows = (people ?? []) as RawBasicInfo[];
  const photoMap = await signAvatarUrls(supabase, peopleRows.map((p) => p.photo_url));
  const personById = new Map<string, NotePerson>(
    peopleRows.map((p) => [
      p.employee_id,
      {
        employeeId: p.employee_id,
        employeeCode: p.employee_code,
        name: `${p.first_name} ${p.last_name}`,
        nickname: p.nickname,
        photoUrl: p.photo_url ? (photoMap.get(p.photo_url) ?? null) : null,
      },
    ])
  );
  const personOrUnknown = (id: string): NotePerson =>
    personById.get(id) ?? { employeeId: id, employeeCode: "", name: "ไม่ทราบชื่อ", nickname: null, photoUrl: null };

  return notes.map((n) => ({
    id: n.id,
    text: n.text,
    createdAt: n.created_at,
    author: personOrUnknown(n.employee_id),
    reactions: (reactions ?? []).filter((r) => r.note_id === n.id).map((r) => ({ emoji: r.emoji, by: personOrUnknown(r.employee_id) })),
    comments: (comments ?? [])
      .filter((c) => c.note_id === n.id)
      .map((c) => ({ id: c.id, text: c.text, createdAt: c.created_at, by: personOrUnknown(c.employee_id) })),
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
