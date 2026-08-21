import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { NewAnnouncementForm } from "./NewAnnouncementForm";
import { DeleteAnnouncementButton } from "./DeleteAnnouncementButton";

export default async function AnnouncementsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("announcements")
    .select("id, title, body, publish_at, target_type, status")
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
            <article key={a.id} className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold">{a.title}</h3>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-on-surface-variant">{new Date(a.publish_at).toLocaleDateString("th-TH")}</span>
                  {canCreate && <DeleteAnnouncementButton announcementId={a.id} />}
                </div>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-on-surface-variant">{a.body}</p>
            </article>
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
