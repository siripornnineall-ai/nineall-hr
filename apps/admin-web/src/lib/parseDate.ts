// Native <input type="date"> only accepts pasted text in exact ISO yyyy-mm-dd format —
// pasting a Thai-style dd/mm/yyyy (or a Buddhist-era year) silently does nothing. This
// normalizes a handful of common pasted formats to ISO so the browser accepts them.
export function parseThaiPastedDate(text: string): string | null {
  const trimmed = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year > 2400) year -= 543; // Buddhist Era -> Gregorian
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
