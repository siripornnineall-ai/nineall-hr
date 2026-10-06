"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { signAvatarUrls } from "@/lib/avatars";

interface OrgNode {
  id: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
  position: string | null;
  departmentName: string | null;
  managerId: string | null;
}

interface TreeNode extends OrgNode {
  children: TreeNode[];
}

interface SecondaryLink {
  employeeId: string;
  managerId: string;
}

// Phone-friendly org chart (2026-10-06). The old picture-style chart was one wide canvas
// (every card side by side, thousands of pixels across) that had to be panned in both
// directions. This is a vertical list instead: each person is a row, people who manage others
// fold open/closed, and children are indented under their manager. Searching or picking a
// department switches to a flat list of matches.

// Plain string comparison (not localeCompare): locale-aware collation can order Thai names
// differently between server and browser, which would make the order jump after hydration.
const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

function buildTree(nodes: OrgNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const n of nodes) byId.set(n.id, { ...n, children: [] });
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const manager = node.managerId ? byId.get(node.managerId) : null;
    if (manager && manager.id !== node.id) manager.children.push(node);
    else roots.push(node);
  }
  const sortRec = (list: TreeNode[]) => {
    list.sort(byName);
    for (const n of list) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

function countDescendants(node: TreeNode): number {
  return node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0);
}

function Avatar({ url, size }: { url: string | null; size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container ring-1 ring-primary/40"
      style={{ width: size, height: size }}
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

export default function OrgChartPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [nodes, setNodes] = useState<OrgNode[]>([]);
  const [secondaryLinks, setSecondaryLinks] = useState<SecondaryLink[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [deptFilter, setDeptFilter] = useState("");
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  // Which managers are folded open. null = "not touched yet" → the top two levels start open.
  const [openIds, setOpenIds] = useState<Set<string> | null>(null);

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
      setDepartments(Array.from(new Set(rows.map((r) => r.department_name).filter((d): d is string => !!d))).sort());
      setLoaded(true);
    })();
  }, [profile, supabase]);

  const roots = useMemo(() => buildTree(nodes), [nodes]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const extraManagers = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const l of secondaryLinks) {
      const name = nodeById.get(l.managerId)?.name;
      if (!name) continue;
      map.set(l.employeeId, [...(map.get(l.employeeId) ?? []), name]);
    }
    return map;
  }, [secondaryLinks, nodeById]);

  // Default open set: roots and their direct reports' managers (first two levels).
  const effectiveOpen = useMemo(() => {
    if (openIds) return openIds;
    const set = new Set<string>();
    for (const r of roots) {
      set.add(r.id);
      for (const c of r.children) set.add(c.id);
    }
    return set;
  }, [openIds, roots]);

  function toggle(id: string) {
    const next = new Set(effectiveOpen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenIds(next);
  }

  const q = query.trim().toLowerCase();
  const filtering = q !== "" || deptFilter !== "";
  const matches = useMemo(() => {
    if (!filtering) return [];
    return nodes
      .filter((n) => {
        if (deptFilter && n.departmentName !== deptFilter) return false;
        if (!q) return true;
        return n.name.toLowerCase().includes(q) || (n.nickname ?? "").toLowerCase().includes(q) || (n.position ?? "").toLowerCase().includes(q);
      })
      .sort(byName);
  }, [filtering, nodes, q, deptFilter]);

  if (!loaded) {
    return (
      <div className="safe-top flex min-h-[50vh] items-center justify-center px-4 pt-4">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  function PersonRow({ node, managerName }: { node: OrgNode; managerName?: string | null }) {
    const isSelf = node.id === profile?.employeeId;
    const extra = extraManagers.get(node.id) ?? [];
    return (
      <Link href={isSelf ? "/profile" : `/colleagues/${node.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-2 active:opacity-70">
        <Avatar url={node.photoUrl} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-on-surface">
            {node.nickname ? `${node.nickname} · ` : ""}
            {node.name}
            {isSelf && <span className="ml-1 text-xs font-normal text-primary">(คุณ)</span>}
          </span>
          <span className="block truncate text-xs text-on-surface-variant">
            {node.position ?? "-"}
            {node.departmentName ? ` · ${node.departmentName}` : ""}
          </span>
          {managerName && <span className="block truncate text-[11px] text-on-surface-variant">หัวหน้า: {managerName}</span>}
          {extra.length > 0 && <span className="block truncate text-[11px] text-secondary">หัวหน้าเพิ่มเติม: {extra.join(", ")}</span>}
        </span>
      </Link>
    );
  }

  function TreeRows({ list, level }: { list: TreeNode[]; level: number }) {
    return (
      <ul className={level > 0 ? "ml-5 border-l-2 border-outline-variant/70 pl-2" : ""}>
        {list.map((node) => {
          const hasChildren = node.children.length > 0;
          const open = effectiveOpen.has(node.id);
          return (
            <li key={node.id}>
              <div className="flex items-center">
                <PersonRow node={node} />
                {hasChildren && (
                  <button
                    onClick={() => toggle(node.id)}
                    aria-expanded={open}
                    aria-label={open ? "ย่อทีม" : "ขยายทีม"}
                    className="ml-1 flex h-9 shrink-0 items-center gap-0.5 rounded-full bg-surface-container px-2.5 text-xs font-bold text-on-surface-variant active:bg-surface-variant"
                  >
                    {countDescendants(node)}
                    <span className="material-symbols-outlined text-[18px]">{open ? "expand_less" : "expand_more"}</span>
                  </button>
                )}
              </div>
              {hasChildren && open && <TreeRows list={node.children} level={level + 1} />}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="safe-top space-y-3 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">ผังองค์กร</h1>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ค้นหาชื่อ ชื่อเล่น หรือตำแหน่ง"
        className="w-full rounded-xl border border-outline-variant bg-white px-3.5 py-2.5 text-sm"
      />

      {departments.length > 0 && (
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          aria-label="แผนก"
          className="h-10 w-full rounded-xl border border-outline-variant bg-white px-3 text-sm"
        >
          <option value="">ทุกแผนก</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      )}

      {nodes.length === 0 ? (
        <p className="text-center text-sm text-on-surface-variant">ยังไม่มีข้อมูลพนักงาน</p>
      ) : filtering ? (
        <div className="rounded-2xl bg-white px-4 py-1 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <p className="pt-2 text-xs text-on-surface-variant">พบ {matches.length} คน</p>
          {matches.length === 0 && <p className="py-6 text-center text-sm text-on-surface-variant">ไม่พบพนักงานที่ค้นหา</p>}
          <ul className="divide-y divide-outline-variant/60">
            {matches.map((n) => (
              <li key={n.id}>
                <PersonRow node={n} managerName={n.managerId ? nodeById.get(n.managerId)?.name : null} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-2xl bg-white px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <TreeRows list={roots} level={0} />
        </div>
      )}

      {!filtering && nodes.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => setOpenIds(new Set(nodes.filter((n) => nodes.some((c) => c.managerId === n.id)).map((n) => n.id)))}
            className="flex-1 rounded-xl border border-outline-variant bg-white py-2 text-xs font-bold text-primary"
          >
            ขยายทั้งหมด
          </button>
          <button onClick={() => setOpenIds(new Set())} className="flex-1 rounded-xl border border-outline-variant bg-white py-2 text-xs font-bold text-on-surface-variant">
            ย่อทั้งหมด
          </button>
        </div>
      )}
    </div>
  );
}
