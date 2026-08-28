// Nineall HR — clock-out Edge Function
// Thin wrapper around the public.clock_out() Postgres function — see clock-in/index.ts for
// why this must delegate rather than write attendance_records directly.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ClockOutBody {
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

    const body = (await req.json()) as ClockOutBody;
    if (typeof body.latitude !== "number" || typeof body.longitude !== "number") {
      throw new Error("INVALID_PAYLOAD");
    }

    const { data: attendance, error } = await supabase.rpc("clock_out", {
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
