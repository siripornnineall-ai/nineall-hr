"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { addSecondaryManagerAction, removeSecondaryManagerAction } from "./actions";

export interface OrgChartEmployee {
  id: string;
  name: string;
  photoUrl: string | null;
  position: string | null;
  departmentId: string | null;
  departmentName: string | null;
  managerId: string | null;
}

export interface SecondaryManagerLink {
  id: string;
  employeeId: string;
  managerId: string;
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
// being dropped, so nobody's card silently disappears from the chart. Positioning is driven
// entirely by this primary-manager tree; secondary managers (below) are drawn as extra dashed
// lines between whatever positions this layout already assigned, so they never affect layout.
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
  secondaryManagers,
  canManage,
}: {
  employees: OrgChartEmployee[];
  departments: { id: string; name: string }[];
  secondaryManagers: SecondaryManagerLink[];
  canManage: boolean;
}) {
  const [deptFilter, setDeptFilter] = useState("");
  const [links, setLinks] = useState(secondaryManagers);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => setLinks(secondaryManagers), [secondaryManagers]);

  const roots = useMemo(() => buildTree(employees), [employees]);
  const allNodes = useMemo(() => flatten(roots), [roots]);
  const nodeById = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes]);
  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

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

  function handleAdd(employeeId: string, managerEmployeeId: string) {
    setError(null);
    startTransition(async () => {
      const result = await addSecondaryManagerAction(employeeId, managerEmployeeId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setLinks((prev) => [...prev, { id: `${employeeId}-${managerEmployeeId}`, employeeId, managerId: managerEmployeeId }]);
    });
  }

  function handleRemove(linkId: string) {
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
    startTransition(() => removeSecondaryManagerAction(linkId));
  }

  const managingEmployee = managingId ? employeeById.get(managingId) : null;
  const managingLinks = managingId ? links.filter((l) => l.employeeId === managingId) : [];

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

      <div className="flex items-center gap-3 text-[11px] text-on-surface-variant">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 bg-outline" /> หัวหน้าโดยตรง
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-secondary" /> หัวหน้าเพิ่มเติม
        </span>
      </div>

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
            {links.map((link) => {
              const employee = nodeById.get(link.employeeId);
              const manager = nodeById.get(link.managerId);
              if (!employee || !manager) return null;
              const mPos = pixelPos(manager);
              const cPos = pixelPos(employee);
              const x1 = mPos.left + CARD_W / 2;
              const y1 = mPos.top + CARD_H / 2;
              const x2 = cPos.left + CARD_W / 2;
              const y2 = cPos.top + CARD_H / 2;
              const dimmed = !!deptFilter && employee.departmentId !== deptFilter && manager.departmentId !== deptFilter;
              return (
                <line
                  key={link.id}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={dimmed ? "var(--color-outline-variant)" : "var(--color-secondary)"}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  opacity={dimmed ? 0.35 : 0.7}
                />
              );
            })}
          </svg>

          {allNodes.map((node) => {
            const pos = pixelPos(node);
            const dimmed = !!deptFilter && node.departmentId !== deptFilter;
            const manager = node.managerId ? nodeById.get(node.managerId) : null;
            const extraManagerNames = links
              .filter((l) => l.employeeId === node.id)
              .map((l) => nodeById.get(l.managerId)?.name)
              .filter((n): n is string => !!n);
            return (
              <div key={node.id} className="absolute" style={{ left: pos.left, top: pos.top, width: CARD_W, opacity: dimmed ? 0.35 : 1 }}>
                <Link
                  href={`/employees/${node.id}`}
                  className="flex flex-col rounded-xl border border-outline-variant bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
                  style={{ height: CARD_H }}
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
                    {extraManagerNames.length > 0 && (
                      <p className="truncate text-[10px] text-secondary">+ หัวหน้า: {extraManagerNames.join(", ")}</p>
                    )}
                  </div>
                </Link>
                {canManage && (
                  <button
                    onClick={() => {
                      setError(null);
                      setManagingId(node.id);
                    }}
                    className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-outline-variant py-1 text-[10px] font-semibold text-on-surface-variant hover:border-secondary hover:text-secondary"
                  >
                    <span className="material-symbols-outlined text-[12px]">add</span>
                    หัวหน้าเพิ่มเติม
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {managingEmployee && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setManagingId(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-bold text-on-surface">หัวหน้าเพิ่มเติมของ {managingEmployee.name}</h3>
              <button onClick={() => setManagingId(null)} className="text-on-surface-variant">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <p className="mb-3 text-xs text-on-surface-variant">
              ไม่กระทบสิทธิ์อนุมัติใดๆ — ใช้แสดงบนผังองค์กรเป็นเส้นประเท่านั้น หัวหน้าหลัก (สิทธิ์อนุมัติจริง) ยังคงตั้งจากหน้าแก้ไขข้อมูลพนักงานตามเดิม
            </p>

            {error && <p className="mb-2 text-sm font-semibold text-status-danger">{error}</p>}

            <div className="mb-3 space-y-1.5">
              {managingLinks.length === 0 && <p className="text-xs text-on-surface-variant">ยังไม่มีหัวหน้าเพิ่มเติม</p>}
              {managingLinks.map((link) => (
                <div key={link.id} className="flex items-center justify-between rounded-lg bg-surface-container px-3 py-2">
                  <span className="text-sm text-on-surface">{nodeById.get(link.managerId)?.name ?? "-"}</span>
                  <button onClick={() => handleRemove(link.id)} className="text-xs font-semibold text-status-danger">
                    ลบ
                  </button>
                </div>
              ))}
            </div>

            <select
              value=""
              onChange={(e) => {
                if (e.target.value) handleAdd(managingEmployee.id, e.target.value);
              }}
              className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
            >
              <option value="">-- เลือกพนักงานเพื่อเพิ่มเป็นหัวหน้า --</option>
              {employees
                .filter(
                  (e) =>
                    e.id !== managingEmployee.id &&
                    e.id !== managingEmployee.managerId &&
                    !managingLinks.some((l) => l.managerId === e.id)
                )
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
