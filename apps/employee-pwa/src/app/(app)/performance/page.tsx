"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface TeamRow {
  id: string;
  slug: string;
  name: string;
  memberCount: number;
}

const TEAM_VISUALS: Record<string, { emoji: string; bg: string }> = {
  sewing: { emoji: "🪡", bg: "#fde2df" },
  pack: { emoji: "📦", bg: "#fef1da" },
  sales: { emoji: "🛍️", bg: "#e0f2ea" },
  content: { emoji: "📸", bg: "#e3ecfb" },
  cutting: { emoji: "✂️", bg: "#f1e6fa" },
};
const DEFAULT_VISUAL = { emoji: "📊", bg: "#eeedee" };

export default function PerformancePage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [{ data: teamRows }, { data: memberRows }] = await Promise.all([
        supabase.from("output_teams").select("id, slug, name").eq("org_id", profile.orgId).order("name"),
        supabase.from("output_team_members").select("output_team_id"),
      ]);
      const counts = new Map<string, number>();
      for (const m of memberRows ?? []) counts.set(m.output_team_id, (counts.get(m.output_team_id) ?? 0) + 1);
      setTeams((teamRows ?? []).map((t) => ({ id: t.id, slug: t.slug, name: t.name, memberCount: counts.get(t.id) ?? 0 })));
      setLoaded(true);
    })();
  }, [profile, supabase]);

  return (
    <div className="safe-top space-y-5 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">ผลงานประจำเดือน</h1>

      {!loaded && <p className="text-sm text-on-surface-variant">กำลังโหลด...</p>}

      <div className="grid grid-cols-2 gap-3.5">
        {teams.map((team) => {
          const visual = TEAM_VISUALS[team.slug] ?? DEFAULT_VISUAL;
          return (
            <Link
              key={team.id}
              href={`/performance/${team.id}`}
              className="flex flex-col items-center gap-2.5 rounded-3xl bg-white p-5 text-center shadow-[0_4px_20px_rgba(0,0,0,0.05)] active:scale-95 transition-transform"
            >
              <span
                className="flex h-16 w-16 items-center justify-center rounded-full text-[32px]"
                style={{ backgroundColor: visual.bg }}
              >
                {visual.emoji}
              </span>
              <span className="text-sm font-bold text-on-surface">{team.name}</span>
              <span className="text-[11px] text-on-surface-variant">{team.memberCount} คน</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
