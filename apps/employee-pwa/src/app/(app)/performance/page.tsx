"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface TeamRow {
  id: string;
  name: string;
  memberCount: number;
}

export default function PerformancePage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [{ data: teamRows }, { data: memberRows }] = await Promise.all([
        supabase.from("output_teams").select("id, name").eq("org_id", profile.orgId).order("name"),
        supabase.from("output_team_members").select("output_team_id"),
      ]);
      const counts = new Map<string, number>();
      for (const m of memberRows ?? []) counts.set(m.output_team_id, (counts.get(m.output_team_id) ?? 0) + 1);
      setTeams((teamRows ?? []).map((t) => ({ id: t.id, name: t.name, memberCount: counts.get(t.id) ?? 0 })));
      setLoaded(true);
    })();
  }, [profile, supabase]);

  return (
    <div className="safe-top space-y-5 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">ผลงานประจำเดือน</h1>

      {!loaded && <p className="text-sm text-on-surface-variant">กำลังโหลด...</p>}

      <div className="space-y-3">
        {teams.map((team) => (
          <Link
            key={team.id}
            href={`/performance/${team.id}`}
            className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]"
          >
            <div>
              <p className="font-bold text-on-surface">{team.name}</p>
              <p className="text-xs text-on-surface-variant">{team.memberCount} คน</p>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
