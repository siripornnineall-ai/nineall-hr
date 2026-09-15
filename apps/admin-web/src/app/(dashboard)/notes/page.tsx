import Link from "next/link";
import clsx from "clsx";
import { requireUser } from "@/lib/auth";
import { getEmployeeNotes, type EmployeeNoteRow, type NotePerson } from "@/lib/queries/engagement";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";

// Same 24h window the employee app shows by default; "ทั้งหมด" widens to 30 days since
// nothing is ever deleted server-side and HR sometimes wants to look back at what was said.
const RANGES = [
  { key: "24h", label: "24 ชม. ล่าสุด", hours: 24 },
  { key: "7d", label: "7 วัน", hours: 24 * 7 },
  { key: "30d", label: "30 วัน", hours: 24 * 30 },
] as const;

function formatBangkok(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function displayName(p: NotePerson): string {
  return p.nickname || p.name;
}

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireUser();
  const { range: rangeKey } = await searchParams;
  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[0];
  const notes = await getEmployeeNotes({ sinceHours: range.hours });

  return (
    <>
      <Topbar title="โน้ตพนักงาน" subtitle="สิ่งที่พนักงานโพสต์ในแอป พร้อมรีแอคชันและคอมเมนต์ (อ่านอย่างเดียว)" />
      <div className="space-y-4 p-4 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={r.key === RANGES[0].key ? "/notes" : `/notes?range=${r.key}`}
              className={clsx(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                r.key === range.key ? "border-primary bg-primary font-bold text-white" : "border-outline-variant text-on-surface-variant hover:border-primary"
              )}
            >
              {r.label}
            </Link>
          ))}
          <span className="ml-auto text-sm text-on-surface-variant">{notes.length} โน้ต</span>
        </div>

        {notes.length === 0 ? (
          <p className="text-sm text-on-surface-variant">ยังไม่มีโน้ตในช่วงเวลานี้</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function NoteCard({ note }: { note: EmployeeNoteRow }) {
  // Group identical emojis so "❤️ ×3 👍 ×1" reads at a glance; names show on hover.
  const grouped = new Map<string, NotePerson[]>();
  for (const r of note.reactions) grouped.set(r.emoji, [...(grouped.get(r.emoji) ?? []), r.by]);

  return (
    <article className="rounded-xl border border-outline-variant bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <Link href={`/employees/${note.author.employeeId}`}>
          <Avatar url={note.author.photoUrl} size={44} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <Link href={`/employees/${note.author.employeeId}`} className="truncate font-bold hover:underline">
              {displayName(note.author)}
              {note.author.nickname && <span className="ml-1 text-xs font-normal text-on-surface-variant">{note.author.name}</span>}
            </Link>
            <span className="shrink-0 text-xs text-on-surface-variant">{formatBangkok(note.createdAt)}</span>
          </div>
          <p className="mt-2 whitespace-pre-line rounded-2xl rounded-tl-sm bg-surface-container px-4 py-3 text-sm">{note.text}</p>

          {grouped.size > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {Array.from(grouped.entries()).map(([emoji, people]) => (
                <span
                  key={emoji}
                  title={people.map(displayName).join(", ")}
                  className="rounded-full border border-outline-variant px-2.5 py-0.5 text-sm"
                >
                  {emoji} <span className="text-xs text-on-surface-variant">{people.length}</span>
                </span>
              ))}
            </div>
          )}

          {note.comments.length > 0 && (
            <ul className="mt-3 space-y-2 border-t border-outline-variant pt-3">
              {note.comments.map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  <Avatar url={c.by.photoUrl} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-semibold">{displayName(c.by)}</span>{" "}
                      <span className="text-on-surface-variant">{c.text}</span>
                    </p>
                    <p className="text-[11px] text-on-surface-variant">{formatBangkok(c.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}
