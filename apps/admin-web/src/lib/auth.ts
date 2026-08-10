import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@nineall-hr/shared-types";

export interface CurrentUser {
  authUserId: string;
  profileId: string;
  orgId: string;
  employeeId: string;
  role: UserRole;
  fullName: string;
  email: string | null;
}

/** Admin-web is for Super Admin / HR / Manager only — employees use the mobile app. */
const ADMIN_WEB_ROLES: UserRole[] = ["super_admin", "hr", "manager"];

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, employee_id, role, full_name, email")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    authUserId: user.id,
    profileId: profile.id,
    orgId: profile.org_id,
    employeeId: profile.employee_id,
    role: profile.role,
    fullName: profile.full_name,
    email: profile.email,
  };
}

/** Call at the top of every protected server component / layout. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ADMIN_WEB_ROLES.includes(user.role)) redirect("/login?error=employee_use_mobile_app");
  return user;
}

export function requireRole(user: CurrentUser, roles: UserRole[]) {
  if (!roles.includes(user.role)) {
    throw new Error("FORBIDDEN");
  }
}
