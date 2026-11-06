import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { NewAnnouncementForm } from "./NewAnnouncementForm";
import { AnnouncementCard } from "./AnnouncementCard";

export default async function AnnouncementsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("announcements")
    .select("id, title, body, publish_at, updated_at, target_type, status")
    .eq("org_id", user.orgId)
    .order("publish_at", { ascending: false });

  const canCreate = ["super_admin", "hr"].includes(user.role);

  return (
    <>
      <Topbar title="ประกาศบริษัท" subtitle="ข่าวสารและประกาศสำหรับพนักงาน" />
      <div className="grid grid-cols-1 gap-6 p-4 md:p-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {(data ?? []).length === 0 && <p className="text-sm text-on-surface-variant">ยังไม่มีประกาศ</p>}
          {(data ?? []).map((a) => (
            <AnnouncementCard key={a.id} id={a.id} title={a.title} body={a.body} publishAt={a.publish_at} updatedAt={a.updated_at} canManage={canCreate} />
          ))}
        </div>
        {canCreate && (
          <div>
            <NewAnnouncementForm />
          </div>
        )}
      </div>
    </>
  );
}
