"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface RawNote {
  id: string;
  employee_id: string;
  text: string;
  created_at: string;
}

interface Person {
  employee_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  photo_url: string | null;
}

interface NoteTile {
  employeeId: string;
  name: string;
  photoUrl: string | null;
  text: string | null;
}

// Instagram/Facebook-Notes-style row: every colleague who currently has an active
// (<24h old) note. Your own note has its own inline composer on the home page
// (MyNoteWidget) instead of living in this row — this is the "friends can see it" half;
// the note's reactions/comments live on /colleagues/[employeeId].
export function NotesRow() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [tiles, setTiles] = useState<NoteTile[] | null>(null);

  useEffect(() => {
    if (!profile) return;
    async function load() {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: noteRows } = await supabase
        .from("employee_notes")
        .select("id, employee_id, text, created_at")
        .gte("created_at", dayAgo)
        .order("created_at", { ascending: false });

      const latestByEmployee = new Map<string, RawNote>();
      for (const n of (noteRows ?? []) as RawNote[]) {
        if (!latestByEmployee.has(n.employee_id)) latestByEmployee.set(n.employee_id, n);
      }

      const otherEntries = Array.from(latestByEmployee.entries()).filter(([employeeId]) => employeeId !== profile!.employeeId);
      if (otherEntries.length === 0) {
        setTiles([]);
        return;
      }

      const ids = otherEntries.map(([employeeId]) => employeeId);
      const { data: people } = await supabase.rpc("get_employees_basic_info", { p_employee_ids: ids });
      const peopleRows = (people ?? []) as Person[];
      const photoPaths = Array.from(new Set(peopleRows.map((p) => p.photo_url).filter((p): p is string => !!p)));
      const photoMap = new Map<string, string>();
      if (photoPaths.length > 0) {
        const { data: signed } = await supabase.storage.from("avatars").createSignedUrls(photoPaths, 3600);
        for (const item of signed ?? []) {
          if (item.signedUrl && item.path) photoMap.set(item.path, item.signedUrl);
        }
      }
      const peopleById = new Map(peopleRows.map((p) => [p.employee_id, p]));

      const otherTiles: NoteTile[] = otherEntries.map(([employeeId, n]) => {
        const p = peopleById.get(employeeId);
        return {
          employeeId,
          name: p?.nickname || p?.first_name || "-",
          photoUrl: p?.photo_url ? (photoMap.get(p.photo_url) ?? null) : null,
          text: n.text,
        };
      });

      setTiles(otherTiles);
    }
    load();
  }, [profile, supabase]);

  if (!tiles || tiles.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
      {tiles.map((t) => (
        <Link key={t.employeeId} href={`/colleagues/${t.employeeId}`} className="flex w-16 shrink-0 flex-col items-center gap-1 text-center">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-primary ring-offset-2">
            {t.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-surface-container">
                <span className="material-symbols-outlined text-on-surface-variant">person</span>
              </span>
            )}
          </span>
          <p className="w-full truncate text-[10px] font-semibold text-on-surface">{t.name}</p>
        </Link>
      ))}
    </div>
  );
}
