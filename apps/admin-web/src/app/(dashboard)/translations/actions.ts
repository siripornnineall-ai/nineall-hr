"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LOCALES, type Locale } from "./constants";

export async function upsertTranslationValue(translationKeyId: string, locale: Locale, value: string) {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  // Confirm the key belongs to this org before writing (defense in depth on top of RLS).
  const { data: key } = await supabase
    .from("translation_keys")
    .select("id")
    .eq("id", translationKeyId)
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!key) throw new Error("ไม่พบรายการคำแปลนี้ในองค์กรของคุณ");

  const { data: existing } = await supabase
    .from("translations")
    .select("id, value")
    .eq("translation_key_id", translationKeyId)
    .eq("locale", locale)
    .maybeSingle();

  const trimmed = value.trim();

  if (existing) {
    if (existing.value === trimmed) return;
    const { error } = await supabase
      .from("translations")
      .update({ value: trimmed, updated_by: user.profileId, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);

    await supabase.from("translation_history").insert({
      translation_id: existing.id,
      old_value: existing.value,
      new_value: trimmed,
      changed_by: user.profileId,
    });
  } else {
    const { data: inserted, error } = await supabase
      .from("translations")
      .insert({ translation_key_id: translationKeyId, locale, value: trimmed, updated_by: user.profileId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("translation_history").insert({
      translation_id: inserted.id,
      old_value: null,
      new_value: trimmed,
      changed_by: user.profileId,
    });
  }

  revalidatePath("/translations");
}

export async function createTranslationKey(key: string, description: string, values: Partial<Record<Locale, string>>) {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const cleanKey = key.trim().toLowerCase().replace(/\s+/g, "_");
  if (!cleanKey) throw new Error("กรุณาระบุ Key");

  const { data: newKey, error } = await supabase
    .from("translation_keys")
    .insert({ org_id: user.orgId, key: cleanKey, description: description.trim() || null })
    .select("id")
    .single();
  if (error) throw new Error(error.message === `duplicate key value violates unique constraint "translation_keys_org_id_key_key"` ? "Key นี้มีอยู่แล้ว" : error.message);

  const rows = LOCALES.filter((l) => values[l]?.trim()).map((l) => ({
    translation_key_id: newKey.id,
    locale: l,
    value: values[l]!.trim(),
    updated_by: user.profileId,
  }));
  if (rows.length > 0) {
    const { error: valuesError } = await supabase.from("translations").insert(rows);
    if (valuesError) throw new Error(valuesError.message);
  }

  revalidatePath("/translations");
}

export async function deleteTranslationKey(translationKeyId: string) {
  const user = await requireUser();
  requireRole(user, ["super_admin"]);
  const supabase = await createClient();

  const { error } = await supabase.from("translation_keys").delete().eq("id", translationKeyId).eq("org_id", user.orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/translations");
}

export async function getKeyTranslationHistory(translationKeyId: string) {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { data: translations } = await supabase
    .from("translations")
    .select("id, locale")
    .eq("translation_key_id", translationKeyId);

  const translationIds = (translations ?? []).map((t) => t.id as string);
  if (translationIds.length === 0) return [];

  const localeByTranslationId = new Map((translations ?? []).map((t) => [t.id as string, t.locale as Locale]));

  const { data } = await supabase
    .from("translation_history")
    .select("id, translation_id, old_value, new_value, changed_at, profiles(full_name)")
    .in("translation_id", translationIds)
    .order("changed_at", { ascending: false })
    .limit(30);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    locale: localeByTranslationId.get(row.translation_id as string) ?? ("th" as Locale),
    oldValue: row.old_value as string | null,
    newValue: row.new_value as string | null,
    changedAt: row.changed_at as string,
    changedBy: (row.profiles as unknown as { full_name: string } | null)?.full_name ?? "-",
  }));
}

export async function importTranslationsBulk(entries: { key: string; description?: string; values: Partial<Record<Locale, string>> }[]) {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  let created = 0;
  let updated = 0;

  for (const entry of entries) {
    const cleanKey = entry.key.trim().toLowerCase().replace(/\s+/g, "_");
    if (!cleanKey) continue;

    const { data: existingKey } = await supabase
      .from("translation_keys")
      .select("id")
      .eq("org_id", user.orgId)
      .eq("key", cleanKey)
      .maybeSingle();

    const keyId =
      existingKey?.id ??
      (
        await supabase
          .from("translation_keys")
          .insert({ org_id: user.orgId, key: cleanKey, description: entry.description ?? null })
          .select("id")
          .single()
      ).data?.id;

    if (!keyId) continue;
    if (existingKey) updated++;
    else created++;

    for (const locale of LOCALES) {
      const value = entry.values[locale]?.trim();
      if (!value) continue;
      await supabase.from("translations").upsert(
        { translation_key_id: keyId, locale, value, updated_by: user.profileId },
        { onConflict: "translation_key_id,locale" }
      );
    }
  }

  revalidatePath("/translations");
  return { created, updated };
}
