import type { SupabaseClient } from "@supabase/supabase-js";

// Avatar egress was what blew the Supabase free-tier quota (2026-09-27): every page that
// shows colleagues asked for a fresh 1-hour signed URL, and a fresh URL means the browser
// can't reuse what it already downloaded — so 24 people re-fetched up to 12 MB of full-size
// photos on every home-screen visit. Two fixes live here:
//   * signed URLs last 7 days and are cached per device (localStorage), so the same URL is
//     handed out again and the browser's HTTP cache serves the image without any egress
//   * new uploads are shrunk on the phone to 512 px JPEG (tens of KB instead of megabytes)
const STORAGE_KEY = "nineall.avatarUrls.v1";
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
// Re-sign a day before expiry so a cached URL never goes stale mid-session.
const REUSE_IF_VALID_FOR_MS = 24 * 60 * 60 * 1000;

interface CachedUrl {
  url: string;
  exp: number;
}

let memory: Map<string, CachedUrl> | null = null;

function loadCache(): Map<string, CachedUrl> {
  if (memory) return memory;
  memory = new Map();
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, CachedUrl>;
      for (const [path, entry] of Object.entries(parsed)) {
        if (entry && typeof entry.url === "string" && typeof entry.exp === "number") memory.set(path, entry);
      }
    }
  } catch {
    // Private mode / blocked storage — work from memory only.
  }
  return memory;
}

function persistCache(cache: Map<string, CachedUrl>) {
  try {
    if (typeof window === "undefined") return;
    const now = Date.now();
    const obj: Record<string, CachedUrl> = {};
    for (const [path, entry] of cache) if (entry.exp > now) obj[path] = entry;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

/** Signed URLs for many avatar paths at once, reusing cached ones. Missing/failed paths are simply absent. */
export async function signAvatarUrls(supabase: SupabaseClient, paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const cache = loadCache();
  const now = Date.now();
  const result = new Map<string, string>();
  const missing: string[] = [];
  for (const path of Array.from(new Set(paths.filter((p): p is string => !!p)))) {
    const hit = cache.get(path);
    if (hit && hit.exp - now > REUSE_IF_VALID_FOR_MS) result.set(path, hit.url);
    else missing.push(path);
  }
  if (missing.length > 0) {
    const { data } = await supabase.storage.from("avatars").createSignedUrls(missing, SIGNED_URL_TTL_SECONDS);
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) {
        result.set(item.path, item.signedUrl);
        cache.set(item.path, { url: item.signedUrl, exp: now + SIGNED_URL_TTL_SECONDS * 1000 });
      }
    }
    persistCache(cache);
  }
  return result;
}

/** Signed URL for one avatar path (null when there is no path or signing fails). */
export async function signAvatarUrl(supabase: SupabaseClient, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const map = await signAvatarUrls(supabase, [path]);
  return map.get(path) ?? null;
}

/** Forget a cached URL (after the user replaces their photo). */
export function forgetAvatarUrl(path: string) {
  const cache = loadCache();
  cache.delete(path);
  persistCache(cache);
}

/**
 * Shrinks a photo to at most `maxSize` px on its longer side and re-encodes it as JPEG.
 * Falls back to the original file if the browser can't decode it (e.g. HEIC on old
 * Android) — better an oversized avatar than a failed upload.
 */
export async function shrinkImage(file: File, maxSize = 512, quality = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
