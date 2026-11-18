"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { getPushStatus, subscribeToPush, type PushStatus } from "@/lib/push";
import { useT } from "@/lib/i18n";

// Reminder strip (owner 2026-11-18) for staff who have not turned on phone notifications — without them the clock-in /
// clock-out reminders never reach the phone. Shown on every screen until notifications are on; "ไว้ทีหลัง" hides it for 12 hours.
const DISMISS_KEY = "nineall.enableNotifDismissedAt";
const DISMISS_MS = 12 * 60 * 60 * 1000;

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function EnableNotificationsBanner() {
  const { t } = useT();
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<PushStatus | "needs-install" | null>(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  const refresh = useCallback(async () => {
    if (!profile) return;
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (at && Date.now() - at < DISMISS_MS) setHidden(true);
    } catch {
      // ignore
    }
    if (isIos() && !isStandalone()) {
      setStatus("needs-install"); // iPhone only gets push from the app added to the home screen
      return;
    }
    const s = await getPushStatus();
    if (s === "subscribed") {
      // Already on: re-save this device's subscription quietly so the server always has it.
      await subscribeToPush(supabase, profile.profileId);
    }
    setStatus(s);
  }, [profile, supabase]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  async function enable() {
    if (!profile) return;
    setBusy(true);
    const s = await subscribeToPush(supabase, profile.profileId);
    setBusy(false);
    setStatus(s);
  }

  if (hidden || status === null || status === "subscribed" || status === "unsupported") return null;

  return (
    <div className="mx-4 mt-3 rounded-2xl border border-[#f5a623] bg-[#fff6e5] p-3 text-sm text-on-surface">
      <p className="font-bold">🔔 {t("ยังไม่ได้เปิดแจ้งเตือนบนมือถือ")}</p>
      {status === "unsubscribed" && (
        <>
          <p className="mt-1 text-xs text-on-surface-variant">{t("เปิดเพื่อรับแจ้งเตือนอย่าลืมกดเข้างาน/ออกงาน")}</p>
          <div className="mt-2 flex items-center gap-3">
            <button onClick={enable} disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
              {busy ? t("กำลังเปิด...") : t("เปิดแจ้งเตือน")}
            </button>
            <button onClick={() => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {} setHidden(true); }} className="text-xs font-semibold text-on-surface-variant">
              {t("ไว้ทีหลัง")}
            </button>
          </div>
        </>
      )}
      {status === "denied" && (
        <p className="mt-1 text-xs text-on-surface-variant">{t("การแจ้งเตือนถูกปิดไว้ ไปที่ ตั้งค่าเครื่อง → การแจ้งเตือน → Nineall HR (หรือ Chrome) แล้วเปิดอนุญาต จากนั้นกลับมาเปิดแอปใหม่")}</p>
      )}
      {status === "needs-install" && (
        <p className="mt-1 text-xs text-on-surface-variant">{t("iPhone ต้องเพิ่มแอปไว้หน้าจอหลักก่อน: Safari → ปุ่มแชร์ → เพิ่มไปยังหน้าจอโฮม แล้วเปิดแอปจากไอคอนนั้น จึงจะกดเปิดแจ้งเตือนได้")}</p>
      )}
    </div>
  );
}
