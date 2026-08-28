"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface LateRow {
  employeeId: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
  totalLateMinutes: number;
  lateDays: number;
}

interface CookieRow {
  employeeId: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
  totalCookies: number;
}

interface RawLateRow {
  employee_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  photo_url: string | null;
  total_late_minutes: number;
  late_days: number;
}

interface RawCookieRow {
  employee_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  photo_url: string | null;
  total_cookies: number;
}

const MEDALS = ["🥇", "🥈", "🥉"];

// Calendar math on plain Y/M numbers (not a parsed date string), so this is unaffected by
// the device's own clock timezone — only "what month is it in Bangkok right now" matters.
function currentBangkokMonthRange(): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

async function signPhotos(supabase: ReturnType<typeof createClient>, paths: (string | null)[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(paths.filter((p): p is string => !!p)));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await supabase.storage.from("avatars").createSignedUrls(unique, 3600);
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) map.set(item.path, item.signedUrl);
  }
  return map;
}

export function LateLeaderboardCard() {
  const [rows, setRows] = useState<LateRow[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const { start, end } = currentBangkokMonthRange();
    supabase
      .rpc("get_late_leaderboard", { p_month_start: start, p_month_end: end })
      .then(async ({ data, error }) => {
        if (error || !data) return setRows([]);
        const rawRows = data as RawLateRow[];
        const photoMap = await signPhotos(supabase, rawRows.map((r) => r.photo_url));
        setRows(
          rawRows.map((r) => ({
            employeeId: r.employee_id,
            name: `${r.first_name} ${r.last_name}`,
            nickname: r.nickname,
            photoUrl: r.photo_url ? (photoMap.get(r.photo_url) ?? null) : null,
            totalLateMinutes: r.total_late_minutes,
            lateDays: r.late_days,
          }))
        );
      });
  }, []);

  if (rows === null) return null;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
      <p className="mb-3 text-sm font-bold text-on-surface">ท็อป 3 มาสายประจำเดือน</p>
      {rows.length === 0 ? (
        <p className="text-xs text-on-surface-variant">เดือนนี้ยังไม่มีใครมาสาย</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, i) => (
            <li key={row.employeeId}>
              <Link href={`/late/${row.employeeId}`} className="flex items-center gap-3 active:opacity-70">
                <span className="w-5 text-center">{MEDALS[i]}</span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container">
                  {row.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-on-surface-variant">person</span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-on-surface">{row.nickname || row.name}</p>
                  <p className="text-xs text-on-surface-variant">
                    รวม {(row.totalLateMinutes / 60).toFixed(1)} ชม. ({row.lateDays} วัน เฉลี่ยวันละ {Math.round(row.totalLateMinutes / row.lateDays)} นาที)
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CookieLeaderboardCard() {
  const [rows, setRows] = useState<CookieRow[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .rpc("get_cookie_leaderboard")
      .then(async ({ data, error }) => {
        if (error || !data) return setRows([]);
        const rawRows = data as RawCookieRow[];
        const photoMap = await signPhotos(supabase, rawRows.map((r) => r.photo_url));
        setRows(
          rawRows.map((r) => ({
            employeeId: r.employee_id,
            name: `${r.first_name} ${r.last_name}`,
            nickname: r.nickname,
            photoUrl: r.photo_url ? (photoMap.get(r.photo_url) ?? null) : null,
            totalCookies: r.total_cookies,
          }))
        );
      });
  }, []);

  if (rows === null) return null;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
      <p className="mb-3 text-sm font-bold text-on-surface">ท็อป 3 รางวัลคนมีน้ำใจ 🍪</p>
      {rows.length === 0 ? (
        <p className="text-xs text-on-surface-variant">ยังไม่มีใครได้รับคุกกี้</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, i) => (
            <li key={row.employeeId} className="flex items-center gap-3">
              <span className="w-5 text-center">{MEDALS[i]}</span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container">
                {row.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-on-surface-variant">person</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-on-surface">{row.nickname || row.name}</p>
                <p className="text-xs text-on-surface-variant">ได้รับ {row.totalCookies} คุกกี้</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
