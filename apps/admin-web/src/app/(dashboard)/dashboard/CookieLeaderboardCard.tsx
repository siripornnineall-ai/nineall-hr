"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import type { CookieLeaderboardRow } from "@/lib/queries/engagement";

const MEDALS = ["🥇", "🥈", "🥉"];
const TOP_COUNT = 3;

export function CookieLeaderboardCard({ rows }: { rows: CookieLeaderboardRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const topRows = rows.slice(0, TOP_COUNT);
  const restRows = rows.slice(TOP_COUNT);

  return (
    <div className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-bold">ท็อป 3 รางวัลคนมีน้ำใจ 🍪</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant">ยังไม่มีใครได้รับคุกกี้</p>
      ) : (
        <>
          <ul className="space-y-3">
            {topRows.map((row, i) => (
              <LeaderboardRow key={row.employeeId} row={row} rank={i + 1} medal={MEDALS[i]} />
            ))}
          </ul>

          {restRows.length > 0 && (
            <>
              {expanded && (
                <ul className="mt-3 space-y-3 border-t border-outline-variant pt-3">
                  {restRows.map((row, i) => (
                    <LeaderboardRow key={row.employeeId} row={row} rank={i + TOP_COUNT + 1} />
                  ))}
                </ul>
              )}
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-4 flex w-full items-center justify-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                {expanded ? "ซ่อน" : `ดูเพิ่มเติม (อีก ${restRows.length} คน)`}
                <span className="material-symbols-outlined text-[16px]">{expanded ? "expand_less" : "expand_more"}</span>
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

function LeaderboardRow({ row, rank, medal }: { row: CookieLeaderboardRow; rank: number; medal?: string }) {
  return (
    <li className="flex items-center gap-3 rounded-lg p-2">
      <span className="w-6 text-center text-lg">{medal ?? <span className="text-sm font-bold text-on-surface-variant">{rank}</span>}</span>
      <Avatar url={row.photoUrl} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{row.nickname || row.name}</p>
        <p className="text-xs text-on-surface-variant">ได้รับ {row.totalCookies} คุกกี้</p>
      </div>
    </li>
  );
}
