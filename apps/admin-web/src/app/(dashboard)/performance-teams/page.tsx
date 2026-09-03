import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { TeamCard } from "./TeamCard";

export default async function PerformanceTeamsPage() {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const [{ data: teams }, { data: members }, { data: employees }] = await Promise.all([
    supabase.from("output_teams").select("id, slug, name, shift_end_time, notify_enabled").eq("org_id", user.orgId).order("name"),
    supabase
      .from("output_team_members")
      .select("id, output_team_id, employee_id, is_lead, managed_pages, employees(first_name, last_name, employee_code)")
      .order("is_lead", { ascending: false }),
    supabase
      .from("employees")
      .select("id, first_name, last_name, employee_code")
      .eq("org_id", user.orgId)
      .is("deleted_at", null)
      .eq("employment_status", "active")
      .order("first_name"),
  ]);

  return (
    <>
      <Topbar title="ทีมผลงานประจำเดือน" subtitle="จัดการสมาชิกแต่ละทีมสำหรับหน้าผลงานประจำเดือนของแอปพนักงาน" backHref="/dashboard" />
      <div className="space-y-6 p-4 md:p-8">
        {(teams ?? []).map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            members={(members ?? [])
              .filter((m) => m.output_team_id === team.id)
              .map((m) => {
                const emp = m.employees as unknown as { first_name: string; last_name: string; employee_code: string } | null;
                return {
                  id: m.id,
                  employeeId: m.employee_id,
                  isLead: m.is_lead,
                  managedPages: m.managed_pages ?? [],
                  name: emp ? `${emp.first_name} ${emp.last_name}` : "-",
                  employeeCode: emp?.employee_code ?? "-",
                };
              })}
            employees={(employees ?? []).map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name} (${e.employee_code})` }))}
          />
        ))}
      </div>
    </>
  );
}
