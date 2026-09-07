// Nineall HR — send-push-notification Edge Function
// Fired synchronously (via pg_net inside a trigger — see migration
// 0081_push_on_notification_insert.sql) whenever ANY row is inserted into `notifications`,
// regardless of type (leave submitted/decided, OT, note comments, etc.) — this makes every
// existing in-app notification also show up as a real OS-level push on the recipient's phone,
// same as apps/employee-pwa's send-team-reminders function. There's no end-user JWT in that
// path, so this function is deployed with verify_jwt=false and checks a shared secret itself.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import webpush from "npm:web-push@3.6.7";

Deno.serve(async (req) => {
  const cronSecretHeader = req.headers.get("x-cron-secret");

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: secretRows } = await supabase
    .from("app_secrets")
    .select("key, value")
    .in("key", ["cron_shared_secret", "vapid_public_key", "vapid_private_key", "vapid_subject"]);
  const secrets = Object.fromEntries((secretRows ?? []).map((r) => [r.key, r.value]));

  if (!cronSecretHeader || cronSecretHeader !== secrets.cron_shared_secret) {
    return new Response(JSON.stringify({ ok: false, error: "UNAUTHORIZED" }), { status: 401 });
  }

  const { profile_id, title, body, url } = await req.json();
  if (!profile_id || !title) {
    return new Response(JSON.stringify({ ok: false, error: "BAD_REQUEST" }), { status: 400 });
  }

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", profile_id);

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { "Content-Type": "application/json" } });
  }

  webpush.setVapidDetails(secrets.vapid_subject, secrets.vapid_public_key, secrets.vapid_private_key);

  let sent = 0;
  const errors: string[] = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, url })
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, errors }), { headers: { "Content-Type": "application/json" } });
});
