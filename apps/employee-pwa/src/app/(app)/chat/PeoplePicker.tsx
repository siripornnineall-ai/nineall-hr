"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { signAvatarUrls } from "@/lib/avatars";
import { useT } from "@/lib/i18n";
import { displayName, type DirectoryRow } from "@/lib/chat";

// Bottom-sheet colleague picker used for: starting a 1:1 chat (single), creating a group
// (multi + name), adding people to a group (multi, existing members excluded).
interface Props {
  title: string;
  excludeIds: string[];
  multi: boolean;
  askName?: boolean;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (ids: string[], name: string) => void;
}

export function PeoplePicker({ title, excludeIds, multi, askName, submitLabel, busy, error, onClose, onSubmit }: Props) {
  const { t } = useT();
  const supabase = useMemo(() => createClient(), []);
  const [people, setPeople] = useState<DirectoryRow[]>([]);
  const [photoMap, setPhotoMap] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");

  useEffect(() => {
    supabase.rpc("get_colleague_directory").then(async ({ data }) => {
      const rows = (data ?? []) as DirectoryRow[];
      const map = new Map<string, string>();
      const paths = rows.map((r) => r.photo_url).filter((p): p is string => !!p);
      if (paths.length > 0) for (const [p, u] of await signAvatarUrls(supabase, paths)) map.set(p, u);
      setPhotoMap(map);
      setPeople(rows);
      setLoaded(true);
    });
  }, [supabase]);

  const exclude = useMemo(() => new Set(excludeIds), [excludeIds]);
  const filtered = people.filter((p) => {
    if (exclude.has(p.employee_id)) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      p.first_name.toLowerCase().includes(q) ||
      p.last_name.toLowerCase().includes(q) ||
      (p.nickname ?? "").toLowerCase().includes(q) ||
      p.employee_code.toLowerCase().includes(q)
    );
  });

  function toggle(id: string) {
    if (!multi) {
      onSubmit([id], "");
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const canSubmit = multi && selected.size > 0 && (!askName || name.trim().length > 0) && !busy;

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/40" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full flex-col rounded-t-3xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-4">
          <p className="text-base font-bold text-on-surface">{title}</p>
          <button onClick={onClose} className="text-on-surface-variant" aria-label={t("ปิด")}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="space-y-2 px-4 pt-3">
          {askName && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder={t("ชื่อกลุ่ม")}
              className="w-full rounded-xl border border-outline-variant bg-white px-3.5 py-2.5 text-sm font-semibold"
            />
          )}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("ค้นหาชื่อ ชื่อเล่น หรือรหัสพนักงาน")}
            className="w-full rounded-xl border border-outline-variant bg-surface px-3.5 py-2.5 text-sm"
          />
          {multi && selected.size > 0 && (
            <p className="text-xs font-semibold text-primary">
              {t("เลือกแล้ว")} {selected.size} {t("คน")}
            </p>
          )}
          {!multi && error && <p className="text-sm font-semibold text-status-danger">{error}</p>}
          {!multi && busy && <p className="text-xs text-on-surface-variant">{t("กำลังโหลด...")}</p>}
        </div>
        <div className="mt-2 flex-1 overflow-y-auto px-2 pb-2">
          {!loaded && <p className="p-4 text-center text-sm text-on-surface-variant">{t("กำลังโหลด...")}</p>}
          {loaded && filtered.length === 0 && <p className="p-4 text-center text-sm text-on-surface-variant">{t("ไม่พบพนักงานที่ค้นหา")}</p>}
          {filtered.map((p) => {
            const photo = p.photo_url ? photoMap.get(p.photo_url) : null;
            const checked = selected.has(p.employee_id);
            return (
              <button
                key={p.employee_id}
                onClick={() => toggle(p.employee_id)}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left ${checked ? "bg-primary/10" : "active:bg-surface"}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-[22px] text-on-surface-variant">person</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-on-surface">
                    {displayName(p)} <span className="font-normal text-on-surface-variant">{p.first_name} {p.last_name}</span>
                  </span>
                  <span className="block truncate text-xs text-on-surface-variant">
                    {p.employee_code}
                    {p.job_title ? ` · ${p.job_title}` : ""}
                  </span>
                </span>
                {multi && (
                  <span className={`material-symbols-outlined text-[22px] ${checked ? "text-primary" : "text-outline-variant"}`}>
                    {checked ? "check_circle" : "radio_button_unchecked"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {multi && (
          <div className="safe-bottom border-t border-outline-variant px-4 py-3">
            {error && <p className="mb-2 text-sm font-semibold text-status-danger">{error}</p>}
            <button
              onClick={() => onSubmit(Array.from(selected), name.trim())}
              disabled={!canSubmit}
              className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? t("กำลังบันทึก...") : submitLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
