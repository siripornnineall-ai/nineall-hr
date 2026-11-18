"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { subscribeToPush } from "@/lib/push";

// Self-check for notifications on THIS device (owner 2026-11-18): permission, service worker version, saved subscription,
// a local test notification (no server involved), a spoken test, and "re-link this device" (drops a stale subscription and
// creates a fresh one). Reach it at /notification-test.

function speak(text: string) {
  try {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "th-TH";
    const thai = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("th"));
    if (thai) u.voice = thai;
    synth.cancel();
    synth.speak(u);
    return !!thai;
  } catch {
    return false;
  }
}

export default function NotificationTestPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [info, setInfo] = useState<Record<string, string>>({});
  const [log, setLog] = useState<string[]>([]);
  const add = (m: string) => setLog((l) => [...l, m]);

  const refresh = useCallback(async () => {
    const i: Record<string, string> = {};
    i["แจ้งเตือนที่เครื่องรองรับ"] = "Notification" in window ? "ใช่" : "ไม่รองรับ";
    i["สิทธิ์แจ้งเตือน"] = "Notification" in window ? Notification.permission : "-";
    i["รองรับ Push"] = "PushManager" in window ? "ใช่" : "ไม่รองรับ";
    i["เปิดจากไอคอนหน้าจอหลัก"] = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone ? "ใช่" : "ไม่ใช่";
    try {
      const reg = await navigator.serviceWorker.ready;
      const text = await (await fetch("/sw.js", { cache: "no-store" })).text();
      i["เวอร์ชันตัวรับแจ้งเตือน (ล่าสุดบนเซิร์ฟเวอร์)"] = /SW_VERSION = "([^"]+)"/.exec(text)?.[1] ?? "?";
      i["ตัวรับที่ทำงานอยู่"] = reg.active?.state ?? "-";
      const sub = await reg.pushManager.getSubscription();
      i["ผูกเครื่องนี้กับระบบ"] = sub ? `ผูกแล้ว (${new URL(sub.endpoint).host})` : "ยังไม่ผูก";
    } catch (e) {
      i["ตัวรับแจ้งเตือน"] = "ผิดพลาด: " + (e instanceof Error ? e.message : String(e));
    }
    setInfo(i);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  async function localTest() {
    try {
      if (Notification.permission !== "granted") {
        const p = await Notification.requestPermission();
        if (p !== "granted") return add("ไม่ได้รับอนุญาตแจ้งเตือน (" + p + ")");
      }
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("ทดสอบในเครื่อง", { body: "ถ้าเห็นข้อความนี้ แปลว่าเครื่องแสดงแจ้งเตือนได้", icon: "/icon-192.png", vibrate: [200, 100, 200] });
      add("สั่งแสดงแจ้งเตือนในเครื่องแล้ว (ถ้าไม่เห็น ให้เช็คตั้งค่าแจ้งเตือนของเครื่อง/โหมดห้ามรบกวน)");
    } catch (e) {
      add("ผิดพลาด: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  function voiceTest() {
    const hasThai = speak("อย่าลืมกดเข้างาน");
    add(hasThai ? "สั่งพูดแล้ว (เสียงไทย)" : "สั่งพูดแล้ว แต่เครื่องนี้ไม่มีเสียงไทย อาจพูดไม่ออกหรือใช้เสียงอื่น");
  }

  async function relink() {
    if (!profile) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const old = await reg.pushManager.getSubscription();
      if (old) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", old.endpoint);
        await old.unsubscribe();
      }
      const s = await subscribeToPush(supabase, profile.profileId);
      add(s === "subscribed" ? "ผูกเครื่องนี้ใหม่เรียบร้อย" : "ผูกไม่สำเร็จ: " + s);
      await refresh();
    } catch (e) {
      add("ผิดพลาด: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  const btn = "w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white";
  return (
    <div className="space-y-4 p-5">
      <h1 className="text-xl font-bold text-on-surface">ตรวจสอบแจ้งเตือนบนเครื่องนี้</h1>
      <div className="space-y-1 rounded-2xl bg-white p-4 text-sm shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        {Object.entries(info).map(([k, v]) => (
          <p key={k}>
            <span className="text-on-surface-variant">{k}: </span>
            <b>{v}</b>
          </p>
        ))}
      </div>
      <button className={btn} onClick={localTest}>
        1) ทดสอบแสดงแจ้งเตือนในเครื่อง
      </button>
      <button className={btn} onClick={voiceTest}>
        2) ทดสอบเสียงพูด
      </button>
      <button className={btn} onClick={relink}>
        3) ผูกเครื่องนี้ใหม่ (แก้กรณีไม่ได้รับแจ้งเตือนจากระบบ)
      </button>
      {log.map((m, i) => (
        <p key={i} className="text-xs text-on-surface-variant">
          • {m}
        </p>
      ))}
    </div>
  );
}
