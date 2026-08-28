// Nineall HR — clock-in Edge Function
// Thin wrapper around the public.clock_in() Postgres function, which does the real work
// (geofence check, shift/late calculation, half-day-swap exemption, the insert itself) in
// one atomic call. This must go through that function rather than writing
// attendance_records directly — a BEFORE UPDATE trigger on that table
// (restrict_attendance_self_update) rejects any employee-initiated write that didn't come
// through clock_in()/clock_out(), which set a session flag the trigger checks for.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ClockInBody {
  deviceAt: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  // No selfie/face-scan step anymore (see "Remove selfie/face-scan step from employee
  // clock-in/out") — the client never sends this, so it must stay optional here.
  selfiePath?: string;
  deviceId?: string;
  isOfflineSubmission?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("UNAUTHENTICATED");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const body = (await req.json()) as ClockInBody;
    if (typeof body.latitude !== "number" || typeof body.longitude !== "number") {
      throw new Error("INVALID_PAYLOAD");
    }

    const { data: attendance, error } = await supabase.rpc("clock_in", {
      p_device_at: body.deviceAt,
      p_latitude: body.latitude,
      p_longitude: body.longitude,
      p_accuracy_m: body.accuracyM,
      p_selfie_path: body.selfiePath ?? null,
      p_device_id: body.deviceId ?? null,
      p_is_offline: body.isOfflineSubmission ?? false,
    });

    if (error) throw new Error(error.message);

    return new Response(JSON.stringify({ ok: true, attendance }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
