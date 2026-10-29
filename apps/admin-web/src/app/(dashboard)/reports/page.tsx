import Link from "next/link";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { ExportCsvButton } from "../attendance/summary/ExportCsvButton";

// Year-end overview for the owner (2026-10-29): who is late all year, how many leave days everyone has
// used and has left, and sick leave / absence figures. Leave "used" is counted from approved leave
// requests (the source of truth); the entitlement comes from leave_balances.

type Tab = "late" | "leave" | "sick";

const WORKED_STATUSES = new Set(["on_time", "late", "early_leave", "work_from_home", "off_site"]);
const MONTHS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const round2 = (n: number) => Math.round(n * 100) / 100;

function hm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} นาที`;
  return r === 0 ? `${h} ชม.` : `${h} ชม. ${r} นาที`;
}

const fmtShort = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });

// PostgREST returns at most 1000 rows per request; a year for ~40 people is far more than that.
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await build(from, from + 999);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

interface LeaveReq {
  employee_id: string;
  leave_type_id: string;
  status: string;
  unit: string | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  total_days: number;
}

function leaveLabel(r: LeaveReq): string {
  if (r.unit === "hourly" && r.start_time && r.end_time) {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const s = toMin(r.start_time);
    const e = toMin(r.end_time);
    const lunch = Math.max(0, Math.min(e, 13 * 60) - Math.max(s, 12 * 60));
    return `${fmtShort(r.start_date)} (${hm(e - s - lunch)})`;
  }
  if (r.unit === "half_day") return `${fmtShort(r.start_date)} (ครึ่งวัน)`;
  return r.start_date === r.end_date ? `${fmtShort(r.start_date)}` : `${fmtShort(r.start_date)}–${fmtShort(r.end_date)} (${round2(Number(r.total_days))} วัน)`;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string; year?: string }> }) {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const sp = await searchParams;
  const tab: Tab = sp.tab === "leave" || sp.tab === "sick" ? sp.tab : "late";
  const todayBkk = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : Number(todayBkk.slice(0, 4));
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const supabase = await createClient();

  const { data: employees } = await supabase
    .from("employees")
    .select("id, employee_code, first_name, last_name, nickname, hide_late_status, departments(name)")
    .eq("org_id", user.orgId)
    .is("deleted_at", null)
    .in("employment_status", ["active", "probation"])
    .order("employee_code");
  const emps = (employees ?? []).map((e) => ({
    id: e.id as string,
    code: e.employee_code as string,
    name: `${e.first_name} ${e.last_name}`,
    nickname: e.nickname as string | null,
    hideLate: Boolean(e.hide_late_status),
    dept: (e.departments as unknown as { name: string } | null)?.name ?? "-",
  }));
  const empIds = new Set(emps.map((e) => e.id));

  const [attendanceAll, leaveAll, { data: types }, balancesAll] = await Promise.all([
    fetchAll<{ employee_id: string; work_date: string; status: string; late_minutes: number | null; early_leave_minutes: number | null }>((from, to) =>
      supabase.from("attendance_records").select("employee_id, work_date, status, late_minutes, early_leave_minutes").eq("org_id", user.orgId).gte("work_date", yearStart).lte("work_date", yearEnd).range(from, to)
    ),
    fetchAll<LeaveReq>((from, to) =>
      supabase
        .from("leave_requests")
        .select("employee_id, leave_type_id, status, unit, start_date, end_date, start_time, end_time, total_days")
        .eq("org_id", user.orgId)
        .in("status", ["approved", "pending"])
        .gte("start_date", yearStart)
        .lte("start_date", yearEnd)
        .order("start_date")
        .range(from, to)
    ),
    supabase.from("leave_types").select("id, code, name_th").eq("org_id", user.orgId).order("sort_order"),
    fetchAll<{ employee_id: string; leave_type_id: string; entitled_days: number; carried_over_days: number }>((from, to) =>
      supabase.from("leave_balances").select("employee_id, leave_type_id, entitled_days, carried_over_days").eq("year", year).range(from, to)
    ),
  ]);

  const attendance = attendanceAll.filter((a) => empIds.has(a.employee_id));
  const leaves = leaveAll.filter((l) => empIds.has(l.employee_id));
  const typeById = new Map((types ?? []).map((t) => [t.id as string, { code: t.code as string, name: t.name_th as string }]));
  const typeIdByCode = new Map((types ?? []).map((t) => [t.code as string, t.id as string]));
  const balanceOf = (empId: string, code: string) => {
    const tid = typeIdByCode.get(code);
    const b = balancesAll.find((x) => x.employee_id === empId && x.leave_type_id === tid);
    return b ? Number(b.entitled_days) + Number(b.carried_over_days) : null;
  };
  const usedOf = (empId: string, code: string, status: string) =>
    round2(leaves.filter((l) => l.employee_id === empId && l.status === status && typeById.get(l.leave_type_id)?.code === code).reduce((s, l) => s + Number(l.total_days), 0));

  const tabLink = (t: Tab) => `?tab=${t}&year=${year}`;
  const yearLink = (y: number) => `?tab=${tab}&year=${y}`;

  let csvRows: string[][] = [];
  let content: React.ReactNode = null;
  let subtitle = "";

  if (tab === "late") {
    subtitle = "คนที่มาสายตลอดทั้งปี";
    // Late days that OT has already covered (HR / Content staff on that rule) do not count as late.
    const covered = new Map<string, Set<string>>();
    await Promise.all(
      emps
        .filter((e) => e.hideLate)
        .map(async (e) => {
          const { data } = await supabase.rpc("late_covered_dates", { p_employee_id: e.id, p_from: yearStart, p_to: yearEnd });
          covered.set(e.id, new Set((data ?? []) as unknown as string[]));
        })
    );

    const rows = emps
      .map((e) => {
        const att = attendance.filter((a) => a.employee_id === e.id);
        const lateRows = att.filter((a) => (a.late_minutes ?? 0) > 0 && !(a.status === "late" && covered.get(e.id)?.has(a.work_date)));
        const perMonth = Array<number>(12).fill(0);
        for (const a of lateRows) perMonth[Number(a.work_date.slice(5, 7)) - 1]++;
        const minutes = lateRows.reduce((s, a) => s + (a.late_minutes ?? 0), 0);
        const workedDays = att.filter((a) => WORKED_STATUSES.has(a.status)).length;
        return { ...e, lateDays: lateRows.length, minutes, perMonth, workedDays };
      })
      .filter((r) => r.lateDays > 0)
      .sort((a, b) => b.lateDays - a.lateDays || b.minutes - a.minutes);

    const totalLate = rows.reduce((s, r) => s + r.lateDays, 0);
    const totalMin = rows.reduce((s, r) => s + r.minutes, 0);
    const monthsShown = year === Number(todayBkk.slice(0, 4)) ? Number(todayBkk.slice(5, 7)) : 12;
    const shownMonths = Array.from({ length: monthsShown }, (_, i) => i);

    csvRows = [
      ["อันดับ", "รหัส", "ชื่อ", "แผนก", "มาสาย (วัน)", "สายรวม (นาที)", "เฉลี่ยต่อครั้ง (นาที)", "% ของวันที่มาทำงาน", ...shownMonths.map((i) => MONTHS_TH[i])],
      ...rows.map((r, i) => [String(i + 1), r.code, r.name, r.dept, String(r.lateDays), String(r.minutes), String(Math.round(r.minutes / r.lateDays)), r.workedDays ? String(Math.round((r.lateDays / r.workedDays) * 100)) : "-", ...shownMonths.map((m) => String(r.perMonth[m]))]),
    ];

    content = (
      <>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="จำนวนครั้งที่มาสาย (ทั้งบริษัท)" value={`${totalLate} ครั้ง`} />
          <Stat label="จำนวนคนที่เคยมาสาย" value={`${rows.length} / ${emps.length} คน`} />
          <Stat label="เวลาที่สายรวม" value={hm(totalMin)} />
        </div>
        <p className="text-xs text-on-surface-variant">เรียงจากสายบ่อยที่สุด · วันสายที่หักจาก OT / อยู่ทดแล้ว (ทีมที่ตั้งไว้) ไม่นับ{year === 2026 ? " · ระบบมีข้อมูลลงเวลาตั้งแต่ เม.ย. 2569" : ""}</p>
        <TableShell minWidth={900}>
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container">
              {["#", "พนักงาน", "สาย (ครั้ง)", "สายรวม", "เฉลี่ย/ครั้ง", "% ของวันทำงาน", ...shownMonths.map((i) => MONTHS_TH[i])].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-3 font-bold text-on-surface-variant">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {rows.length === 0 && <EmptyRow cols={6 + monthsShown} />}
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="px-3 py-3 font-bold text-on-surface-variant">{i + 1}</td>
                <td className="px-3 py-3 font-semibold">
                  <Link href={`/attendance/${r.id}`} className="hover:text-primary hover:underline">
                    {r.nickname ? `${r.nickname} · ` : ""}
                    {r.name}
                  </Link>
                  <div className="text-xs font-normal text-on-surface-variant">
                    {r.code} · {r.dept}
                  </div>
                </td>
                <td className="px-3 py-3 font-bold text-error">{r.lateDays}</td>
                <td className="whitespace-nowrap px-3 py-3">{hm(r.minutes)}</td>
                <td className="whitespace-nowrap px-3 py-3">{Math.round(r.minutes / r.lateDays)} นาที</td>
                <td className="px-3 py-3">{r.workedDays ? `${Math.round((r.lateDays / r.workedDays) * 100)}%` : "-"}</td>
                {shownMonths.map((m) => (
                  <td key={m} className={`px-3 py-3 text-center ${r.perMonth[m] >= 5 ? "bg-error/10 font-bold text-error" : r.perMonth[m] > 0 ? "" : "text-on-surface-variant/40"}`}>
                    {r.perMonth[m] || "·"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </TableShell>
      </>
    );
  } else if (tab === "leave") {
    subtitle = "วันลาที่ใช้ไปและที่เหลือ";
    const MAIN = [
      { code: "SICK", label: "ลาป่วย" },
      { code: "PERSONAL", label: "ลากิจ" },
      { code: "VACATION", label: "ลาพักร้อน" },
    ];
    const OTHER = ["UNPAID", "MARRIAGE", "MATERNITY", "CHILDCARE"];

    const rows = emps.map((e) => {
      const cells = MAIN.map((m) => {
        const ent = balanceOf(e.id, m.code);
        const used = usedOf(e.id, m.code, "approved");
        const pending = usedOf(e.id, m.code, "pending");
        return { ...m, ent, used, pending, left: ent == null ? null : round2(ent - used) };
      });
      const others = OTHER.map((c) => ({ name: typeById.get(typeIdByCode.get(c) ?? "")?.name ?? c, used: usedOf(e.id, c, "approved") })).filter((o) => o.used > 0);
      return { ...e, cells, others };
    });

    csvRows = [
      ["รหัส", "ชื่อ", "แผนก", ...MAIN.flatMap((m) => [`${m.label} สิทธิ์`, `${m.label} ใช้`, `${m.label} เหลือ`, `${m.label} รออนุมัติ`]), "ลาอื่นๆ ที่ใช้"],
      ...rows.map((r) => [r.code, r.name, r.dept, ...r.cells.flatMap((c) => [c.ent == null ? "ไม่มีสิทธิ์" : String(c.ent), String(c.used), c.left == null ? "-" : String(c.left), String(c.pending)]), r.others.map((o) => `${o.name} ${o.used}`).join(" ; ") || "-"]),
    ];

    content = (
      <>
        <p className="text-xs text-on-surface-variant">
          “ใช้” นับจากใบลาที่อนุมัติแล้วของปี {year + 543} · “เหลือ” = สิทธิ์ (รวมยกมา) − ใช้ · ใบลาที่รออนุมัติแสดงแยกและยังไม่หักจากที่เหลือ · “ไม่มีสิทธิ์” = ยังไม่มีสิทธิ์ลาประเภทนี้ในระบบ (เช่น พักร้อนที่ยังทำงานไม่ครบกำหนด)
        </p>
        <TableShell minWidth={900}>
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container">
              <th className="px-3 py-3 font-bold text-on-surface-variant">พนักงาน</th>
              {MAIN.map((m) => (
                <th key={m.code} className="px-3 py-3 font-bold text-on-surface-variant">
                  {m.label} <span className="font-normal">(ใช้ / สิทธิ์ → เหลือ)</span>
                </th>
              ))}
              <th className="px-3 py-3 font-bold text-on-surface-variant">ลาอื่นๆ ที่ใช้</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {rows.length === 0 && <EmptyRow cols={5} />}
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-3 font-semibold">
                  <Link href={`/employees/${r.id}`} className="hover:text-primary hover:underline">
                    {r.nickname ? `${r.nickname} · ` : ""}
                    {r.name}
                  </Link>
                  <div className="text-xs font-normal text-on-surface-variant">
                    {r.code} · {r.dept}
                  </div>
                </td>
                {r.cells.map((c) => (
                  <td key={c.code} className="px-3 py-3">
                    {c.ent == null ? (
                      <span className="text-on-surface-variant">ไม่มีสิทธิ์{c.used > 0 ? ` · ใช้ ${c.used}` : ""}</span>
                    ) : (
                      <>
                        <div>
                          <span className="font-bold">{c.used}</span> / {round2(c.ent)} →{" "}
                          <span className={`font-bold ${c.left! <= 0 ? "text-error" : c.left! <= c.ent * 0.2 ? "text-amber-600" : "text-green-700"}`}>เหลือ {c.left}</span>
                        </div>
                        {c.pending > 0 && <div className="text-xs text-on-surface-variant">รออนุมัติ {c.pending} วัน</div>}
                      </>
                    )}
                  </td>
                ))}
                <td className="px-3 py-3 text-xs text-on-surface-variant">{r.others.length ? r.others.map((o) => `${o.name} ${o.used} วัน`).join(" · ") : "-"}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </>
    );
  } else {
    subtitle = "ลาป่วย ขาดงาน และข้อมูลการหยุดต่างๆ";
    const sickId = typeIdByCode.get("SICK");
    const monthSick = Array<number>(12).fill(0);
    const monthSickCount = Array<number>(12).fill(0);
    for (const l of leaves) {
      if (l.status === "approved" && l.leave_type_id === sickId) {
        monthSick[Number(l.start_date.slice(5, 7)) - 1] += Number(l.total_days);
        monthSickCount[Number(l.start_date.slice(5, 7)) - 1]++;
      }
    }

    const rows = emps.map((e) => {
      const mine = leaves.filter((l) => l.employee_id === e.id && l.status === "approved");
      const sum = (codes: string[]) => round2(mine.filter((l) => codes.includes(typeById.get(l.leave_type_id)?.code ?? "")).reduce((s, l) => s + Number(l.total_days), 0));
      const sickReqs = mine.filter((l) => l.leave_type_id === sickId);
      const att = attendance.filter((a) => a.employee_id === e.id);
      return {
        ...e,
        sickDays: sum(["SICK"]),
        sickReqs,
        personal: sum(["PERSONAL"]),
        vacation: sum(["VACATION"]),
        unpaid: sum(["UNPAID"]),
        other: sum(["MARRIAGE", "MATERNITY", "CHILDCARE"]),
        offsite: round2(mine.filter((l) => ["WFH", "OFFSITE"].includes(typeById.get(l.leave_type_id)?.code ?? "")).reduce((s, l) => s + Number(l.total_days), 0)),
        absent: att.filter((a) => a.status === "absent").length,
        earlyLeave: att.filter((a) => a.status === "early_leave").length,
      };
    });
    rows.sort((a, b) => b.sickDays - a.sickDays || b.absent - a.absent);
    const tot = (f: (r: (typeof rows)[number]) => number) => round2(rows.reduce((s, r) => s + f(r), 0));

    csvRows = [
      ["รหัส", "ชื่อ", "แผนก", "ลาป่วย (ครั้ง)", "ลาป่วย (วัน)", "ลากิจ (วัน)", "ลาพักร้อน (วัน)", "ลาไม่รับค่าจ้าง (วัน)", "ลาอื่นๆ (วัน)", "WFH/นอกสถานที่ (วัน)", "ขาดงาน (วัน)", "ออกก่อนเวลา (ครั้ง)", "วันที่ลาป่วย"],
      ...rows.map((r) => [r.code, r.name, r.dept, String(r.sickReqs.length), String(r.sickDays), String(r.personal), String(r.vacation), String(r.unpaid), String(r.other), String(r.offsite), String(r.absent), String(r.earlyLeave), r.sickReqs.map(leaveLabel).join(" ; ") || "-"]),
    ];

    const monthsShown = year === Number(todayBkk.slice(0, 4)) ? Number(todayBkk.slice(5, 7)) : 12;
    content = (
      <>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="ลาป่วยรวม" value={`${tot((r) => r.sickDays)} วัน`} sub={`${rows.reduce((s, r) => s + r.sickReqs.length, 0)} ครั้ง`} />
          <Stat label="ลากิจรวม" value={`${tot((r) => r.personal)} วัน`} />
          <Stat label="ลาพักร้อนรวม" value={`${tot((r) => r.vacation)} วัน`} />
          <Stat label="ขาดงานรวม" value={`${rows.reduce((s, r) => s + r.absent, 0)} วัน`} />
        </div>

        <div className="rounded-xl border border-outline-variant bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-bold text-on-surface">ลาป่วยทั้งบริษัทรายเดือน (วัน)</p>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
            {Array.from({ length: monthsShown }, (_, i) => (
              <div key={i} className="rounded-lg bg-surface-container-low px-2 py-2 text-center">
                <div className="text-xs text-on-surface-variant">{MONTHS_TH[i]}</div>
                <div className="text-base font-bold text-on-surface">{round2(monthSick[i])}</div>
                <div className="text-[11px] text-on-surface-variant">{monthSickCount[i]} ครั้ง</div>
              </div>
            ))}
          </div>
        </div>

        <TableShell minWidth={1000}>
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container">
              {["พนักงาน", "ลาป่วย", "ลากิจ", "ลาพักร้อน", "ไม่รับค่าจ้าง", "ลาอื่นๆ", "WFH / นอกสถานที่", "ขาดงาน", "ออกก่อนเวลา"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-3 font-bold text-on-surface-variant">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {rows.length === 0 && <EmptyRow cols={9} />}
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-3 font-semibold">
                  <Link href={`/attendance/${r.id}`} className="hover:text-primary hover:underline">
                    {r.nickname ? `${r.nickname} · ` : ""}
                    {r.name}
                  </Link>
                  <div className="text-xs font-normal text-on-surface-variant">
                    {r.code} · {r.dept}
                  </div>
                </td>
                <td className="px-3 py-3">
                  {r.sickDays > 0 ? (
                    <details>
                      <summary className="cursor-pointer font-bold text-on-surface">
                        {r.sickDays} วัน <span className="font-normal text-on-surface-variant">({r.sickReqs.length} ครั้ง)</span>
                      </summary>
                      <ul className="mt-1 space-y-0.5 text-xs text-on-surface-variant">
                        {r.sickReqs.map((l, i) => (
                          <li key={i}>{leaveLabel(l)}</li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-3 py-3">{r.personal > 0 ? `${r.personal} วัน` : "-"}</td>
                <td className="px-3 py-3">{r.vacation > 0 ? `${r.vacation} วัน` : "-"}</td>
                <td className="px-3 py-3">{r.unpaid > 0 ? `${r.unpaid} วัน` : "-"}</td>
                <td className="px-3 py-3">{r.other > 0 ? `${r.other} วัน` : "-"}</td>
                <td className="px-3 py-3">{r.offsite > 0 ? `${r.offsite} วัน` : "-"}</td>
                <td className={`px-3 py-3 ${r.absent > 0 ? "font-bold text-error" : ""}`}>{r.absent > 0 ? `${r.absent} วัน` : "-"}</td>
                <td className="px-3 py-3">{r.earlyLeave > 0 ? `${r.earlyLeave} ครั้ง` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
        <p className="text-xs text-on-surface-variant">ลา = ใบลาที่อนุมัติแล้ว (ลาครึ่งวัน/รายชั่วโมงนับเป็นเศษวัน) · ขาดงาน = วันที่ระบบบันทึกว่าขาดงาน · ออกก่อนเวลา = วันที่ลงเวลาออกก่อนเวลากะ</p>
      </>
    );
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "late", label: "มาสายทั้งปี", icon: "alarm" },
    { key: "leave", label: "วันลา ใช้ไป/เหลือ", icon: "event_available" },
    { key: "sick", label: "ลาป่วย / ขาดงาน", icon: "sick" },
  ];

  return (
    <>
      <Topbar title="รายงานสรุป" subtitle={subtitle} />
      <div className="space-y-4 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={tabLink(t.key)}
                className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold ${tab === t.key ? "border-primary bg-primary text-white" : "border-outline-variant hover:bg-surface-variant/20"}`}
              >
                <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
                {t.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Link href={yearLink(year - 1)} className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-semibold hover:bg-surface-variant/20">
              ←
            </Link>
            <span className="min-w-[90px] text-center text-sm font-bold text-on-surface">ปี {year + 543}</span>
            <Link href={yearLink(year + 1)} className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-semibold hover:bg-surface-variant/20">
              →
            </Link>
            <ExportCsvButton rows={csvRows} filename={`report-${tab}-${year}.csv`} />
          </div>
        </div>
        {content}
      </div>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-white p-4 shadow-sm">
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p className="mt-1 text-xl font-bold text-on-surface">{value}</p>
      {sub && <p className="text-xs text-on-surface-variant">{sub}</p>}
    </div>
  );
}

function TableShell({ minWidth, children }: { minWidth: number; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-10 text-center text-on-surface-variant">
        ไม่มีข้อมูล
      </td>
    </tr>
  );
}
