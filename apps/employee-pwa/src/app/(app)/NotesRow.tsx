"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

interface Tile {
  employeeId: string;
  name: string;
  photoUrl: string | null;
  text: string | null;
  isSelf: boolean;
}

const NOTE_MAX_LENGTH = 100;

// Instagram/Facebook-Notes-style row: your own tile first (bubble above your avatar if you
// have an active note, "+" affordance to write one if you don't), then every colleague who
// currently has an active (<24h old) note, each with their bubble above their avatar the
// same way. Tapping your own tile opens the compose box below the row; tapping anyone
// else's opens their full profile (/colleagues/[employeeId]) to react/comment.
export function NotesRow() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [tiles, setTiles] = useState<Tile[] | null>(null);
  const [photoMap, setPhotoMap] = useState<Map<string, string>>(new Map());
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
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

    const otherIds = Array.from(latestByEmployee.keys()).filter((id) => id !== profile.employeeId);
    const { data: people } = otherIds.length > 0 ? await supabase.rpc("get_employees_basic_info", { p_employee_ids: otherIds }) : { data: [] as Person[] };
    const peopleRows = (people ?? []) as Person[];
    const peopleById = new Map(peopleRows.map((p) => [p.employee_id, p]));

    const photoPaths = Array.from(new Set(peopleRows.map((p) => p.photo_url).filter((p): p is string => !!p)));
    const map = new Map<string, string>();
    if (photoPaths.length > 0) {
      const { data: signed } = await supabase.storage.from("avatars").createSignedUrls(photoPaths, 3600);
      for (const item of signed ?? []) {
        if (item.signedUrl && item.path) map.set(item.path, item.signedUrl);
      }
    }
    setPhotoMap(map);

    const selfTile: Tile = {
      employeeId: profile.employeeId,
      name: "โน้ตของคุณ",
      photoUrl: profile.photoUrl ?? null,
      text: latestByEmployee.get(profile.employeeId)?.text ?? null,
      isSelf: true,
    };
    const otherTiles: Tile[] = otherIds.map((employeeId) => {
      const p = peopleById.get(employeeId);
      const n = latestByEmployee.get(employeeId)!;
      return {
        employeeId,
        name: p?.nickname || p?.first_name || "-",
        photoUrl: p?.photo_url ? (map.get(p.photo_url) ?? null) : null,
        text: n.text,
        isSelf: false,
      };
    });
    setTiles([selfTile, ...otherTiles]);
  }, [profile, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function postNote() {
    if (!draft.trim() || !profile) return;
    setPosting(true);
    const { error } = await supabase.from("employee_notes").insert({ org_id: profile.orgId, employee_id: profile.employeeId, text: draft.trim() });
    setPosting(false);
    if (!error) {
      setDraft("");
      setComposing(false);
      load();
    }
  }

  if (!tiles) return null;

  return (
    <div className="space-y-2">
      <div className="flex gap-4 overflow-x-auto pb-1 pt-4" style={{ scrollbarWidth: "none" }}>
        {tiles.map((t) => {
          const avatar = (
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
          );
          return (
            // No fixed/absolute width here on purpose: a note bubble wider than the avatar
            // must actually push this tile wider in normal flow, or neighboring tiles'
            // bubbles overlap it in the horizontal scroll row — that's the bug being fixed.
            <div key={t.employeeId} className="flex min-w-16 shrink-0 flex-col items-center gap-1 text-center">
              {t.text && (
                <div className="w-max max-w-[110px] whitespace-normal break-words rounded-xl bg-white px-2.5 py-1.5 text-left text-[11px] font-semibold leading-snug text-on-surface shadow-[0_2px_10px_rgba(0,0,0,0.12)]">
                  {t.text}
                </div>
              )}
              {t.isSelf ? (
                <button onClick={() => setComposing((c) => !c)} className="relative">
                  {avatar}
                  {!t.text && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white ring-2 ring-white">
                      <span className="material-symbols-outlined text-[14px]">add</span>
                    </span>
                  )}
                </button>
              ) : (
                <Link href={`/colleagues/${t.employeeId}`}>{avatar}</Link>
              )}
              <p className="w-full truncate text-[10px] font-semibold text-on-surface">{t.name}</p>
            </div>
          );
        })}
      </div>

      {composing && (
        <div className="flex gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, NOTE_MAX_LENGTH))}
            placeholder="วันนี้อยากพูดอะไร?"
            className="min-w-0 flex-1 rounded-xl border border-outline-variant bg-white px-3.5 py-2 text-sm"
          />
          <button onClick={postNote} disabled={!draft.trim() || posting} className="shrink-0 rounded-xl bg-primary px-3 text-sm font-bold text-white disabled:opacity-40">
            โพสต์
          </button>
        </div>
      )}
    </div>
  );
}
