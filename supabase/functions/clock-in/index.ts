// Nineall HR — clock-in Edge Function
// Runs with the caller's JWT so RLS still applies for reads, but performs the
// GPS-radius check and attendance-status calculation on the server so a client
// can never self-report "on time" or fake being inside the work-location geofence.

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

    const body = (await req.json()) as ClockInBody;
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

    const { data: assignment } = await supabase
      .from("shift_assignments")
      .select("shift_id, work_location_id, is_day_off, is_work_from_home, is_off_site")
      .eq("employee_id", profile.employee_id)
      .eq("work_date", workDate)
      .maybeSingle();

    const { data: shift } = assignment?.shift_id
      ? await supabase.from("work_shifts").select("*").eq("id", assignment.shift_id).single()
      : { data: null };

    const { data: location } = assignment?.work_location_id
      ? await supabase.from("work_locations").select("*").eq("id", assignment.work_location_id).single()
      : { data: null };

    let distanceM: number | null = null;
    let withinGeofence: boolean | null = null;
    if (location) {
      distanceM = haversineMeters(body.latitude, body.longitude, location.latitude, location.longitude);
      withinGeofence = distanceM <= location.radius_meters;
    }

    const { data: holiday } = await supabase
      .from("company_holidays")
      .select("id")
      .eq("org_id", profile.org_id)
      .eq("holiday_date", workDate)
      .maybeSingle();

    // An approved half-day swap covering the morning (day-off swap or holiday swap)
    // means this employee is only scheduled to work the afternoon today — clocking in
    // around midday is the approved plan, not arriving late.
    const [{ data: halfDaySwap }, { data: halfDayHolidaySwap }] = await Promise.all([
      supabase
        .from("day_off_swap_requests")
        .select("id")
        .eq("employee_id", profile.employee_id)
        .eq("substitute_date", workDate)
        .eq("status", "approved")
        .eq("unit", "half_day")
        .eq("period", "morning")
        .maybeSingle(),
      supabase
        .from("holiday_swap_requests")
        .select("id")
        .eq("employee_id", profile.employee_id)
        .eq("substitute_date", workDate)
        .eq("status", "approved")
        .eq("unit", "half_day")
        .eq("period", "morning")
        .maybeSingle(),
    ]);
    const onApprovedHalfDayOff = Boolean(halfDaySwap || halfDayHolidaySwap);

    let status = "on_time";
    let lateMinutes = 0;
    let needsReview = Boolean(body.isOfflineSubmission);

    const nowMinuteOfDay = new Date().getHours() * 60 + new Date().getMinutes();
    if (holiday) {
      status = "holiday";
    } else if (assignment?.is_work_from_home) {
      status = "work_from_home";
    } else if (assignment?.is_off_site) {
      status = "off_site";
    } else if (shift && !onApprovedHalfDayOff) {
      const shiftStartMinute = toMinuteOfDay(shift.start_time);
      lateMinutes = Math.max(0, nowMinuteOfDay - shiftStartMinute - shift.grace_minutes_late);
      status = lateMinutes > 0 ? "late" : "on_time";
    }

    if (location && withinGeofence === false) {
      needsReview = true;
    }

    const { data: attendance, error: upsertError } = await supabase
      .from("attendance_records")
      .upsert(
        {
          org_id: profile.org_id,
          employee_id: profile.employee_id,
          work_date: workDate,
          shift_id: assignment?.shift_id ?? null,
          work_location_id: assignment?.work_location_id ?? null,
          clock_in_device_at: body.deviceAt,
          clock_in_server_at: new Date().toISOString(),
          clock_in_latitude: body.latitude,
          clock_in_longitude: body.longitude,
          clock_in_accuracy_m: body.accuracyM,
          clock_in_distance_m: distanceM,
          clock_in_within_geofence: withinGeofence,
          clock_in_selfie_path: body.selfiePath,
          clock_in_device_id: body.deviceId ?? null,
          clock_in_is_offline_submission: body.isOfflineSubmission ?? false,
          status,
          late_minutes: lateMinutes,
          needs_review: needsReview,
        },
        { onConflict: "employee_id,work_date" }
      )
      .select()
      .single();

    if (upsertError) throw new Error(upsertError.message);

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
