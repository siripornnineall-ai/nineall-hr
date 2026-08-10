import { requireUser, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { TranslationGrid } from "./TranslationGrid";
import type { Locale } from "./constants";

export default async function TranslationsPage() {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { data: keys } = await supabase
    .from("translation_keys")
    .select("id, key, description, translations(id, locale, value)")
    .eq("org_id", user.orgId)
    .order("key", { ascending: true });

  const rows = (keys ?? []).map((k) => {
    const values: Partial<Record<Locale, { translationId: string; value: string }>> = {};
    for (const t of (k.translations as unknown as { id: string; locale: Locale; value: string | null }[]) ?? []) {
      if (t.value) values[t.locale] = { translationId: t.id, value: t.value };
    }
    return { id: k.id as string, key: k.key as string, description: k.description as string | null, values };
  });

  const missingCount = rows.filter((r) => Object.keys(r.values).length < 4).length;

  return (
    <>
      <Topbar title="ภาษาและคำแปล" subtitle={`คำแปลที่ยังไม่ครบ (${missingCount})`} />
      <div className="space-y-4 p-4 md:p-8">
        <TranslationGrid initialRows={rows} />
      </div>
    </>
  );
}
