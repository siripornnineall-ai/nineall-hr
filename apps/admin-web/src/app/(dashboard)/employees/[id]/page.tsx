import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { OffboardButton } from "./OffboardButton";
import { DeleteEmployeeButton } from "./DeleteEmployeeButton";
import { CreateLoginAccountButton } from "./CreateLoginAccountButton";
import { EmployeeDetailTabs } from "./EmployeeDetailTabs";

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
      "id, employee_code, first_name, last_name, first_name_en, last_name_en, nickname, title_prefix, gender, gender_identity, bio, phone, personal_email, hire_date, probation_end_date, employment_type, employment_status, photo_url, national_id, id_card_address, current_address, department_id, job_position_id, departments(name), job_positions(title), teams!employees_team_id_fkey(name)"
    )
    .eq("org_id", user.orgId)
    .eq("id", id)
    .maybeSingle();

  if (!employee) notFound();

  const { data: existingProfile } = await supabase.from("profiles").select("id").eq("employee_id", employee.id).maybeSingle();
  const hasLoginAccount = !!existingProfile;

  // photo_url is a private-bucket storage path, not a fetchable URL.
  let photoUrl: string | null = null;
  if (employee.photo_url) {
    const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(employee.photo_url, 3600);
    photoUrl = signed?.signedUrl ?? null;
  }

  const canSeeSalary = ["super_admin", "hr"].includes(user.role) || user.employeeId === employee.id;
  let compensation: {
    baseAmount: number;
    workDaysPerMonth: number;
    workHoursPerDay: number;
    paymentSchedule: string;
    companyCoversSsf: boolean;
    companyCoversTax: boolean;
  } | null = null;
  let bankAccount: { bank_name: string; account_name: string; account_number: string } | null = null;
  if (canSeeSalary) {
    const [{ data: comp }, { data: bank }] = await Promise.all([
      supabase
        .from("employee_compensation")
        .select("base_amount, work_days_per_month, work_hours_per_day, payment_schedule, company_covers_ssf, company_covers_tax")
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
    compensation = comp
      ? {
          baseAmount: Number(comp.base_amount),
          workDaysPerMonth: Number(comp.work_days_per_month),
          workHoursPerDay: Number(comp.work_hours_per_day),
          paymentSchedule: comp.payment_schedule,
          companyCoversSsf: comp.company_covers_ssf,
          companyCoversTax: comp.company_covers_tax,
        }
      : null;
    bankAccount = bank;
  }

  const department = (employee.departments as unknown as { name: string } | null)?.name ?? null;
  const position = (employee.job_positions as unknown as { title: string } | null)?.title ?? null;
  const team = (employee.teams as unknown as { name: string } | null)?.name ?? null;

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

  const [{ data: trainingRows }, { data: documentRows }, { data: historyRows }] = await Promise.all([
    supabase.from("training_records").select("id, title, provider, training_date, hours").eq("employee_id", employee.id).order("training_date", { ascending: false }),
    supabase.from("employee_documents").select("id, document_type, file_path, file_name, created_at").eq("employee_id", employee.id).order("created_at", { ascending: false }),
    supabase
      .from("employment_records")
      .select("id, effective_date, employment_type, reason, departments(name), job_positions(title)")
      .eq("employee_id", employee.id)
      .order("effective_date", { ascending: false }),
  ]);

  const trainingRecords = (trainingRows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    provider: r.provider,
    trainingDate: r.training_date,
    hours: r.hours != null ? Number(r.hours) : null,
  }));

  const documents = await Promise.all(
    (documentRows ?? []).map(async (d) => {
      let url: string | null = null;
      if (d.file_path) {
        const { data: signed } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
        url = signed?.signedUrl ?? null;
      }
      return { id: d.id, documentType: d.document_type, fileName: d.file_name ?? "-", url, createdAt: d.created_at };
    })
  );

  const employmentHistory = (historyRows ?? []).map((r) => ({
    id: r.id,
    effectiveDate: r.effective_date,
    department: (r.departments as unknown as { name: string } | null)?.name ?? null,
    position: (r.job_positions as unknown as { title: string } | null)?.title ?? null,
    employmentType: r.employment_type,
    reason: r.reason,
  }));

  return (
    <>
      <Topbar title={`${employee.first_name} ${employee.last_name}`} subtitle={employee.employee_code} backHref="/employees" />
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
            {employee.title_prefix ?? ""} {employee.first_name} {employee.last_name}
          </h3>
          {employee.first_name_en && (
            <p className="text-xs text-on-surface-variant">
              {employee.first_name_en} {employee.last_name_en}
            </p>
          )}
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
              {!hasLoginAccount && (
                <CreateLoginAccountButton
                  employeeId={employee.id}
                  fullName={`${employee.first_name} ${employee.last_name}`}
                  defaultEmail={employee.personal_email}
                />
              )}
              <OffboardButton employeeId={employee.id} currentStatus={employee.employment_status} />
              <DeleteEmployeeButton employeeId={employee.id} />
            </>
          )}
        </div>

        <EmployeeDetailTabs
          employee={{
            id: employee.id,
            employeeCode: employee.employee_code,
            firstName: employee.first_name,
            lastName: employee.last_name,
            firstNameEn: employee.first_name_en,
            lastNameEn: employee.last_name_en,
            nickname: employee.nickname,
            titlePrefix: employee.title_prefix,
            gender: employee.gender,
            genderIdentity: employee.gender_identity,
            phone: employee.phone,
            personalEmail: employee.personal_email,
            nationalId: employee.national_id,
            idCardAddress: formatAddress(employee.id_card_address as AddressValue | null),
            currentAddress: formatAddress(employee.current_address as AddressValue | null),
            hireDate: employee.hire_date,
            probationEndDate: employee.probation_end_date,
            employmentType: employee.employment_type,
            employmentStatus: employee.employment_status,
            department,
            position,
            team,
          }}
          bankAccount={bankAccount}
          canSeeSalary={canSeeSalary}
          canManage={canManage}
          compensation={compensation}
          leaveTypes={leaveTypes}
          leaveBalances={leaveBalances}
          trainingRecords={trainingRecords}
          shifts={shifts}
          workLocations={workLocations}
          currentShiftAssignment={currentShiftAssignment}
          documents={documents}
          employmentHistory={employmentHistory}
        />
      </div>
    </>
  );
}
