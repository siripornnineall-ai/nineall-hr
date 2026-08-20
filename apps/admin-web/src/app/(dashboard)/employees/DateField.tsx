"use client";

import { useState } from "react";
import { parseThaiPastedDate } from "@/lib/parseDate";

// A plain text input rather than <input type="date"> — native date inputs have
// inconsistent, sometimes completely broken paste handling across browsers (confirmed
// live: pasting into one silently did nothing even though a scripted paste event
// worked fine in testing, since a real OS paste doesn't always route through the same
// code path browsers use for a programmatically dispatched ClipboardEvent). A plain
// text input always accepts paste with no special-casing needed; parseThaiPastedDate
// normalizes whatever format comes in (ISO, dd/mm/yyyy, Buddhist-era year) to ISO,
// both instantly on paste and on blur for anything typed by hand.
export function DateField({
  label,
  name,
  required,
  defaultValue,
  value: controlledValue,
  onChange,
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const value = controlledValue ?? internalValue;
  const setValue = onChange ?? setInternalValue;
  const [error, setError] = useState<string | null>(null);

  function normalize(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      setValue("");
      setError(null);
      return;
    }
    const parsed = parseThaiPastedDate(trimmed);
    if (parsed) {
      setValue(parsed);
      setError(null);
    } else {
      setError("รูปแบบวันที่ไม่ถูกต้อง ลองใหม่ เช่น 20/08/2569 หรือ 2026-08-20");
    }
  }

  return (
    <div className="space-y-1">
      <label className="block text-sm font-semibold text-on-surface-variant" htmlFor={name}>
        {label}
        {required && <span className="text-primary"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type="text"
        inputMode="numeric"
        required={required}
        value={value}
        placeholder="เช่น 20/08/2569 หรือ 2026-08-20"
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(null);
        }}
        onBlur={(e) => normalize(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          const parsed = parseThaiPastedDate(pasted);
          if (parsed) {
            e.preventDefault();
            setValue(parsed);
            setError(null);
          }
        }}
        className="h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary"
      />
      {error ? (
        <p className="text-xs text-status-danger">{error}</p>
      ) : (
        <p className="text-xs text-on-surface-variant">วางวันที่ได้ เช่น 20/08/2569 หรือ 2026-08-20</p>
      )}
    </div>
  );
}
