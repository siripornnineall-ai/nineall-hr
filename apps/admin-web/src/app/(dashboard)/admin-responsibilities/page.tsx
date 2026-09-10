import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { signAvatarUrls } from "@/lib/avatars";
import { ResponsibilityBoard } from "./ResponsibilityBoard";
import type { ChannelOption, EmployeeOption, ProfileData } from "./types";

export default async function AdminResponsibilitiesPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: channels }, { data: profiles }, { data: employees }] = await Promise.all([
    supabase.from("admin_responsibility_channels").select("id, name, sort_order").eq("org_id", user.orgId).order("sort_order"),
    supabase
      .from("admin_responsibility_profiles")
      .select(
        "id, employee_id, shift_label, duties, sort_order, employees(first_name, last_name, photo_url, job_positions(title)), admin_responsibility_schedules(id, channel_id, work_days, start_time, end_time)"
      )
      .eq("org_id", user.orgId)
      .order("sort_order"),
    supabase
      .from("employees")
      .select("id, employee_code, first_name, last_name")
      .eq("org_id", user.orgId)
      .is("deleted_at", null)
      .in("employment_status", ["active", "probation"])
      .order("first_name"),
  ]);

  const photoPaths = (profiles ?? []).map(
    (p) => (p.employees as unknown as { photo_url: string | null } | null)?.photo_url ?? null
  );
  const signedByPath = await signAvatarUrls(supabase, photoPaths);

  const channelOptions: ChannelOption[] = (channels ?? []).map((c) => ({ id: c.id, name: c.name }));
  const employeeOptions: EmployeeOption[] = (employees ?? []).map((e) => ({
    id: e.id,
    code: e.employee_code,
    name: `${e.first_name} ${e.last_name}`,
  }));

  const profileData: ProfileData[] = (profiles ?? []).map((p) => {
    const emp = p.employees as unknown as {
      first_name: string;
      last_name: string;
      photo_url: string | null;
      job_positions: { title: string } | null;
    } | null;
    return {
      id: p.id,
      employeeId: p.employee_id,
      employeeName: emp ? `${emp.first_name} ${emp.last_name}` : "-",
      jobTitle: emp?.job_positions?.title ?? null,
      photoUrl: emp?.photo_url ? (signedByPath.get(emp.photo_url) ?? null) : null,
      shiftLabel: p.shift_label,
      duties: p.duties ?? [],
      schedules: (p.admin_responsibility_schedules as unknown as {
        id: string;
        channel_id: string;
        work_days: string;
        start_time: string;
        end_time: string;
      }[]) ?? [],
    };
  });

  return (
    <>
      <Topbar title="ความรับผิดชอบแอดมิน" subtitle="ใครดูร้านไหน วันไหน เวลาไหน ทำหน้าที่อะไร" />
      <div className="space-y-4 p-4 md:p-8">
        <ResponsibilityBoard
          profiles={profileData}
          channels={channelOptions}
          employees={employeeOptions}
          canManage={["super_admin", "hr"].includes(user.role)}
        />
      </div>
    </>
  );
}
