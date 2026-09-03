"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { isAnnouncementVisibleTo } from "@/lib/announcementVisibility";

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  publish_at: string;
  expire_at: string | null;
  target_type: string;
  target_ids: string[];
}

// Full-width ticker strip above the home header, showing the single most recent
// announcement currently visible to this employee (same publish/expire/target rules as
// the announcements list). Admin controls how long it shows via the announcement's own
// publish_at/expire_at — nothing new needed there.
export function AnnouncementBanner() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [announcement, setAnnouncement] = useState<AnnouncementRow | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [marqueeDistance, setMarqueeDistance] = useState<number | null>(null);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const nowIso = new Date().toISOString();
      const [{ data: employee }, { data: rows }] = await Promise.all([
        supabase.from("employees").select("department_id, team_id, branch_id").eq("id", profile.employeeId).maybeSingle(),
        supabase
          .from("announcements")
          .select("id, title, body, publish_at, expire_at, target_type, target_ids")
          .eq("org_id", profile.orgId)
          .eq("status", "published")
          .lte("publish_at", nowIso)
          .order("publish_at", { ascending: false }),
      ]);

      const visible = (rows ?? []).filter((a) =>
        isAnnouncementVisibleTo(
          { targetType: a.target_type, targetIds: a.target_ids, expireAt: a.expire_at },
          {
            employeeId: profile.employeeId,
            departmentId: employee?.department_id ?? null,
            teamId: employee?.team_id ?? null,
            branchId: employee?.branch_id ?? null,
          }
        )
      );
      setAnnouncement(visible[0] ?? null);
    })();
  }, [profile, supabase]);

  useEffect(() => {
    if (!announcement || !containerRef.current || !textRef.current) return;
    const overflow = textRef.current.scrollWidth - containerRef.current.clientWidth;
    setMarqueeDistance(overflow > 0 ? -overflow - 12 : null);
  }, [announcement]);

  if (!announcement) return null;

  return (
    <Link
      href={`/announcements/${announcement.id}`}
      className="block overflow-hidden bg-status-warning px-0 py-2"
    >
      <div ref={containerRef} className="overflow-hidden whitespace-nowrap px-4">
        <span
          ref={textRef}
          className={`inline-flex items-center gap-2 text-sm font-bold text-white ${marqueeDistance ? "animate-marquee-bounce" : ""}`}
          style={marqueeDistance ? ({ "--marquee-distance": `${marqueeDistance}px` } as React.CSSProperties) : undefined}
        >
          <span className="material-symbols-outlined text-[16px]">campaign</span>
          {announcement.title} — {announcement.body}
        </span>
      </div>
    </Link>
  );
}
