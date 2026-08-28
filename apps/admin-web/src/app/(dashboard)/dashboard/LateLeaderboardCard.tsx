import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import type { LateLeaderboardRow } from "@/lib/queries/engagement";

const MEDALS = ["🥇", "🥈", "🥉"];

export function LateLeaderboardCard({ rows }: { rows: LateLeaderboardRow[] }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-bold">ท็อป 3 มาสายประจำเดือน</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant">เดือนนี้ยังไม่มีใครมาสาย</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, i) => (
            <li key={row.employeeId}>
              <Link
                href={`/attendance/${row.employeeId}`}
                className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-row-hover"
              >
                <span className="w-6 text-center text-lg">{MEDALS[i]}</span>
                <Avatar url={row.photoUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{row.nickname || row.name}</p>
                  <p className="text-xs text-on-surface-variant">
                    รวม {(row.totalLateMinutes / 60).toFixed(1)} ชม. ({row.lateDays} วัน เฉลี่ยวันละ {Math.round(row.totalLateMinutes / row.lateDays)} นาที)
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
