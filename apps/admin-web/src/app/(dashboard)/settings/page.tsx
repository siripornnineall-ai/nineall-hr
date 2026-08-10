import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { NewLeaveTypeForm } from "./NewLeaveTypeForm";

export default async function SettingsPage() {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const [{ data: org }, { data: leaveTypes }, { data: shifts }, { data: locations }] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", user.orgId).single(),
    supabase.from("leave_types").select("id, code, name_th, is_paid, is_active").eq("org_id", user.orgId).order("sort_order"),
    supabase.from("work_shifts").select("id, name, start_time, end_time, grace_minutes_late").eq("org_id", user.orgId),
    supabase.from("work_locations").select("id, name, radius_meters").eq("org_id", user.orgId),
  ]);

  return (
    <>
      <Topbar title="Settings" subtitle="ตั้งค่าระบบ" />
      <div className="space-y-6 p-4 md:p-8">
        <section className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold">ข้อมูลบริษัท</h3>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-on-surface-variant">ชื่อบริษัท</dt>
              <dd className="font-semibold">{org?.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-on-surface-variant">เขตเวลา</dt>
              <dd className="font-semibold">{org?.timezone}</dd>
            </div>
          </dl>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-bold">ประเภทการลา</h3>
            <ul className="divide-y divide-outline-variant text-sm">
              {(leaveTypes ?? []).map((lt) => (
                <li key={lt.id} className="flex items-center justify-between py-2">
                  <span>{lt.name_th}</span>
                  <span className="text-xs text-on-surface-variant">{lt.is_paid ? "ได้รับค่าจ้าง" : "ไม่รับค่าจ้าง"}</span>
                </li>
              ))}
              {(leaveTypes ?? []).length === 0 && <p className="text-on-surface-variant">ยังไม่มีประเภทการลา</p>}
            </ul>
          </section>
          <NewLeaveTypeForm />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-bold">กะการทำงาน</h3>
            <ul className="divide-y divide-outline-variant text-sm">
              {(shifts ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <span>{s.name}</span>
                  <span className="text-xs text-on-surface-variant">
                    {s.start_time} - {s.end_time} (ผ่อนผัน {s.grace_minutes_late} นาที)
                  </span>
                </li>
              ))}
              {(shifts ?? []).length === 0 && <p className="text-on-surface-variant">ยังไม่มีการตั้งค่ากะ</p>}
            </ul>
          </section>
          <section className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-bold">สถานที่ทำงาน / รัศมี GPS</h3>
            <ul className="divide-y divide-outline-variant text-sm">
              {(locations ?? []).map((l) => (
                <li key={l.id} className="flex items-center justify-between py-2">
                  <span>{l.name}</span>
                  <span className="text-xs text-on-surface-variant">{l.radius_meters} เมตร</span>
                </li>
              ))}
              {(locations ?? []).length === 0 && <p className="text-on-surface-variant">ยังไม่มีสถานที่ทำงาน</p>}
            </ul>
          </section>
        </div>

        <section className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-6 text-sm text-on-surface-variant">
          หน้าตั้งค่าขั้นสูง (สาขา, ทีม, ตำแหน่ง, ภาษี/ประกันสังคมแบบมีเวอร์ชัน, ลำดับผู้อนุมัติ, สิทธิ์ผู้ใช้แบบละเอียด, รูปแบบสลิป) อยู่ระหว่างพัฒนา — ดูสถานะที่{" "}
          <code>IMPLEMENTATION_STATUS.md</code> ปัจจุบันตั้งค่าเหล่านี้แก้ไขได้โดยตรงผ่านตาราง <code>policy_settings</code> /{" "}
          <code>system_settings</code> ใน Supabase
        </section>
      </div>
    </>
  );
}
