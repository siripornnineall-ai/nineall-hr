// OT is tallied on a cutoff separate from the calendar month: the company only pays out OT
// worked through the 25th — anything from the 26th onward rolls into next month's payroll
// instead (see calculatePayrollRunAction). `monthKey` names a cutoff window by the month its
// 25th falls in, e.g. "2026-08" -> 2026-07-26 through 2026-08-25.
export function getOtCutoffWindow(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1, 25)).toISOString().slice(0, 10);
  const start = new Date(Date.UTC(y, m - 2, 26)).toISOString().slice(0, 10);
  return { start, end };
}

// The cutoff window whose 25th "now" falls on or before — e.g. on the 26th or later, today
// already belongs to next month's window.
export function currentOtCutoffMonthKey(): string {
  const now = new Date();
  const monthIndex = now.getUTCDate() > 25 ? now.getUTCMonth() + 1 : now.getUTCMonth();
  const d = new Date(Date.UTC(now.getUTCFullYear(), monthIndex, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftOtCutoffMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
