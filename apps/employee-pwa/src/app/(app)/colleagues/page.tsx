"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface Colleague {
  employee_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  photo_url: string | null;
  job_title: string | null;
}

export default function ColleaguesPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [photoMap, setPhotoMap] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase
      .rpc("get_colleague_directory")
      .then(async ({ data, error }) => {
        if (error || !data) {
          setLoaded(true);
          return;
        }
        const rows = data as Colleague[];
        const paths = Array.from(new Set(rows.map((r) => r.photo_url).filter((p): p is string => !!p)));
        const map = new Map<string, string>();
        if (paths.length > 0) {
          const { data: signed } = await supabase.storage.from("avatars").createSignedUrls(paths, 3600);
          for (const item of signed ?? []) {
            if (item.signedUrl && item.path) map.set(item.path, item.signedUrl);
          }
        }
        setPhotoMap(map);
        setColleagues(rows);
        setLoaded(true);
      });
  }, [profile, supabase]);

  const filtered = colleagues.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      (c.nickname ?? "").toLowerCase().includes(q) ||
      c.employee_code.toLowerCase().includes(q)
    );
  });

  return (
    <div className="safe-top space-y-4 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">เพื่อนร่วมงาน</h1>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ค้นหาชื่อ ชื่อเล่น หรือรหัสพนักงาน"
        className="w-full rounded-xl border border-outline-variant bg-white px-3.5 py-2.5 text-sm"
      />

      {!loaded && (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-5 text-sm text-on-surface-variant shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
          กำลังโหลด...
        </div>
      )}

      {loaded && (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((c) => {
            const isSelf = c.employee_id === profile?.employeeId;
            const photoUrl = c.photo_url ? photoMap.get(c.photo_url) : null;
            return (
              <Link
                key={c.employee_id}
                href={`/colleagues/${c.employee_id}`}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-white p-4 text-center shadow-[0_4px_20px_rgba(0,0,0,0.05)] active:scale-95 transition-transform"
              >
                <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container">
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-[28px] text-on-surface-variant">person</span>
                  )}
                </span>
                <p className="text-sm font-bold text-on-surface">
                  {c.nickname || c.first_name}
                  {isSelf && <span className="ml-1 text-xs font-normal text-primary">(คุณ)</span>}
                </p>
                <p className="text-xs text-on-surface-variant">{c.employee_code}</p>
              </Link>
            );
          })}
          {filtered.length === 0 && <p className="col-span-2 py-6 text-center text-sm text-on-surface-variant">ไม่พบพนักงานที่ค้นหา</p>}
        </div>
      )}
    </div>
  );
}
