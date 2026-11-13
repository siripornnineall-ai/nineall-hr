import { requireUser } from "@/lib/auth";
import { formatLeaveDuration } from "@/lib/leaveDuration";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { signAvatarUrls } from "@/lib/avatars";
import { LeaveRow } from "./LeaveRow";
import { AddBackdatedLeaveForm } from "./AddBackdatedLeaveForm";

const FILTER_STATUSES: { value: string; label: string }[] = [
  { value: "pending", label: "รออนุมัติ" },
  { value: "approved", label: "อนุมัติแล้ว" },
  { value: "rejected", label: "ปฏิเสธ" },
  { value: "cancelled", label: "ยกเลิก" },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string; type?: string; status?: string; from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const supabase = await createClient();
  const sp = await searchParams;

  // Filters (all optional, combined with AND). Anything malformed is ignored.
  const employeeFilter = sp.employee && UUID.test(sp.employee) ? sp.employee : "";
  const typeFilter = sp.type && UUID.test(sp.type) ? sp.type : "";
  const statusFilter = FILTER_STATUSES.some((s) => s.value === sp.status) ? (sp.status as string) : "";
  const fromFilter = sp.from && ISO_DATE.test(sp.from) ? sp.from : "";
  const toFilter = sp.to && ISO_DATE.test(sp.to) ? sp.to : "";
  const filtering = !!(employeeFilter || typeFilter || statusFilter || fromFilter || toFilter);
  const rowLimit = filtering ? 500 : 50;

  let leaveQuery = supabase
    .from("leave_requests")
    .select(
      "id, start_date, end_date, total_days, unit, start_time, end_time, status, reason, created_at, leave_type_id, approval_stage, manager_decided_by, manager_decision, manager_comment, employees!leave_requests_employee_id_fkey!inner(employee_code, first_name, last_name, photo_url, manager_employee_id), leave_types(name_th)"
    )
    .eq("org_id", user.orgId)
    .neq("approval_stage", "manager")
    .not("employees.employment_status", "in", "(resigned,terminated)");
  if (employeeFilter) leaveQuery = leaveQuery.eq("employee_id", employeeFilter);
  if (typeFilter) leaveQuery = leaveQuery.eq("leave_type_id", typeFilter);
  if (statusFilter) leaveQuery = leaveQuery.eq("status", statusFilter);
  // A request is in range when it overlaps [from, to].
  if (fromFilter) leaveQuery = leaveQuery.gte("end_date", fromFilter);
  if (toFilter) leaveQuery = leaveQuery.lte("start_date", toFilter);
  leaveQuery = leaveQuery.order("created_at", { ascending: false }).limit(rowLimit);

  // employees must be disambiguated: leave_requests has two FKs to employees
  // (employee_id and delegate_employee_id), so a bare `employees(...)` embed is
  // ambiguous to PostgREST and errors out silently (same bug as employees/[id]'s
  // teams embed — see that page's comment).
  // Owner's rule: a request doesn't appear on the admin side until the หัวหน้า has approved
  // it. Only a count of those is shown, so HR can tell an employee "it's still with your
  // manager" instead of "I can't find it".
  const [{ data }, { data: leaveTypes }, { data: employees }, { count: waitingOnManagerCount }] = await Promise.all([
    leaveQuery,
    supabase.from("leave_types").select("id, name_th, code").eq("org_id", user.orgId).eq("is_active", true).order("sort_order"),
    supabase
      .from("employees")
      .select("id, employee_code, first_name, last_name")
      .eq("org_id", user.orgId)
      .is("deleted_at", null)
      .in("employment_status", ["active", "probation"])
      .order("employee_code"),
    supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("org_id", user.orgId)
      .eq("status", "pending")
      .eq("approval_stage", "manager"),
  ]);

  const signedByPath = await signAvatarUrls(
    supabase,
    (data ?? []).map((r) => (r.employees as unknown as { photo_url: string | null } | null)?.photo_url)
  );

  // Leave is approved in two steps (หัวหน้า -> HR). Resolve the manager involved in each row:
  // whoever already decided the first step, otherwise whoever it's waiting on.
  const managerIdOf = (r: NonNullable<typeof data>[number]): string | null => {
    const emp = r.employees as unknown as { manager_employee_id: string | null } | null;
    return (r.manager_decided_by as string | null) ?? emp?.manager_employee_id ?? null;
  };
  const managerIds = Array.from(new Set((data ?? []).map(managerIdOf).filter((id): id is string => !!id)));
  const { data: managerPeople } =
    managerIds.length > 0 ? await supabase.rpc("get_employees_basic_info", { p_employee_ids: managerIds }) : { data: [] };
  const managerNameById = new Map<string, string>(
    ((managerPeople ?? []) as { employee_id: string; first_name: string; last_name: string; nickname: string | null }[]).map((p) => [
      p.employee_id,
      p.nickname || `${p.first_name} ${p.last_name}`,
    ])
  );

  const rows = (data ?? []).map((r) => {
    const emp = r.employees as unknown as { employee_code: string; first_name: string; last_name: string; photo_url: string | null } | null;
    const managerId = managerIdOf(r);
    const leaveType = r.leave_types as unknown as { name_th: string } | null;
    return {
      id: r.id,
      leaveTypeId: r.leave_type_id,
      leaveTypeName: leaveType?.name_th ?? "-",
      startDate: r.start_date,
      endDate: r.end_date,
      totalDays: Number(r.total_days),
      durationLabel: formatLeaveDuration(r.unit as string | null, Number(r.total_days), r.start_time as string | null, r.end_time as string | null),
      status: r.status,
      approvalStage: (r.approval_stage as string | null) ?? "hr",
      managerName: managerId ? (managerNameById.get(managerId) ?? null) : null,
      managerDecision: (r.manager_decision as string | null) ?? null,
      managerComment: (r.manager_comment as string | null) ?? null,
      reason: r.reason,
      employeeCode: emp?.employee_code ?? "-",
      employeeName: emp ? `${emp.first_name} ${emp.last_name}` : "-",
      employeePhotoUrl: emp?.photo_url ? (signedByPath.get(emp.photo_url) ?? null) : null,
    };
  });

  // Per-type totals of what is listed (only meaningful when filtered). Rejected / cancelled requests don't use any leave.
  const summary = new Map<string, { approvedDays: number; pendingDays: number; count: number }>();
  for (const r of rows) {
    if (r.status !== "approved" && r.status !== "pending") continue;
    const s = summary.get(r.leaveTypeName) ?? { approvedDays: 0, pendingDays: 0, count: 0 };
    if (r.status === "approved") s.approvedDays += r.totalDays;
    else s.pendingDays += r.totalDays;
    s.count += 1;
    summary.set(r.leaveTypeName, s);
  }
  const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
  const truncated = filtering && rows.length >= rowLimit;
  const control = "h-10 w-full rounded-lg border border-outline-variant bg-white px-3 text-sm";
  const controlLabel = "mb-1 block text-xs font-semibold text-on-surface-variant";

  return (
    <>
      <Topbar title="การลา" subtitle="คำขอลาทั้งหมด — อนุมัติ 2 ขั้น: หัวหน้างาน แล้วจึง HR/แอดมิน" />
      <div className="space-y-4 p-4 md:p-8">
        <AddBackdatedLeaveForm employees={employees ?? []} leaveTypes={leaveTypes ?? []} />
        <form method="get" className="rounded-xl border border-outline-variant bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div>
              <label className={controlLabel} htmlFor="f-employee">พนักงาน</label>
              <select id="f-employee" name="employee" defaultValue={employeeFilter} className={control}>
                <option value="">ทุกคน</option>
                {(employees ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employee_code} · {e.first_name} {e.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={controlLabel} htmlFor="f-type">ประเภทลา</label>
              <select id="f-type" name="type" defaultValue={typeFilter} className={control}>
                <option value="">ทุกประเภท</option>
                {(leaveTypes ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name_th}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={controlLabel} htmlFor="f-status">สถานะ</label>
              <select id="f-status" name="status" defaultValue={statusFilter} className={control}>
                <option value="">ทุกสถานะ</option>
                {FILTER_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={controlLabel} htmlFor="f-from">ตั้งแต่วันที่</label>
              <input id="f-from" type="date" name="from" defaultValue={fromFilter} className={control} />
            </div>
            <div>
              <label className={controlLabel} htmlFor="f-to">ถึงวันที่</label>
              <input id="f-to" type="date" name="to" defaultValue={toFilter} className={control} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white">
              กรอง
            </button>
            {filtering && (
              <a href="/leave" className="text-xs font-semibold text-on-surface-variant underline">
                ล้างตัวกรอง
              </a>
            )}
            <span className="text-xs text-on-surface-variant">
              {filtering ? `พบ ${rows.length} รายการ` : "ไม่ได้กรอง — แสดง 50 คำขอล่าสุด"}
              {truncated && ` (แสดงสูงสุด ${rowLimit} รายการ ให้เลือกช่วงวันที่ให้แคบลง)`}
            </span>
          </div>
          {filtering && summary.size > 0 && (
            <div className="mt-4 border-t border-outline-variant pt-3">
              <p className="mb-2 text-xs font-bold text-on-surface-variant">สรุปวันลาตามประเภท (อนุมัติแล้ว + รออนุมัติ)</p>
              <div className="flex flex-wrap gap-2">
                {Array.from(summary.entries()).map(([name, s]) => (
                  <span key={name} className="rounded-lg bg-surface-container px-3 py-1.5 text-xs">
                    <span className="font-bold">{name}</span> {fmtDays(s.approvedDays)} วัน
                    {s.pendingDays > 0 && <span className="text-on-surface-variant"> (+รออนุมัติ {fmtDays(s.pendingDays)} วัน)</span>}
                    <span className="text-on-surface-variant"> · {s.count} ครั้ง</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </form>
        {(waitingOnManagerCount ?? 0) > 0 && (
          <p className="text-xs text-on-surface-variant">
            มีอีก {waitingOnManagerCount} คำขอที่ยังรอหัวหน้างานอนุมัติ — จะแสดงในหน้านี้เมื่อหัวหน้าอนุมัติแล้ว
          </p>
        )}
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  <th className="px-4 py-3 font-bold text-on-surface-variant">พนักงาน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">ประเภทลา</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">วันที่</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">จำนวนวัน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">เหตุผล</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">สถานะ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">
                      {filtering ? "ไม่พบคำขอลาตามตัวกรองที่เลือก" : "ยังไม่มีคำขอลา"}
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <LeaveRow key={r.id} row={r} leaveTypes={leaveTypes ?? []} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
