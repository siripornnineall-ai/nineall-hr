import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";

interface EmployeeNode {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
  managerId: string | null;
  children: EmployeeNode[];
}

export default async function OrgChartPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("employees")
    .select("id, first_name, last_name, manager_employee_id, job_positions(title), departments(name)")
    .eq("org_id", user.orgId)
    .in("employment_status", ["active", "probation"])
    .order("first_name");

  const nodesById = new Map<string, EmployeeNode>();
  for (const e of data ?? []) {
    nodesById.set(e.id, {
      id: e.id,
      name: `${e.first_name} ${e.last_name}`,
      position: (e.job_positions as unknown as { title: string } | null)?.title ?? null,
      department: (e.departments as unknown as { name: string } | null)?.name ?? null,
      managerId: e.manager_employee_id,
      children: [],
    });
  }

  const roots: EmployeeNode[] = [];
  for (const node of nodesById.values()) {
    if (node.managerId && nodesById.has(node.managerId)) {
      nodesById.get(node.managerId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return (
    <>
      <Topbar title="ผังองค์กร" subtitle="โครงสร้างสายบังคับบัญชา" />
      <div className="space-y-4 p-4 md:p-8">
        <div className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
          {roots.length === 0 && <p className="text-center text-on-surface-variant">ยังไม่มีข้อมูลพนักงาน</p>}
          <div className="space-y-2">
            {roots.map((node) => (
              <OrgNode key={node.id} node={node} depth={0} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function OrgNode({ node, depth }: { node: EmployeeNode; depth: number }) {
  return (
    <div style={{ marginLeft: depth > 0 ? 28 : 0 }} className={depth > 0 ? "border-l border-outline-variant pl-4" : ""}>
      <div className="mb-2 flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container text-primary">
          <span className="material-symbols-outlined text-[20px]">person</span>
        </div>
        <div>
          <p className="text-sm font-bold text-on-surface">{node.name}</p>
          <p className="text-xs text-on-surface-variant">
            {node.position ?? "ไม่ระบุตำแหน่ง"}
            {node.department && ` · ${node.department}`}
          </p>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="space-y-2">
          {node.children.map((child) => (
            <OrgNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
