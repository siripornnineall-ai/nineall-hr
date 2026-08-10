import { createClient } from "@/lib/supabase/server";

export interface EmployeeListFilters {
  search?: string;
  departmentId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface EmployeeListRow {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  positionTitle: string | null;
  departmentName: string | null;
  employmentType: string;
  employmentStatus: string;
  hireDate: string;
}

export async function listEmployees(orgId: string, filters: EmployeeListFilters) {
  const supabase = await createClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("employees")
    .select(
      "id, employee_code, first_name, last_name, photo_url, employment_type, employment_status, hire_date, job_positions(title), departments(name)",
      { count: "exact" }
    )
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("employee_code", { ascending: true })
    .range(from, to);

  if (filters.search) {
    query = query.or(
      `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,employee_code.ilike.%${filters.search}%`
    );
  }
  if (filters.departmentId) query = query.eq("department_id", filters.departmentId);
  if (filters.status) query = query.eq("employment_status", filters.status);

  const { data, count, error } = await query;
  if (error) throw error;

  const rows: EmployeeListRow[] = (data ?? []).map((e) => ({
    id: e.id,
    employeeCode: e.employee_code,
    firstName: e.first_name,
    lastName: e.last_name,
    photoUrl: e.photo_url,
    positionTitle: (e.job_positions as unknown as { title: string } | null)?.title ?? null,
    departmentName: (e.departments as unknown as { name: string } | null)?.name ?? null,
    employmentType: e.employment_type,
    employmentStatus: e.employment_status,
    hireDate: e.hire_date,
  }));

  return { rows, total: count ?? 0, page, pageSize };
}

export async function getEmployeeSummary(orgId: string) {
  const supabase = await createClient();
  const [totalRes, activeRes, newThisYearRes] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("employment_status", "active"),
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("hire_date", `${new Date().getFullYear()}-01-01`),
  ]);
  return {
    total: totalRes.count ?? 0,
    active: activeRes.count ?? 0,
    newThisYear: newThisYearRes.count ?? 0,
  };
}

export async function listDepartments(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("departments").select("id, name").eq("org_id", orgId).is("deleted_at", null).order("name");
  return data ?? [];
}

export async function listTeams(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("teams").select("id, name, department_id").eq("org_id", orgId).is("deleted_at", null).order("name");
  return data ?? [];
}

export async function listJobPositions(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("job_positions").select("id, title, department_id").eq("org_id", orgId).is("deleted_at", null).order("title");
  return data ?? [];
}

export async function listManagerCandidates(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("org_id", orgId)
    .eq("employment_status", "active")
    .order("first_name");
  return data ?? [];
}
