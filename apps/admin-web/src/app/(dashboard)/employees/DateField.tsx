"use client";

import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { parseThaiPastedDate } from "@/lib/parseDate";

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function formatThai(iso: string): string | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${Number(d)} ${THAI_MONTHS[Number(mo) - 1]} ${Number(y) + 543}`;
}

// Two inputs behind one field:
// - A plain text input for typing/pasting. Native <input type="date"> has inconsistent,
//   sometimes completely broken paste handling across browsers (confirmed live: pasting
//   into one silently did nothing). Plain text always accepts paste; parseThaiPastedDate
//   normalizes ISO, dd/mm/yyyy and Buddhist-era years to ISO on paste and on blur.
// - A native <input type="date"> laid invisibly over the calendar button, so tapping the
//   button opens the browser's own date picker without any showPicker() support checks
//   (a real click on a date input opens the picker in every browser that has one).
//   Picking a date writes ISO straight into the shared value.
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
  const pickerRef = useRef<HTMLInputElement>(null);

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

  const isoValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  const thai = isoValue ? formatThai(isoValue) : null;

  return (
    <div className="space-y-1">
      <label className="block text-sm font-semibold text-on-surface-variant" htmlFor={name}>
        {label}
        {required && <span className="text-primary"> *</span>}
      </label>
      <div className="flex h-11 w-full items-stretch overflow-hidden rounded-lg border border-outline-variant bg-surface focus-within:border-primary">
        <input
          id={name}
          name={name}
          type="text"
          inputMode="numeric"
          required={required}
          value={value}
          placeholder="เลือกจากปฏิทิน หรือพิมพ์ 20/08/2569"
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
          className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
        />
        <div
          className="relative flex w-11 shrink-0 items-center justify-center border-l border-outline-variant text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
          title="เลือกวันที่จากปฏิทิน"
        >
          <CalendarDays size={18} aria-hidden="true" />
          <input
            ref={pickerRef}
            type="date"
            aria-label={`เลือก${label}จากปฏิทิน`}
            tabIndex={-1}
            value={isoValue}
            onChange={(e) => {
              if (!e.target.value) return;
              setValue(e.target.value);
              setError(null);
            }}
            onClick={() => {
              // Chrome/Edge open the picker only via showPicker() when the input is
              // covered by other content; other browsers open it from the click itself.
              try {
                pickerRef.current?.showPicker?.();
              } catch {
                /* browser opened the picker natively or doesn't support showPicker */
              }
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
      </div>
      {error ? (
        <p className="text-xs text-status-danger">{error}</p>
      ) : thai ? (
        <p className="text-xs text-on-surface-variant">{thai}</p>
      ) : (
        <p className="text-xs text-on-surface-variant">กดไอคอนปฏิทินเพื่อเลือกวันที่ หรือวางวันที่ เช่น 20/08/2569</p>
      )}
    </div>
  );
}
