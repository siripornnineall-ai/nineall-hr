"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { signAvatarUrls } from "@/lib/avatars";
import { OrgChartView, type OrgNode } from "./OrgChartView";

interface SecondaryLink {
  employeeId: string;
  managerId: string;
}

export default function OrgChartPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [nodes, setNodes] = useState<OrgNode[]>([]);
  const [secondaryLinks, setSecondaryLinks] = useState<SecondaryLink[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [{ data }, { data: secondaryData }, { data: directory }] = await Promise.all([
        supabase.rpc("get_org_chart_nodes"),
        supabase.rpc("get_org_chart_secondary_managers"),
        supabase.rpc("get_colleague_directory"),
      ]);
      // The org-chart RPC has no nickname; the colleague directory does.
      const nicknameById = new Map(((directory ?? []) as { employee_id: string; nickname: string | null }[]).map((d) => [d.employee_id, d.nickname]));
      const rows = (data ?? []) as {
        employee_id: string;
        first_name: string;
        last_name: string;
        photo_url: string | null;
        position_title: string | null;
        department_name: string | null;
        manager_employee_id: string | null;
      }[];
      setSecondaryLinks(
        ((secondaryData ?? []) as { employee_id: string; manager_employee_id: string }[]).map((r) => ({
          employeeId: r.employee_id,
          managerId: r.manager_employee_id,
        }))
      );

      const photoPaths = Array.from(new Set(rows.map((r) => r.photo_url).filter((p): p is string => !!p)));
      const urlByPath = new Map<string, string>();
      if (photoPaths.length > 0) {
        for (const [p, u] of await signAvatarUrls(supabase, photoPaths)) urlByPath.set(p, u);
      }

      setNodes(
        rows.map((r) => ({
          id: r.employee_id,
          name: `${r.first_name} ${r.last_name}`,
          nickname: nicknameById.get(r.employee_id) || null,
          photoUrl: r.photo_url ? (urlByPath.get(r.photo_url) ?? null) : null,
          position: r.position_title,
          departmentName: r.department_name,
          managerId: r.manager_employee_id,
        }))
      );
      setLoaded(true);
    })();
  }, [profile, supabase]);

  const extraManagers = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const map = new Map<string, string[]>();
    for (const l of secondaryLinks) {
      const m = byId.get(l.managerId);
      if (!m) continue;
      map.set(l.employeeId, [...(map.get(l.employeeId) ?? []), m.nickname || m.name]);
    }
    return map;
  }, [secondaryLinks, nodes]);

  return (
    <div className="safe-top space-y-4 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">ผังองค์กร</h1>
      {!loaded ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
        </div>
      ) : (
        <OrgChartView
          nodes={nodes}
          extraManagers={extraManagers}
          selfId={profile?.employeeId}
          profileHref={(id) => (id === profile?.employeeId ? "/profile" : `/colleagues/${id}`)}
        />
      )}
    </div>
  );
}
