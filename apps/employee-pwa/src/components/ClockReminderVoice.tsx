"use client";

import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/AuthContext";

// Spoken clock-in / clock-out reminder (owner 2026-11-18): "อย่าลืมกดเข้างาน" / "อย่าลืมกดออกงาน".
// A web push cannot carry custom audio, so the voice is spoken by the app itself (speechSynthesis, Thai) when
//   1) the service worker tells the open app that a clock reminder push arrived, or
//   2) the app is opened / brought to the front and a clock reminder arrived in the last 10 minutes that was not spoken yet.
// It only works while the app is open (or has just been opened) — never when the app is fully closed.

const SPOKEN_KEY = "nineall.spokenReminders";

function speak(text: string) {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const utter = new SpeechSynthesisUtterance(text.replace(/\(ทดสอบ\)/g, "ทดสอบ"));
    utter.lang = "th-TH";
    const thai = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("th"));
    if (thai) utter.voice = thai;
    utter.rate = 0.95;
    utter.volume = 1;
    synth.cancel();
    synth.speak(utter);
    // say it twice so it is hard to miss
    const again = new SpeechSynthesisUtterance(utter.text);
    again.lang = utter.lang;
    if (thai) again.voice = thai;
    again.rate = utter.rate;
    synth.speak(again);
  } catch {
    // speech is a nice-to-have; never break the app
  }
}

function spokenIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SPOKEN_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function markSpoken(id: string) {
  try {
    localStorage.setItem(SPOKEN_KEY, JSON.stringify([...spokenIds(), id].slice(-30)));
  } catch {
    // ignore
  }
}

export function ClockReminderVoice() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    // iOS / Safari only allow speech after a tap: "unlock" it on the first touch with an empty utterance.
    const unlock = () => {
      try {
        window.speechSynthesis?.speak(new SpeechSynthesisUtterance(""));
      } catch {
        // ignore
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });

    const onMessage = (event: MessageEvent) => {
      const d = event.data as { type?: string; text?: string; id?: string } | undefined;
      if (d?.type === "clock-reminder" && d.text) {
        if (d.id) markSpoken(d.id);
        speak(d.text);
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  useEffect(() => {
    if (!profile) return;
    async function checkRecent() {
      if (document.visibilityState !== "visible" || !profile) return;
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("notifications")
        .select("id, title")
        .eq("profile_id", profile.profileId)
        .eq("type", "clock_reminder")
        .eq("is_read", false)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1);
      const n = data?.[0];
      if (n && !spokenIds().includes(n.id)) {
        markSpoken(n.id);
        speak(n.title);
      }
    }
    void checkRecent();
    const onVisible = () => void checkRecent();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [profile, supabase]);

  return null;
}
