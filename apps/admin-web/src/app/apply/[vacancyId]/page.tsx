import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ApplyForm } from "./ApplyForm";

export default async function PublicApplyPage({ params }: { params: Promise<{ vacancyId: string }> }) {
  const { vacancyId } = await params;
  const supabase = await createClient();

  const { data: vacancy } = await supabase
    .from("job_vacancies")
    .select("id, org_id, title, description, headcount, status, organizations(name)")
    .eq("id", vacancyId)
    .maybeSingle();

  if (!vacancy) notFound();

  const org = vacancy.organizations as unknown as { name: string } | null;

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Image src="/logo-mark.png" alt={org?.name ?? "Nineall HR"} width={56} height={56} className="rounded bg-white p-1 shadow-sm" />
        <p className="text-sm font-semibold text-on-surface-variant">{org?.name ?? "-"}</p>
        <h1 className="text-2xl font-bold text-on-surface">{vacancy.title}</h1>
        <p className="text-sm text-on-surface-variant">รับ {vacancy.headcount} อัตรา</p>
      </div>

      {vacancy.status !== "open" ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-base font-bold text-on-surface">ตำแหน่งนี้ปิดรับสมัครแล้ว</p>
          <p className="mt-1 text-sm text-on-surface-variant">ขอบคุณที่สนใจร่วมงานกับเรา ติดตามตำแหน่งงานใหม่ได้ในอนาคต</p>
        </div>
      ) : (
        <>
          {vacancy.description && (
            <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
              <p className="mb-2 text-sm font-bold text-on-surface">รายละเอียดงาน</p>
              <p className="whitespace-pre-wrap text-sm text-on-surface-variant">{vacancy.description}</p>
            </div>
          )}
          <ApplyForm vacancyId={vacancy.id} orgId={vacancy.org_id} />
        </>
      )}
    </div>
  );
}
