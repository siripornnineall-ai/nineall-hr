// Nineall HR — clock-out Edge Function
// Mirrors clock-in: server computes early-leave / worked / OT minutes so the
// phone can never report favorable numbers for itself.

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
  selfiePath: string;
  deviceId?: string;
  isOfflineSubmission?: boolean;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function toMinuteOfDay(hhmmss: string): number {
  const [h, m] = hhmmss.split(":").map(Number);
  return h * 60 + m;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("UNAUTHENTICATED");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("UNAUTHENTICATED");

    const body = (await req.json()) as ClockOutBody;
    if (!body.selfiePath || typeof body.latitude !== "number" || typeof body.longitude !== "number") {
      throw new Error("INVALID_PAYLOAD");
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("org_id, employee_id")
      .eq("id", user.id)
      .single();
    if (profileError || !profile) throw new Error("PROFILE_NOT_FOUND");

    const workDate = new Date().toISOString().slice(0, 10);

    const { data: existing } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("employee_id", profile.employee_id)
      .eq("work_date", workDate)
      .maybeSingle();

    if (!existing || !existing.clock_in_server_at) {
      throw new Error("NO_CLOCK_IN_FOUND: กรุณาลงเวลาเข้างานก่อน");
    }

    const { data: shift } = existing.shift_id ? await supabase.from("work_shifts").select("*").eq("id", existing.shift_id).single() : { data: null };
    const { data: location } = existing.work_location_id
      ? await supabase.from("work_locations").select("*").eq("id", existing.work_location_id).single()
      : { data: null };

    let distanceM: number | null = null;
    let withinGeofence: boolean | null = null;
    if (location) {
      distanceM = haversineMeters(body.latitude, body.longitude, location.latitude, location.longitude);
      withinGeofence = distanceM <= location.radius_meters;
    }

    const clockInAt = new Date(existing.clock_in_server_at);
    const clockOutAt = new Date();
    const unpaidBreak = shift?.unpaid_break_minutes ?? 60;
    const rawWorkedMinutes = Math.max(0, Math.round((clockOutAt.getTime() - clockInAt.getTime()) / 60000) - unpaidBreak);

    // An approved half-day swap covering the afternoon (day-off swap or holiday swap)
    // means this employee is only scheduled to work the morning today — clocking out
    // around midday is the approved plan, not leaving early, so the shift's full end
    // time must not be used to penalize it.
    const [{ data: halfDaySwap }, { data: halfDayHolidaySwap }] = await Promise.all([
      supabase
        .from("day_off_swap_requests")
        .select("id")
        .eq("employee_id", profile.employee_id)
        .eq("substitute_date", workDate)
        .eq("status", "approved")
        .eq("unit", "half_day")
        .eq("period", "afternoon")
        .maybeSingle(),
      supabase
        .from("holiday_swap_requests")
        .select("id")
        .eq("employee_id", profile.employee_id)
        .eq("substitute_date", workDate)
        .eq("status", "approved")
        .eq("unit", "half_day")
        .eq("period", "afternoon")
        .maybeSingle(),
    ]);
    const onApprovedHalfDayOff = Boolean(halfDaySwap || halfDayHolidaySwap);

    let earlyLeaveMinutes = 0;
    let otMinutes = 0;
    const nowMinuteOfDay = clockOutAt.getHours() * 60 + clockOutAt.getMinutes();
    if (shift && !onApprovedHalfDayOff) {
      const shiftEndMinute = toMinuteOfDay(shift.end_time);
      earlyLeaveMinutes = Math.max(0, shiftEndMinute - nowMinuteOfDay - shift.grace_minutes_early_leave);
      if (shift.ot_after_shift_allowed) {
        otMinutes = Math.max(0, nowMinuteOfDay - shiftEndMinute);
      }
    }

    let status = existing.status;
    if (earlyLeaveMinutes > 0 && status === "on_time") status = "early_leave";

    const needsReview = Boolean(body.isOfflineSubmission) || existing.needs_review || withinGeofence === false;

    const { data: attendance, error: updateError } = await supabase
      .from("attendance_records")
      .update({
        clock_out_device_at: body.deviceAt,
        clock_out_server_at: clockOutAt.toISOString(),
        clock_out_latitude: body.latitude,
        clock_out_longitude: body.longitude,
        clock_out_accuracy_m: body.accuracyM,
        clock_out_distance_m: distanceM,
        clock_out_within_geofence: withinGeofence,
        clock_out_selfie_path: body.selfiePath,
        clock_out_device_id: body.deviceId ?? null,
        clock_out_is_offline_submission: body.isOfflineSubmission ?? false,
        status,
        early_leave_minutes: earlyLeaveMinutes,
        worked_minutes: rawWorkedMinutes,
        ot_minutes: otMinutes,
        needs_review: needsReview,
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (updateError) throw new Error(updateError.message);

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
