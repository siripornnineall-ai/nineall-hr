import type { SupabaseClient } from "@supabase/supabase-js";

// photo_url on `employees` is a private-bucket storage path, not a fetchable URL.
// This batch-signs every distinct path in one call so list/table pages don't need
// one createSignedUrl round-trip per row.
export async function signAvatarUrls(supabase: SupabaseClient, photoPaths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const paths = Array.from(new Set(photoPaths.filter((p): p is string => !!p)));
  const map = new Map<string, string>();
  if (paths.length === 0) return map;

  const { data } = await supabase.storage.from("avatars").createSignedUrls(paths, 3600);
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) map.set(item.path, item.signedUrl);
  }
  return map;
}
