"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface OrgNode {
  id: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
  position: string | null;
  departmentName: string | null;
  managerId: string | null;
}

// Drill-down org chart for phones: one person at a time. Their manager sits above, their
// direct reports below as a grid of cards. Tap a card to move down to that person's team, tap
// the manager to move up. (The old picture-style chart was thousands of pixels wide.)

const byName = (a: OrgNode, b: OrgNode) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

// One soft colour per department so teams can be told apart at a glance.
const DEPT_COLORS = [
  { bar: "#C8473A", chip: "#FBE9E7", text: "#8F2A20" },
  { bar: "#2E7D6B", chip: "#E0F2EE", text: "#1D5A4C" },
  { bar: "#3B6FB6", chip: "#E3EDF9", text: "#244E86" },
  { bar: "#C08A1E", chip: "#FBF1DA", text: "#7D5A0F" },
  { bar: "#7A5BA6", chip: "#EEE8F6", text: "#553B7C" },
  { bar: "#4F8A3C", chip: "#E7F2E2", text: "#356128" },
];
function deptColor(dept: string | null, departments: string[]) {
  if (!dept) return { bar: "#B8B2AE", chip: "#EFEDEC", text: "#5F5957" };
  return DEPT_COLORS[Math.max(0, departments.indexOf(dept)) % DEPT_COLORS.length];
}

function Avatar({ url, size, ring }: { url: string | null; size: number; ring: string }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container"
      style={{ width: size, height: size, boxShadow: `0 0 0 3px #fff, 0 0 0 5px ${ring}` }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: size * 0.55 }}>
          person
        </span>
      )}
    </span>
  );
}

export function OrgChartView({
  nodes,
  extraManagers,
  selfId,
  profileHref,
}: {
  nodes: OrgNode[];
  extraManagers: Map<string, string[]>;
  selfId: string | undefined;
  profileHref: (id: string) => string;
}) {
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const childrenOf = useMemo(() => {
    const map = new Map<string, OrgNode[]>();
    for (const n of nodes) {
      if (!n.managerId || n.managerId === n.id || !nodeById.has(n.managerId)) continue;
      map.set(n.managerId, [...(map.get(n.managerId) ?? []), n]);
    }
    for (const list of map.values()) list.sort(byName);
    return map;
  }, [nodes, nodeById]);
  const departments = useMemo(() => Array.from(new Set(nodes.map((n) => n.departmentName).filter((d): d is string => !!d))).sort(), [nodes]);

  const countTeam = (id: string): number => (childrenOf.get(id) ?? []).reduce((s, c) => s + 1 + countTeam(c.id), 0);

  // Top of the company: whoever has no manager (the one with the biggest team if several).
  const rootId = useMemo(() => {
    const roots = nodes.filter((n) => !n.managerId || !nodeById.has(n.managerId));
    roots.sort((a, b) => countTeam(b.id) - countTeam(a.id));
    return roots[0]?.id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, nodeById, childrenOf]);

  // Starts at the top of the company; tapping a card with a team moves down into it.
  const [focusId, setFocusId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const focus = nodeById.get(focusId ?? "") ?? nodeById.get(rootId ?? "") ?? null;
  const q = query.trim().toLowerCase();
  const results = q
    ? nodes
        .filter((n) => n.name.toLowerCase().includes(q) || (n.nickname ?? "").toLowerCase().includes(q) || (n.position ?? "").toLowerCase().includes(q) || (n.departmentName ?? "").toLowerCase().includes(q))
        .sort(byName)
    : [];

  function go(id: string) {
    setFocusId(id);
    setQuery("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!focus) return <p className="text-center text-sm text-on-surface-variant">ยังไม่มีข้อมูลพนักงาน</p>;

  const manager = focus.managerId ? nodeById.get(focus.managerId) : undefined;
  const reports = childrenOf.get(focus.id) ?? [];
  const color = deptColor(focus.departmentName, departments);
  const extra = extraManagers.get(focus.id) ?? [];

  return (
    <div className="space-y-4">
      <div className="relative">
        <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant">search</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อ ตำแหน่ง หรือแผนก"
          className="h-11 w-full rounded-full border border-outline-variant bg-white pl-10 pr-4 text-sm"
        />
      </div>

      {q ? (
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <p className="px-4 pt-3 text-xs text-on-surface-variant">พบ {results.length} คน</p>
          {results.map((n) => {
            const c = deptColor(n.departmentName, departments);
            return (
              <button key={n.id} onClick={() => go(n.id)} className="flex w-full items-center gap-3 border-b border-outline-variant/60 px-4 py-2.5 text-left last:border-0 active:bg-surface">
                <Avatar url={n.photoUrl} size={40} ring={c.bar} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-on-surface">{n.nickname || n.name}</span>
                  <span className="block truncate text-xs text-on-surface-variant">{n.position ?? "-"}</span>
                </span>
                <span className="material-symbols-outlined text-[20px] text-outline">chevron_right</span>
              </button>
            );
          })}
          {results.length === 0 && <p className="px-4 py-6 text-center text-sm text-on-surface-variant">ไม่พบพนักงานที่ค้นหา</p>}
        </div>
      ) : (
        <>
          {/* Manager above */}
          <div className="flex flex-col items-center">
            {manager ? (
              <>
                <button
                  onClick={() => go(manager.id)}
                  className="flex max-w-full items-center gap-2 rounded-full border border-outline-variant bg-white py-1.5 pl-1.5 pr-4 shadow-sm active:scale-95"
                >
                  <Avatar url={manager.photoUrl} size={32} ring={deptColor(manager.departmentName, departments).bar} />
                  <span className="min-w-0 text-left">
                    <span className="block text-[10px] leading-none text-on-surface-variant">หัวหน้า</span>
                    <span className="block truncate text-sm font-bold text-on-surface">{manager.nickname || manager.name}</span>
                  </span>
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">arrow_upward</span>
                </button>
                <span className="h-5 w-0.5 bg-outline-variant" />
              </>
            ) : (
              <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary">ผู้บริหารสูงสุด</span>
            )}
          </div>

          {/* Focused person */}
          <div className="relative -mt-2 rounded-3xl bg-white px-5 pb-5 pt-6 text-center shadow-[0_6px_24px_rgba(0,0,0,0.08)]" style={{ borderTop: `4px solid ${color.bar}` }}>
            <div className="flex justify-center">
              <Avatar url={focus.photoUrl} size={84} ring={color.bar} />
            </div>
            <p className="mt-4 text-xl font-bold text-on-surface">
              {focus.nickname || focus.name}
              {focus.id === selfId && <span className="ml-1.5 text-xs font-semibold text-primary">(คุณ)</span>}
            </p>
            {focus.nickname && <p className="text-xs text-on-surface-variant">{focus.name}</p>}
            <p className="mt-1 text-sm text-on-surface">{focus.position ?? "-"}</p>
            {focus.departmentName && (
              <div className="mt-2">
                <span className="inline-block rounded-full px-3 py-0.5 text-[11px] font-bold" style={{ background: color.chip, color: color.text }}>
                  {focus.departmentName}
                </span>
              </div>
            )}
            {extra.length > 0 && <p className="mt-2 text-xs text-secondary">หัวหน้าเพิ่มเติม: {extra.join(", ")}</p>}
            <Link
              href={profileHref(focus.id)}
              className="mt-4 inline-flex items-center gap-1 rounded-full border border-outline-variant px-4 py-1.5 text-xs font-bold text-primary active:bg-surface"
            >
              <span className="material-symbols-outlined text-[16px]">badge</span>
              {focus.id === selfId ? "โปรไฟล์ของฉัน" : "ดูโปรไฟล์"}
            </Link>
          </div>

          {/* Reports below */}
          {reports.length > 0 ? (
            <div className="flex flex-col items-center">
              <span className="h-5 w-0.5 bg-outline-variant" />
              <p className="mb-3 rounded-full bg-surface-container px-3 py-1 text-xs font-bold text-on-surface-variant">ลูกทีม {reports.length} คน</p>
              <div className="flex w-full flex-wrap justify-center gap-2.5">
                {reports.map((r) => {
                  const rc = deptColor(r.departmentName, departments);
                  const team = countTeam(r.id);
                  const hasTeam = team > 0;
                  const card = (
                    <>
                      <Avatar url={r.photoUrl} size={52} ring={rc.bar} />
                      <span className="mt-2.5 block w-full truncate text-[13px] font-bold text-on-surface">{r.nickname || r.name}</span>
                      <span className="mt-0.5 line-clamp-2 block min-h-[2.2em] text-[10px] leading-tight text-on-surface-variant">{r.position ?? "-"}</span>
                      {hasTeam && (
                        <span className="mt-1.5 inline-flex items-center gap-0.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
                          ทีม {team}
                          <span className="material-symbols-outlined text-[12px]">arrow_downward</span>
                        </span>
                      )}
                    </>
                  );
                  const cls = "flex w-[calc(33.333%-0.45rem)] flex-col items-center rounded-2xl bg-white px-1.5 pb-3 pt-3.5 text-center shadow-[0_4px_16px_rgba(0,0,0,0.06)] active:scale-95 transition-transform";
                  return hasTeam ? (
                    <button key={r.id} onClick={() => go(r.id)} className={cls} style={{ borderTop: `3px solid ${rc.bar}` }}>
                      {card}
                    </button>
                  ) : (
                    <Link key={r.id} href={profileHref(r.id)} className={cls} style={{ borderTop: `3px solid ${rc.bar}` }}>
                      {card}
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-center text-xs text-on-surface-variant">ไม่มีลูกทีม</p>
          )}

          {focus.id !== rootId && (
            <button onClick={() => go(rootId!)} className="mx-auto flex items-center gap-1 rounded-full border border-outline-variant bg-white px-4 py-2 text-xs font-bold text-on-surface-variant active:bg-surface">
              <span className="material-symbols-outlined text-[16px]">vertical_align_top</span>
              กลับไปบนสุด
            </button>
          )}
        </>
      )}
    </div>
  );
}
