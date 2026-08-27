// HR always types/reads times as Thai local time, but this app runs on servers whose own
// clock is UTC (Vercel) — a bare "YYYY-MM-DDTHH:MM:00" string is parsed by JS as the
// *server's* local time, silently shifting every manually-entered time by 7 hours. Always
// go through this helper (never `new Date(\`${date}T${time}\`)` directly) when turning a
// Thai wall-clock date+time into a real instant.
export function parseBangkokDateTime(workDate: string, hhmm: string): Date {
  return new Date(`${workDate}T${hhmm}:00+07:00`);
}
