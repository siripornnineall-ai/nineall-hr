import type { SupabaseClient } from "@supabase/supabase-js";

// Public by design — the VAPID public key only lets a server holding the matching private
// key address push messages to a subscription; it carries no secret. Kept as a plain constant
// (rather than an env var) so it doesn't depend on Vercel project env config being set correctly.
const VAPID_PUBLIC_KEY = "BFn9iURbEEkKY39RsU8i5YfqrIUUPATvLtymMnH2dA6nokOZPuXvgpgQ8O9EQEPqSvWAMfRCmsuSy6i6AGmO6ZM";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export type PushStatus = "unsupported" | "denied" | "unsubscribed" | "subscribed";

export async function getPushStatus(): Promise<PushStatus> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? "subscribed" : "unsubscribed";
}

export async function subscribeToPush(supabase: SupabaseClient, profileId: string): Promise<PushStatus> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "unsubscribed";

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = subscription.toJSON();
  await supabase.from("push_subscriptions").upsert(
    {
      profile_id: profileId,
      endpoint: json.endpoint!,
      p256dh: json.keys!.p256dh!,
      auth: json.keys!.auth!,
    },
    { onConflict: "endpoint" }
  );

  return "subscribed";
}
