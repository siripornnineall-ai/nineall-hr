"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

type Phase = "idle" | "camera_error" | "camera_ready" | "requesting_location" | "uploading" | "done" | "error";

export default function AttendancePage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase("camera_ready");
    } catch {
      setPhase("camera_error");
      setMessage("แอปต้องการสิทธิ์ใช้กล้องเพื่อถ่ายภาพเซลฟียืนยันตัวตนตอนลงเวลา กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์");
    }
  }, []);

  useEffect(() => {
    if (checkedToday && !(alreadyClockedIn && alreadyClockedOut)) {
      startCamera();
    }
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [checkedToday, alreadyClockedIn, alreadyClockedOut, startCamera]);

  async function handlePunch() {
    setMessage(null);
    if (!videoRef.current || !profile) return;

    try {
      // Capture a fresh frame from the live camera stream — never a file picker / gallery.
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("ถ่ายภาพไม่สำเร็จ");
      ctx.drawImage(videoRef.current, 0, 0);
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("ถ่ายภาพไม่สำเร็จ"))), "image/jpeg", 0.7)
      );

      setPhase("requesting_location");
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง GPS"));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error("แอปต้องการสิทธิ์เข้าถึงตำแหน่ง GPS เพื่อลงเวลา")), {
          enableHighAccuracy: true,
          timeout: 15000,
        });
      });

      setPhase("uploading");
      const path = `${profile.orgId}/${profile.employeeId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("selfies").upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) throw new Error(`อัปโหลดรูปไม่สำเร็จ: ${uploadError.message}`);

      const functionName = alreadyClockedIn ? "clock-out" : "clock-in";
      const { data, error: fnError } = await supabase.functions.invoke(functionName, {
        body: {
          deviceAt: new Date().toISOString(),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy ?? 0,
          selfiePath: path,
          isOfflineSubmission: false,
        },
      });

      if (fnError || !data?.ok) {
        throw new Error(data?.error ?? fnError?.message ?? "บันทึกเวลาไม่สำเร็จ");
      }

      streamRef.current?.getTracks().forEach((t) => t.stop());
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

  const busy = phase === "requesting_location" || phase === "uploading";
  const title = alreadyClockedIn ? "ลงเวลาออกงาน" : "ลงเวลาเข้างาน";

  return (
    <div className="safe-top px-5 pb-6 pt-4">
      <h1 className="mb-4 text-center text-lg font-bold text-primary">{title}</h1>

      <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-black">
        {phase === "camera_error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <span className="material-symbols-outlined text-4xl text-white/70">videocam_off</span>
            <p className="text-sm text-white/80">{message}</p>
            <button onClick={startCamera} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white">
              อนุญาตใช้กล้อง
            </button>
          </div>
        ) : (
          <>
            {/* Mirrored so the live preview matches how a selfie camera normally looks to the user. */}
            <video ref={videoRef} className="h-full w-full object-cover" style={{ transform: "scaleX(-1)" }} playsInline muted />
            <div className="pointer-events-none absolute inset-[18%] rounded-3xl border-2 border-white/60" />
          </>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-on-surface-variant">*ระบบจะบันทึกใบหน้าและพิกัด GPS เพื่อความปลอดภัยและยืนยันตัวตน</p>

      {message && phase === "error" && <p className="mt-2 text-center text-sm font-semibold text-status-danger">{message}</p>}
      {message && phase === "done" && <p className="mt-2 text-center text-sm font-semibold text-status-success">{message}</p>}

      <button
        onClick={handlePunch}
        disabled={busy || phase === "camera_error" || phase === "done"}
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
