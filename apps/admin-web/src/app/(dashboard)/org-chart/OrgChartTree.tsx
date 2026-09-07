"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";

export interface OrgChartEmployee {
  id: string;
  name: string;
  photoUrl: string | null;
  position: string | null;
  departmentId: string | null;
  departmentName: string | null;
  managerId: string | null;
}

interface LayoutNode extends OrgChartEmployee {
  children: LayoutNode[];
  depth: number;
  x: number;
}

// Fixed card size + gaps rather than DOM measurement — keeps layout deterministic and avoids
// a measure-then-reposition flash; ~20 employees across a few levels comfortably fits this.
const CARD_W = 216;
const CARD_H = 104;
const GAP_X = 24;
const GAP_Y = 60;

// A manager whose own manager_employee_id was never set, or who points at someone outside
// this org/soft-deleted, has no home in the tree — they become an implicit root instead of
// being dropped, so nobody's card silently disappears from the chart.
function buildTree(employees: OrgChartEmployee[]): LayoutNode[] {
  const byId = new Map<string, LayoutNode>();
  for (const e of employees) byId.set(e.id, { ...e, children: [], depth: 0, x: 0 });

  const roots: LayoutNode[] = [];
  for (const node of byId.values()) {
    const manager = node.managerId ? byId.get(node.managerId) : null;
    if (manager) manager.children.push(node);
    else roots.push(node);
  }

  function assignDepth(node: LayoutNode, depth: number) {
    node.depth = depth;
    node.children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const child of node.children) assignDepth(child, depth + 1);
  }
  roots.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const root of roots) assignDepth(root, 0);

  // Post-order: leaves get sequential slots left-to-right, each parent centers over its
  // children's average slot — the standard simple tree-layout trick that keeps siblings from
  // overlapping without needing a full Reingold-Tilford pass for a chart this size.
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

export function OrgChartTree({
  employees,
  departments,
}: {
  employees: OrgChartEmployee[];
  departments: { id: string; name: string }[];
}) {
  const [deptFilter, setDeptFilter] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const roots = useMemo(() => buildTree(employees), [employees]);
  const allNodes = useMemo(() => flatten(roots), [roots]);
  const nodeById = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes]);

  // Wide trees center the root well past the left edge of the canvas — without this the
  // container would open scrolled to (0,0), showing blank space until the admin scrolls right.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [roots]);

  if (employees.length === 0) {
    return (
      <div className="rounded-xl border border-outline-variant bg-white p-10 text-center text-on-surface-variant shadow-sm">
        ยังไม่มีข้อมูลพนักงาน
      </div>
    );
  }

  const maxDepth = Math.max(...allNodes.map((n) => n.depth));
  const maxX = Math.max(...allNodes.map((n) => n.x));
  const width = (maxX + 1) * (CARD_W + GAP_X);
  const height = (maxDepth + 1) * (CARD_H + GAP_Y);

  function pixelPos(node: LayoutNode) {
    return { left: node.x * (CARD_W + GAP_X), top: node.depth * (CARD_H + GAP_Y) };
  }

  return (
    <div className="space-y-3">
      {departments.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-on-surface-variant">แสดงเฉพาะแผนก:</label>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-9 rounded-lg border border-outline-variant bg-surface px-3 text-sm"
          >
            <option value="">ทั้งหมด</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div ref={scrollRef} className="overflow-auto rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
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
              const dimmed = !!deptFilter && node.departmentId !== deptFilter && manager.departmentId !== deptFilter;
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
            const dimmed = !!deptFilter && node.departmentId !== deptFilter;
            const manager = node.managerId ? nodeById.get(node.managerId) : null;
            return (
              <Link
                key={node.id}
                href={`/employees/${node.id}`}
                className="absolute flex flex-col rounded-xl border border-outline-variant bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
                style={{ left: pos.left, top: pos.top, width: CARD_W, height: CARD_H, opacity: dimmed ? 0.35 : 1 }}
              >
                <div className="flex items-center gap-2">
                  <Avatar url={node.photoUrl} size={32} />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-on-surface">{node.name}</p>
                    <p className="truncate text-[11px] text-on-surface-variant">{node.position ?? "ไม่ระบุตำแหน่ง"}</p>
                  </div>
                </div>
                <div className="mt-auto space-y-0.5 border-t border-outline-variant pt-1.5">
                  <p className="truncate text-[10px] text-on-surface-variant">แผนก: {node.departmentName ?? "ไม่ระบุ"}</p>
                  <p className="truncate text-[10px] text-on-surface-variant">หัวหน้า: {manager ? manager.name : "ไม่มี (ตำแหน่งสูงสุด)"}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
