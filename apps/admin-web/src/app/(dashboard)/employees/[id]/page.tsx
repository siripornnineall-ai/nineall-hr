import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { OffboardButton } from "./OffboardButton";
import { LeaveBalances } from "./LeaveBalances";
import { ShiftAssignment } from "./ShiftAssignment";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  // `teams` must be disambiguated: employees.team_id -> teams.id ("my team") and
  // teams.manager_employee_id -> employees.id ("teams I manage") are both valid FK paths
  // between these two tables, so a bare `teams(name)` embed is ambiguous to PostgREST and
  // errors out — which this page was silently swallowing as "employee not found" (404).
  const { data: employee } = await supabase
    .from("employees")
    .select(
      "id, employee_code, first_name, last_name, nickname, title_prefix, gender, gender_identity, bio, phone, personal_email, hire_date, probation_end_date, employment_type, employment_status, photo_url, national_id, id_card_address, current_address, departments(name), job_positions(title), teams!employees_team_id_fkey(name)"
    )
    .eq("org_id", user.orgId)
    .eq("id", id)
    .maybeSingle();

  if (!employee) notFound();

  // photo_url is a private-bucket storage path, not a fetchable URL.
  let photoUrl: string | null = null;
  if (employee.photo_url) {
    const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(employee.photo_url, 3600);
    photoUrl = signed?.signedUrl ?? null;
  }

  const canSeeSalary = ["super_admin", "hr"].includes(user.role) || user.employeeId === employee.id;
  let compensation: { base_amount: number; effective_date: string } | null = null;
  let bankAccount: { bank_name: string; account_name: string; account_number: string } | null = null;
  if (canSeeSalary) {
    const [{ data: comp }, { data: bank }] = await Promise.all([
      supabase
        .from("employee_compensation")
        .select("base_amount, effective_date")
        .eq("employee_id", employee.id)
        .order("effective_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("bank_accounts")
        .select("bank_name, account_name, account_number")
        .eq("employee_id", employee.id)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    compensation = comp;
    bankAccount = bank;
  }

  const department = (employee.departments as unknown as { name: string } | null)?.name;
  const position = (employee.job_positions as unknown as { title: string } | null)?.title;
  const team = (employee.teams as unknown as { name: string } | null)?.name;

  const canManage = ["super_admin", "hr"].includes(user.role);
  let leaveTypes: { id: string; name_th: string }[] = [];
  let leaveBalances: { id: string; leave_type_id: string; year: number; entitled_days: number; carried_over_days: number; used_days: number; pending_days: number }[] = [];
  let shifts: { id: string; name: string; start_time: string; end_time: string }[] = [];
  let workLocations: { id: string; name: string }[] = [];
  let currentShiftAssignment: { work_date: string; shift_name: string | null } | null = null;
  if (canManage) {
    const [{ data: types }, { data: balances }, { data: shiftRows }, { data: locationRows }, { data: assignment }] = await Promise.all([
      supabase.from("leave_types").select("id, name_th").eq("org_id", user.orgId).eq("is_active", true).order("sort_order"),
      supabase
        .from("leave_balances")
        .select("id, leave_type_id, year, entitled_days, carried_over_days, used_days, pending_days")
        .eq("employee_id", employee.id)
        .order("year", { ascending: false }),
      supabase.from("work_shifts").select("id, name, start_time, end_time").eq("org_id", user.orgId),
      supabase.from("work_locations").select("id, name").eq("org_id", user.orgId),
      supabase
        .from("shift_assignments")
        .select("work_date, work_shifts(name)")
        .eq("employee_id", employee.id)
        .eq("work_date", new Date().toISOString().slice(0, 10))
        .maybeSingle(),
    ]);
    leaveTypes = types ?? [];
    leaveBalances = balances ?? [];
    shifts = shiftRows ?? [];
    workLocations = locationRows ?? [];
    currentShiftAssignment = assignment
      ? { work_date: assignment.work_date, shift_name: (assignment.work_shifts as unknown as { name: string } | null)?.name ?? null }
      : null;
  }

  return (
    <>
      <Topbar title={`${employee.first_name} ${employee.last_name}`} subtitle={employee.employee_code} />
      <div className="grid grid-cols-1 gap-6 p-4 md:grid-cols-3 md:p-8">
        <div className="rounded-xl border border-outline-variant bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-surface-container">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-[44px] text-on-surface-variant">person</span>
            )}
          </div>
          <h3 className="text-lg font-bold">
            {employee.first_name} {employee.last_name}
          </h3>
          {employee.nickname && <p className="text-sm text-on-surface-variant">({employee.nickname})</p>}
          <p className="mt-1 text-sm text-on-surface-variant">{position ?? "-"}</p>
          {employee.bio && <p className="mt-3 text-left text-sm leading-relaxed text-on-surface-variant">{employee.bio}</p>}
          <div className="mt-3">
            <Badge tone={employee.employment_status === "active" ? "success" : "neutral"}>{employee.employment_status}</Badge>
          </div>
          {["super_admin", "hr"].includes(user.role) && (
            <>
              <Link
                href={`/employees/${employee.id}/edit`}
                className="mt-3 block w-full rounded-lg border border-primary px-4 py-2 text-center text-sm font-bold text-primary hover:bg-primary/5"
              >
                แก้ไขข้อมูล
              </Link>
              <OffboardButton employeeId={employee.id} currentStatus={employee.employment_status} />
            </>
          )}
        </div>

        <div className="space-y-4 rounded-xl border border-outline-variant bg-white p-6 shadow-sm md:col-span-2">
          <h4 className="font-bold">ข้อมูลการทำงาน</h4>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Info label="แผนก" value={department ?? "-"} />
            <Info label="ทีม" value={team ?? "-"} />
            <Info label="ประเภทการจ้าง" value={employee.employment_type} />
            <Info label="วันที่เริ่มงาน" value={new Date(employee.hire_date).toLocaleDateString("th-TH")} />
            <Info
              label="วันที่ผ่านทดลองงาน"
              value={employee.probation_end_date ? new Date(employee.probation_end_date).toLocaleDateString("th-TH") : "-"}
            />
            <Info label="คำนำหน้า/เพศ/เพศสภาพ" value={[employee.title_prefix, employee.gender, employee.gender_identity].filter(Boolean).join(" / ") || "-"} />
            <Info label="เบอร์โทร" value={employee.phone ?? "-"} />
            <Info label="อีเมล" value={employee.personal_email ?? "-"} />
            {canSeeSalary && (
              <Info
                label="เงินเดือน/อัตราค่าจ้าง"
                value={compensation ? `${compensation.base_amount.toLocaleString("th-TH")} บาท` : "-"}
              />
            )}
            {canSeeSalary && <Info label="เลขบัตรประชาชน" value={employee.national_id ?? "-"} />}
          </dl>
          {canSeeSalary && (employee.id_card_address || employee.current_address) && (
            <dl className="grid grid-cols-1 gap-4 border-t border-outline-variant pt-4 text-sm md:grid-cols-2">
              <Info label="ที่อยู่ตามบัตรประชาชน" value={formatAddress(employee.id_card_address as AddressValue | null)} />
              <Info label="ที่อยู่ปัจจุบัน" value={formatAddress(employee.current_address as AddressValue | null)} />
            </dl>
          )}
          {canSeeSalary && bankAccount && (
            <dl className="grid grid-cols-2 gap-4 border-t border-outline-variant pt-4 text-sm md:grid-cols-3">
              <Info label="ธนาคาร" value={bankAccount.bank_name} />
              <Info label="ชื่อบัญชี" value={bankAccount.account_name} />
              <Info label="เลขที่บัญชี" value={bankAccount.account_number} />
            </dl>
          )}
        </div>

        {canManage && (
          <div className="md:col-span-3">
            <ShiftAssignment employeeId={employee.id} shifts={shifts} workLocations={workLocations} currentAssignment={currentShiftAssignment} />
          </div>
        )}

        {canManage && (
          <div className="md:col-span-3">
            <LeaveBalances employeeId={employee.id} leaveTypes={leaveTypes} balances={leaveBalances} />
          </div>
        )}
      </div>
    </>
  );
}

interface AddressValue {
  houseNo?: string;
  moo?: string;
  soi?: string;
  yaek?: string;
  road?: string;
  subDistrict?: string;
  district?: string;
  province?: string;
  postalCode?: string;
}

function formatAddress(address: AddressValue | null): string {
  if (!address) return "-";
  const parts = [
    address.houseNo,
    address.moo ? `หมู่ ${address.moo}` : null,
    address.soi ? `ซอย${address.soi}` : null,
    address.yaek ? `แยก${address.yaek}` : null,
    address.road ? `ถนน${address.road}` : null,
    address.subDistrict ? `ตำบล/แขวง${address.subDistrict}` : null,
    address.district ? `อำเภอ/เขต${address.district}` : null,
    address.province,
    address.postalCode,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "-";
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-on-surface-variant">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
