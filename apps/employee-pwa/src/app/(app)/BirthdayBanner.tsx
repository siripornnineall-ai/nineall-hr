"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface BirthdayPerson {
  employee_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  photo_url: string | null;
  signedPhotoUrl: string | null;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// Floating congratulations popup, visible to everyone in the org, whenever it's someone's
// actual birthday (date_of_birth day+month match today — set on the employee's profile in
// admin-web). Dismissible, and once dismissed stays hidden for the rest of the day (not
// forever) via localStorage keyed by today's date, so it doesn't nag on every navigation.
export function BirthdayBanner() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [people, setPeople] = useState<BirthdayPerson[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const key = `birthday-banner-dismissed-${todayKey()}`;
      if (typeof window !== "undefined" && window.localStorage.getItem(key)) {
        setDismissed(true);
      }

      const { data } = await supabase.rpc("get_todays_birthdays");
      const rows = (data ?? []) as Omit<BirthdayPerson, "signedPhotoUrl">[];
      if (rows.length === 0) {
        setPeople([]);
        return;
      }

      const photoPaths = Array.from(new Set(rows.map((r) => r.photo_url).filter((p): p is string => !!p)));
      const urlByPath = new Map<string, string>();
      if (photoPaths.length > 0) {
        const { data: signed } = await supabase.storage.from("avatars").createSignedUrls(photoPaths, 3600);
        for (const item of signed ?? []) {
          if (item.signedUrl && item.path) urlByPath.set(item.path, item.signedUrl);
        }
      }

      setPeople(rows.map((r) => ({ ...r, signedPhotoUrl: r.photo_url ? (urlByPath.get(r.photo_url) ?? null) : null })));
    })();
  }, [profile, supabase]);

  function dismiss() {
    if (typeof window !== "undefined") window.localStorage.setItem(`birthday-banner-dismissed-${todayKey()}`, "1");
    setDismissed(true);
  }

  if (dismissed || !people || people.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6" onClick={dismiss}>
      <div className="w-full max-w-xs rounded-3xl bg-white p-6 text-center shadow-[0_10px_30px_rgba(0,0,0,0.2)]" onClick={(e) => e.stopPropagation()}>
        <p className="text-4xl">🎉</p>
        <p className="mt-2 text-base font-bold text-on-surface">สุขสันต์วันเกิด</p>

        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {people.map((p) => (
            <div key={p.employee_id} className="flex flex-col items-center gap-1">
              <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full ring-2 ring-primary ring-offset-2">
                {p.signedPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.signedPhotoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-surface-container">
                    <span className="material-symbols-outlined text-on-surface-variant">person</span>
                  </span>
                )}
              </span>
              <p className="max-w-[80px] truncate text-xs font-semibold text-on-surface">{p.nickname || p.first_name}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm text-on-surface-variant">
          ขอให้{people.length > 1 ? "ทุกคน" : p0Name(people)}มีความสุข สุขภาพแข็งแรง และประสบความสำเร็จตลอดปีนะ 🎂
        </p>

        <button onClick={dismiss} className="mt-5 h-10 w-full rounded-xl bg-primary text-sm font-bold text-white">
          ปิด
        </button>
      </div>
    </div>
  );
}

function p0Name(people: BirthdayPerson[]): string {
  const p = people[0];
  return p.nickname || p.first_name;
}
