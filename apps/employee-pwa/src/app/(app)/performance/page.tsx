"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

const TEAMS = ["ทีมเย็บ", "ทีมแพ็ค", "ทีมขาย", "ทีมคอนเทนต์", "ทีมตัด"];

interface OutputRow {
  team_name: string;
  quantity: number;
  unit: string;
  updated_at: string;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
}

export default function PerformancePage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [rows, setRows] = useState<Record<string, OutputRow>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [savingTeam, setSavingTeam] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const month = monthKey(monthDate);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoaded(false);
    const { data } = await supabase
      .from("team_output_entries")
      .select("team_name, quantity, unit, updated_at")
      .eq("org_id", profile.orgId)
      .eq("month", month);
    const byTeam: Record<string, OutputRow> = {};
    for (const r of data ?? []) byTeam[r.team_name] = r;
    setRows(byTeam);
    setDrafts(Object.fromEntries(TEAMS.map((t) => [t, byTeam[t] ? String(byTeam[t].quantity) : ""])));
    setLoaded(true);
  }, [profile, supabase, month]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(team: string) {
    if (!profile) return;
    const quantity = Number(drafts[team]);
    if (Number.isNaN(quantity) || quantity < 0) {
      setError("กรุณากรอกจำนวนที่ถูกต้อง");
      return;
    }
    setError(null);
    setSavingTeam(team);
    const { error: upsertError } = await supabase
      .from("team_output_entries")
      .upsert(
        {
          org_id: profile.orgId,
          team_name: team,
          month,
          quantity,
          unit: "ชิ้น",
          updated_by_profile_id: profile.profileId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,team_name,month" }
      );
    setSavingTeam(null);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    load();
  }

  return (
    <div className="safe-top space-y-5 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">ผลงานประจำเดือน</h1>

      <div className="flex items-center justify-between rounded-2xl bg-white p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <button
          onClick={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          className="rounded-lg border border-outline-variant px-3 py-1.5 text-sm font-semibold text-on-surface-variant"
        >
          ← เดือนก่อน
        </button>
        <span className="text-sm font-bold text-on-surface">{monthLabel(monthDate)}</span>
        <button
          onClick={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          className="rounded-lg border border-outline-variant px-3 py-1.5 text-sm font-semibold text-on-surface-variant"
        >
          เดือนถัดไป →
        </button>
      </div>

      {error && <p className="text-sm text-status-danger">{error}</p>}

      <div className="space-y-3">
        {TEAMS.map((team) => {
          const row = rows[team];
          return (
            <div key={team} className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
              <div className="flex items-center justify-between">
                <p className="font-bold text-on-surface">{team}</p>
                {row && (
                  <p className="text-[11px] text-on-surface-variant">
                    อัปเดตล่าสุด {new Date(row.updated_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                )}
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={drafts[team] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [team]: e.target.value }))}
                  placeholder="0"
                  className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
                  disabled={!loaded}
                />
                <span className="shrink-0 text-sm text-on-surface-variant">ชิ้น</span>
                <button
                  onClick={() => handleSave(team)}
                  disabled={savingTeam === team || !loaded}
                  className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {savingTeam === team ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
