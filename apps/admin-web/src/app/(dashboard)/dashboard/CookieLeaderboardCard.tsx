import { Avatar } from "@/components/Avatar";
import type { CookieLeaderboardRow } from "@/lib/queries/engagement";

const MEDALS = ["🥇", "🥈", "🥉"];

export function CookieLeaderboardCard({ rows }: { rows: CookieLeaderboardRow[] }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-bold">ท็อป 3 รางวัลคนมีน้ำใจ 🍪</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant">ยังไม่มีใครได้รับคุกกี้</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, i) => (
            <li key={row.employeeId} className="flex items-center gap-3 rounded-lg p-2">
              <span className="w-6 text-center text-lg">{MEDALS[i]}</span>
              <Avatar url={row.photoUrl} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{row.nickname || row.name}</p>
                <p className="text-xs text-on-surface-variant">ได้รับ {row.totalCookies} คุกกี้</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
