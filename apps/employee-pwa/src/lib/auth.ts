import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@nineall-hr/shared-types";

export interface CurrentEmployee {
  authUserId: string;
  profileId: string;
  orgId: string;
  employeeId: string;
  role: UserRole;
  fullName: string;
  employeeCode: string;
  photoUrl: string | null;
  jobTitle: string | null;
  mustChangePassword: boolean;
}

export async function getCurrentEmployee(): Promise<CurrentEmployee | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, employee_id, role, full_name, must_change_password, employees(employee_code, photo_url, job_positions(title))")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const employee = profile.employees as unknown as { employee_code: string; photo_url: string | null; job_positions: { title: string } | null } | null;

  return {
    authUserId: user.id,
    profileId: profile.id,
    orgId: profile.org_id,
    employeeId: profile.employee_id,
    role: profile.role,
    fullName: profile.full_name,
    employeeCode: employee?.employee_code ?? "",
    photoUrl: employee?.photo_url ?? null,
    jobTitle: employee?.job_positions?.title ?? null,
    mustChangePassword: profile.must_change_password,
  };
}

/**
 * This app is for the `employee` role only. Managers/HR/Admin should use admin-web —
 * they're redirected there rather than silently shown an empty employee view.
 */
export async function requireEmployee(): Promise<CurrentEmployee> {
  const user = await getCurrentEmployee();
  if (!user) redirect("/login");
  if (user.role !== "employee") redirect("/login?error=use_admin_web");
  return user;
}
