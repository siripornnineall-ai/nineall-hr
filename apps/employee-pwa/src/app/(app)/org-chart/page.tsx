"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface OrgNode {
  id: string;
  name: string;
  photoUrl: string | null;
  position: string | null;
  departmentName: string | null;
  managerId: string | null;
}

interface LayoutNode extends OrgNode {
  children: LayoutNode[];
  depth: number;
  x: number;
}

// Fixed card size + gaps rather than DOM measurement — deterministic layout, no measure-then-
// reposition flash. Mirrors admin-web's org-chart layout (same algorithm, employee-pwa styling).
const CARD_W = 176;
const CARD_H = 92;
const GAP_X = 16;
const GAP_Y = 48;

function buildTree(nodes: OrgNode[]): LayoutNode[] {
  const byId = new Map<string, LayoutNode>();
  for (const n of nodes) byId.set(n.id, { ...n, children: [], depth: 0, x: 0 });

  const roots: LayoutNode[] = [];
  for (const node of byId.values()) {
    const manager = node.managerId ? byId.get(node.managerId) : null;
    if (manager) manager.children.push(node);
    else roots.push(node);
  }

  // Plain string comparison (not localeCompare) — locale-aware collation can order Thai names
  // differently between server and browser ICU, which would make this layout non-deterministic.
  function assignDepth(node: LayoutNode, depth: number) {
    node.depth = depth;
    node.children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const child of node.children) assignDepth(child, depth + 1);
  }
  roots.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const root of roots) assignDepth(root, 0);

  let nextLeafSlot = 0;
  function assignX(node: LayoutNode): number {
    if (node.children.length === 0) {
      node.x = nextLeafSlot;
      nextLeafSlot += 1;
      return node.x;
    }
    const childXs = node.children.map(assignX);
    node.x = childXs.reduce((sum, x) => sum + x, 0) / childXs.length;
    return node.x;
  }
  for (const root of roots) assignX(root);

  return roots;
}

function flatten(roots: LayoutNode[]): LayoutNode[] {
  const out: LayoutNode[] = [];
  function walk(node: LayoutNode) {
    out.push(node);
    for (const child of node.children) walk(child);
  }
  for (const root of roots) walk(root);
  return out;
}

export default function OrgChartPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [nodes, setNodes] = useState<OrgNode[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [deptFilter, setDeptFilter] = useState("");
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase.rpc("get_org_chart_nodes");
      const rows = (data ?? []) as {
        employee_id: string;
        first_name: string;
        last_name: string;
        photo_url: string | null;
        position_title: string | null;
        department_name: string | null;
        manager_employee_id: string | null;
      }[];

      const photoPaths = Array.from(new Set(rows.map((r) => r.photo_url).filter((p): p is string => !!p)));
      const urlByPath = new Map<string, string>();
      if (photoPaths.length > 0) {
        const { data: signed } = await supabase.storage.from("avatars").createSignedUrls(photoPaths, 3600);
        for (const item of signed ?? []) {
          if (item.signedUrl && item.path) urlByPath.set(item.path, item.signedUrl);
        }
      }

      setNodes(
        rows.map((r) => ({
          id: r.employee_id,
          name: `${r.first_name} ${r.last_name}`,
          photoUrl: r.photo_url ? (urlByPath.get(r.photo_url) ?? null) : null,
          position: r.position_title,
          departmentName: r.department_name,
          managerId: r.manager_employee_id,
        }))
      );
      setDepartments(Array.from(new Set(rows.map((r) => r.department_name).filter((d): d is string => !!d))).sort());
      setLoaded(true);
    })();
  }, [profile, supabase]);

  const roots = useMemo(() => buildTree(nodes), [nodes]);
  const allNodes = useMemo(() => flatten(roots), [roots]);
  const nodeById = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [roots]);

  function pixelPos(node: LayoutNode) {
    return { left: node.x * (CARD_W + GAP_X), top: node.depth * (CARD_H + GAP_Y) };
  }

  if (!loaded) {
    return (
      <div className="safe-top flex min-h-[50vh] items-center justify-center px-4 pt-4">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  const maxDepth = allNodes.length > 0 ? Math.max(...allNodes.map((n) => n.depth)) : 0;
  const maxX = allNodes.length > 0 ? Math.max(...allNodes.map((n) => n.x)) : 0;
  const width = (maxX + 1) * (CARD_W + GAP_X);
  const height = (maxDepth + 1) * (CARD_H + GAP_Y);

  return (
    <div className="safe-top space-y-4 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">ผังองค์กร</h1>

      {departments.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-on-surface-variant">แผนก:</label>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-9 flex-1 rounded-lg border border-outline-variant bg-white px-3 text-sm"
          >
            <option value="">ทั้งหมด</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      )}

      {allNodes.length === 0 ? (
        <p className="text-center text-sm text-on-surface-variant">ยังไม่มีข้อมูลพนักงาน</p>
      ) : (
        <div ref={scrollRef} className="overflow-auto rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <div className="relative" style={{ width, height }}>
            <svg className="pointer-events-none absolute left-0 top-0" width={width} height={height}>
              {allNodes.map((node) => {
                if (!node.managerId) return null;
                const manager = nodeById.get(node.managerId);
                if (!manager) return null;
                const mPos = pixelPos(manager);
                const cPos = pixelPos(node);
                const x1 = mPos.left + CARD_W / 2;
                const y1 = mPos.top + CARD_H;
                const x2 = cPos.left + CARD_W / 2;
                const y2 = cPos.top;
                const midY = (y1 + y2) / 2;
                const dimmed = !!deptFilter && node.departmentName !== deptFilter && manager.departmentName !== deptFilter;
                return (
                  <path
                    key={node.id}
                    d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                    fill="none"
                    stroke={dimmed ? "var(--color-outline-variant)" : "var(--color-outline)"}
                    strokeWidth={2}
                  />
                );
              })}
            </svg>

            {allNodes.map((node) => {
              const pos = pixelPos(node);
              const dimmed = !!deptFilter && node.departmentName !== deptFilter;
              const isSelf = node.id === profile?.employeeId;
              return (
                <Link
                  key={node.id}
                  href={isSelf ? "/profile" : `/colleagues/${node.id}`}
                  className="absolute flex flex-col rounded-xl border border-outline-variant bg-white p-2.5 shadow-sm active:scale-95 transition-transform"
                  style={{ left: pos.left, top: pos.top, width: CARD_W, height: CARD_H, opacity: dimmed ? 0.35 : 1 }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container ring-1 ring-primary">
                      {node.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={node.photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">person</span>
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-bold text-on-surface">{node.name}</p>
                      <p className="truncate text-[10px] text-on-surface-variant">{node.position ?? "-"}</p>
                    </div>
                  </div>
                  <p className="mt-auto truncate border-t border-outline-variant pt-1 text-[9px] text-on-surface-variant">
                    {node.departmentName ?? "ไม่ระบุแผนก"}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
