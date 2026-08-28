"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface Note {
  id: string;
  text: string;
  created_at: string;
}

const NOTE_MAX_LENGTH = 100;

// The compose box for the user's own ephemeral (24h) status note, shown right on the home
// page next to their own profile photo — matches the Facebook/Instagram Notes pattern
// where writing your own note doesn't require navigating away first. Reactions and
// comments on it still live on the full profile page (/colleagues/[employeeId]).
export function MyNoteWidget() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [note, setNote] = useState<Note | null>(null);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("employee_notes")
      .select("id, text, created_at")
      .eq("employee_id", profile.employeeId)
      .gte("created_at", dayAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setNote((data as Note | null) ?? null);
    setLoaded(true);
  }, [profile, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function postNote() {
    if (!draft.trim() || !profile) return;
    setPosting(true);
    const { error } = await supabase.from("employee_notes").insert({
      org_id: profile.orgId,
      employee_id: profile.employeeId,
      text: draft.trim(),
    });
    setPosting(false);
    if (!error) {
      setDraft("");
      load();
    }
  }

  if (!loaded) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-container">
        {profile?.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="material-symbols-outlined text-white">person</span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-bold text-on-surface-variant">โน้ตของคุณ (หายภายใน 24 ชม.)</p>
        {note && <p className="mb-1 truncate text-sm font-semibold text-on-surface">{note.text}</p>}
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, NOTE_MAX_LENGTH))}
            placeholder={note ? "เขียนโน้ตใหม่ทับของเดิม..." : "วันนี้อยากพูดอะไร?"}
            className="min-w-0 flex-1 rounded-xl border border-outline-variant px-3 py-2 text-sm"
          />
          <button
            onClick={postNote}
            disabled={!draft.trim() || posting}
            className="shrink-0 rounded-xl bg-primary px-3 text-sm font-bold text-white disabled:opacity-40"
          >
            โพสต์
          </button>
        </div>
      </div>
    </div>
  );
}
