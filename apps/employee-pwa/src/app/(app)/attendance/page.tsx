"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

type Phase = "idle" | "requesting_location" | "submitting" | "done" | "error";

function getPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

// getCurrentPosition's error callback fires for three very different reasons (permission
// denied, no GPS fix available, or a timeout) but the old code showed the same "grant GPS
// permission" message for all three — so a real GPS timeout (e.g. weak signal indoors, a
// common report from staff who HAD already granted permission) looked identical to a denied
// permission and left people with no way to tell what was actually wrong. This resolves with
// a high-accuracy fix first, falls back to a lower-accuracy one (much faster, works off
// wifi/cell towers) if that times out or the position is unavailable, and only ever shows the
// "grant permission" message when the browser actually reports PERMISSION_DENIED.
async function resolvePosition(): Promise<GeolocationPosition> {
  if (!navigator.geolocation) {
    throw new Error("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง GPS");
  }
  try {
    return await getPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 });
  } catch (err) {
    const code = (err as GeolocationPositionError)?.code;
    if (code === GeolocationPositionError.PERMISSION_DENIED) {
      throw new Error("แอปไม่ได้รับสิทธิ์เข้าถึงตำแหน่ง GPS กรุณาไปที่การตั้งค่ามือถือแล้วอนุญาตสิทธิ์ตำแหน่งให้เบราว์เซอร์/แอปนี้");
    }
    try {
      return await getPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 30000 });
    } catch (err2) {
      const code2 = (err2 as GeolocationPositionError)?.code;
      if (code2 === GeolocationPositionError.PERMISSION_DENIED) {
        throw new Error("แอปไม่ได้รับสิทธิ์เข้าถึงตำแหน่ง GPS กรุณาไปที่การตั้งค่ามือถือแล้วอนุญาตสิทธิ์ตำแหน่งให้เบราว์เซอร์/แอปนี้");
      }
      throw new Error("ไม่สามารถระบุตำแหน่ง GPS ได้ กรุณาออกไปพื้นที่โล่งแจ้งหรือเชื่อมต่อ Wi-Fi แล้วลองใหม่อีกครั้ง");
    }
  }
}

export default function AttendancePage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [alreadyClockedIn, setAlreadyClockedIn] = useState(false);
  const [alreadyClockedOut, setAlreadyClockedOut] = useState(false);
  const [checkedToday, setCheckedToday] = useState(false);

  const checkTodayStatus = useCallback(async () => {
    if (!profile) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("attendance_records")
      .select("clock_in_server_at, clock_out_server_at")
      .eq("employee_id", profile.employeeId)
      .eq("work_date", today)
      .maybeSingle();
    setAlreadyClockedIn(Boolean(data?.clock_in_server_at));
    setAlreadyClockedOut(Boolean(data?.clock_out_server_at));
    setCheckedToday(true);
  }, [profile, supabase]);

  useEffect(() => {
    checkTodayStatus();
  }, [checkTodayStatus]);

  async function handlePunch() {
    setMessage(null);
    if (!profile) return;

    try {
      setPhase("requesting_location");
      const position = await resolvePosition();

      setPhase("submitting");
      const functionName = alreadyClockedIn ? "clock-out" : "clock-in";
      const { data, error: fnError } = await supabase.functions.invoke(functionName, {
        body: {
          deviceAt: new Date().toISOString(),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy ?? 0,
          isOfflineSubmission: false,
        },
      });

      if (fnError || !data?.ok) {
        // supabase-js doesn't parse the response body into `data` when the edge
        // function returns a non-2xx status — it only sets a generic message
        // ("Edge Function returned a non-2xx status code") on `fnError`. The real,
        // specific reason (e.g. "already clocked out today") is still sitting in the
        // raw response body on `fnError.context`, so read it from there instead.
        let specificError: string | undefined = data?.error;
        if (!specificError && fnError && "context" in fnError && fnError.context instanceof Response) {
          try {
            const body = await fnError.context.clone().json();
            specificError = body?.error;
          } catch {
            // response body wasn't JSON — fall through to the generic message
          }
        }
        throw new Error(specificError ?? fnError?.message ?? "บันทึกเวลาไม่สำเร็จ");
      }

      setPhase("done");
      setMessage(alreadyClockedIn ? "บันทึกเวลาออกงานสำเร็จ!" : "บันทึกเวลาเข้างานสำเร็จ!");
      await checkTodayStatus();
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
    }
  }

  if (!checkedToday) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  if (alreadyClockedIn && alreadyClockedOut) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-8 text-center">
        <span className="material-symbols-outlined text-5xl text-status-success">check_circle</span>
        <p className="font-semibold text-on-surface">คุณลงเวลาเข้าและออกงานวันนี้เรียบร้อยแล้ว</p>
      </div>
    );
  }

  const busy = phase === "requesting_location" || phase === "submitting";
  const title = alreadyClockedIn ? "ลงเวลาออกงาน" : "ลงเวลาเข้างาน";

  return (
    <div className="safe-top flex min-h-[75vh] flex-col justify-center px-5 pb-6 pt-4">
      <h1 className="mb-4 text-center text-lg font-bold text-primary">{title}</h1>

      <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-surface-container-low py-14">
        <span className="material-symbols-outlined text-6xl text-primary">{alreadyClockedIn ? "logout" : "login"}</span>
        <p className="text-sm text-on-surface-variant">กดปุ่มด้านล่างเพื่อ{title}</p>
      </div>

      <p className="mt-4 text-center text-xs text-on-surface-variant">*ระบบจะบันทึกพิกัด GPS เพื่อยืนยันตำแหน่งการลงเวลา</p>

      {message && phase === "error" && <p className="mt-2 text-center text-sm font-semibold text-status-danger">{message}</p>}
      {message && phase === "done" && <p className="mt-2 text-center text-sm font-semibold text-status-success">{message}</p>}

      <button
        onClick={handlePunch}
        disabled={busy || phase === "done"}
        className="mt-4 flex h-16 w-full items-center justify-center gap-2.5 rounded-2xl bg-primary font-bold text-white disabled:opacity-60"
      >
        {busy ? (
          <span className="material-symbols-outlined animate-spin">progress_activity</span>
        ) : (
          <>
            <span className="material-symbols-outlined">fingerprint</span>
            {title}
          </>
        )}
      </button>
    </div>
  );
}
