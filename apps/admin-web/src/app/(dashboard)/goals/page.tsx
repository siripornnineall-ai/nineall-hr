import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { signAvatarUrls } from "@/lib/avatars";
import { AddGoalButton } from "./AddGoalButton";
import { GoalRow, type GoalData } from "./GoalRow";

// Goals and KPIs per employee. Employees write their own in the employee app; admin / HR see everyone's here and can
// add, edit and delete them for any employee. Line managers see their team's (read-only) through row-level security.
export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ employee?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const supabase = await createClient();
  const canManage = ["super_admin", "hr"].includes(user.role);

  const [{ data: goals }, { data: employees }] = await Promise.all([
    supabase
      .from("employee_goals")
      .select("id, employee_id, kind, title, description, target_value, current_value, period, due_date, status, source, created_at")
      .eq("org_id", user.orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("employees")
      .select("id, employee_code, first_name, last_name, nickname, photo_url")
      .eq("org_id", user.orgId)
      .is("deleted_at", null)
      .in("employment_status", ["active", "probation"])
      .order("employee_code"),
  ]);

  const emps = employees ?? [];
  const filterId = sp.employee && emps.some((e) => e.id === sp.employee) ? sp.employee : "";
  const signed = await signAvatarUrls(supabase, emps.map((e) => e.photo_url));

  const byEmployee = new Map<string, GoalData[]>();
  for (const g of goals ?? []) {
    if (filterId && g.employee_id !== filterId) continue;
    const list = byEmployee.get(g.employee_id) ?? [];
    list.push({
      id: g.id,
      employeeId: g.employee_id,
      kind: g.kind,
      title: g.title,
      description: g.description,
      targetValue: g.target_value,
      currentValue: g.current_value,
      period: g.period,
      dueDate: g.due_date,
      status: g.status,
      source: g.source,
    });
    byEmployee.set(g.employee_id, list);
  }

  const shown = emps.filter((e) => (filterId ? e.id === filterId : byEmployee.has(e.id)));
  const withoutAny = emps.filter((e) => !byEmployee.has(e.id)).length;

  return (
    <>
      <Topbar title="เป้าหมาย & KPI" subtitle="เป้าหมายและ KPI ของพนักงานแต่ละคน" />
      <div className="space-y-4 p-4 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <form className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-on-surface-variant">ดูเฉพาะพนักงาน</label>
              <select name="employee" defaultValue={filterId} className="h-10 min-w-[220px] rounded-lg border border-outline-variant px-3 text-sm">
                <option value="">ทุกคน</option>
                {emps.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employee_code} · {e.nickname ? `${e.nickname} · ` : ""}
                    {e.first_name} {e.last_name}
                  </option>
                ))}
              </select>
            </div>
            <button className="h-10 rounded-lg border border-outline-variant px-4 text-sm font-semibold hover:bg-surface-container">ดู</button>
            {filterId && (
              <Link href="/goals" className="h-10 self-center text-sm font-semibold text-primary">
                ล้างตัวกรอง
              </Link>
            )}
          </form>
          {canManage && <AddGoalButton employees={emps} defaultEmployeeId={filterId || undefined} />}
        </div>

        {shown.length === 0 && (
          <p className="rounded-xl border border-outline-variant bg-white p-8 text-center text-sm text-on-surface-variant">
            ยังไม่มีเป้าหมายหรือ KPI{canManage ? " — กด “เพิ่มเป้าหมาย / KPI ให้พนักงาน” หรือรอให้พนักงานเพิ่มเองในแอป" : ""}
          </p>
        )}

        {shown.map((e) => (
          <section key={e.id} className="space-y-3 rounded-xl border border-outline-variant bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Avatar url={e.photo_url ? (signed.get(e.photo_url) ?? null) : null} size={36} />
              <div>
                <p className="font-bold text-on-surface">
                  {e.nickname ? `${e.nickname} · ` : ""}
                  {e.first_name} {e.last_name}
                </p>
                <p className="text-xs text-on-surface-variant">{e.employee_code}</p>
              </div>
            </div>
            <div className="space-y-2">
              {(byEmployee.get(e.id) ?? []).map((g) => (
                <GoalRow key={g.id} goal={g} canManage={canManage} />
              ))}
              {(byEmployee.get(e.id) ?? []).length === 0 && <p className="text-sm text-on-surface-variant">ยังไม่มีเป้าหมายหรือ KPI</p>}
            </div>
          </section>
        ))}

        {!filterId && withoutAny > 0 && shown.length > 0 && (
          <p className="text-xs text-on-surface-variant">ยังไม่มีเป้าหมาย/KPI อีก {withoutAny} คน (เลือกชื่อด้านบนเพื่อดูหรือเพิ่มให้)</p>
        )}
      </div>
    </>
  );
}
