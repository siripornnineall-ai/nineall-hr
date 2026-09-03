// Nineall HR — send-team-reminders Edge Function
// Fired every minute by a pg_cron job (see migration 0074_schedule_team_reminders.sql), which
// calls this via pg_net with a shared secret header — there's no end-user JWT in that path, so
// this function is deployed with verify_jwt=false and checks the secret itself instead.
//
// For each output_team with notify_enabled + shift_end_time set, if "now" (Asia/Bangkok) is
// exactly 10 minutes before that team's shift_end_time AND today's output_team_entries row for
// that team doesn't exist yet, push a reminder to every team member's subscribed devices.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import webpush from "npm:web-push@3.6.7";

function bangkokNow(): { hhmm: string; workDate: string } {
  const bkk = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const hh = String(bkk.getUTCHours()).padStart(2, "0");
  const mm = String(bkk.getUTCMinutes()).padStart(2, "0");
  const workDate = `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, "0")}-${String(bkk.getUTCDate()).padStart(2, "0")}`;
  return { hhmm: `${hh}:${mm}`, workDate };
}

function minus10(hhmmss: string): string {
  const [h, m] = hhmmss.split(":").map(Number);
  const total = (h * 60 + m - 10 + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  const cronSecretHeader = req.headers.get("x-cron-secret");

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: secretRows } = await supabase.from("app_secrets").select("key, value").in("key", ["cron_shared_secret", "vapid_public_key", "vapid_private_key", "vapid_subject"]);
  const secrets = Object.fromEntries((secretRows ?? []).map((r) => [r.key, r.value]));

  if (!cronSecretHeader || cronSecretHeader !== secrets.cron_shared_secret) {
    return new Response(JSON.stringify({ ok: false, error: "UNAUTHORIZED" }), { status: 401 });
  }

  webpush.setVapidDetails(secrets.vapid_subject, secrets.vapid_public_key, secrets.vapid_private_key);

  const { hhmm, workDate } = bangkokNow();

  const { data: teams } = await supabase.from("output_teams").select("id, name, shift_end_time").eq("notify_enabled", true).not("shift_end_time", "is", null);

  const dueTeams = (teams ?? []).filter((t) => minus10(t.shift_end_time as string) === hhmm);
  if (dueTeams.length === 0) {
    return new Response(JSON.stringify({ ok: true, due: 0 }), { headers: { "Content-Type": "application/json" } });
  }

  let sent = 0;
  const errors: string[] = [];

  for (const team of dueTeams) {
    const { data: existingEntry } = await supabase.from("output_team_entries").select("id").eq("output_team_id", team.id).eq("work_date", workDate).maybeSingle();
    if (existingEntry) continue;

    const { data: members } = await supabase.from("output_team_members").select("employee_id").eq("output_team_id", team.id);
    if (!members || members.length === 0) continue;

    const employeeIds = members.map((m) => m.employee_id);
    const { data: profiles } = await supabase.from("profiles").select("id").in("employee_id", employeeIds);
    if (!profiles || profiles.length === 0) continue;

    const profileIds = profiles.map((p) => p.id);
    const { data: subs } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("profile_id", profileIds);

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: `${team.name} — ใกล้เลิกงานแล้ว`,
            body: "อย่าลืมกรอกผลงานวันนี้ก่อนเลิกงาน",
            url: "/performance",
          })
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          errors.push(`${team.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, dueTeams: dueTeams.map((t) => t.name), sent, errors }), {
    headers: { "Content-Type": "application/json" },
  });
});
