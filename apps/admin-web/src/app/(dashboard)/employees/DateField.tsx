"use client";

import { useState } from "react";
import { parseThaiPastedDate } from "@/lib/parseDate";

// Wraps a native <input type="date"> with paste support for common pasted formats
// (dd/mm/yyyy, Buddhist-era years) that the bare browser control silently rejects.
// Self-manages its value by default (for plain <form action={serverAction}> usage,
// read back via FormData by `name`); pass value+onChange to run it controlled instead
// (needed when the surrounding form isn't FormData-based, e.g. a plain object payload).
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

  return (
    <div className="space-y-1">
      <label className="block text-sm font-semibold text-on-surface-variant" htmlFor={name}>
        {label}
        {required && <span className="text-primary"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type="date"
        required={required}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPaste={(e) => {
          const parsed = parseThaiPastedDate(e.clipboardData.getData("text"));
          if (parsed) {
            e.preventDefault();
            setValue(parsed);
          }
        }}
        className="h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary"
      />
      <p className="text-xs text-on-surface-variant">วางวันที่ได้ เช่น 20/08/2569 หรือ 2026-08-20</p>
    </div>
  );
}
