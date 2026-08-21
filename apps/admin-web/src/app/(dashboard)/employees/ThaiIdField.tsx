"use client";

import { useState } from "react";

// Thai 13-digit IDs (citizen ID, tax ID, and — for most employees — the Social Security
// Office member number, which is just the citizen ID) are conventionally displayed with
// dashes as 1-2345-67890-12-3. Only auto-formats when there are exactly 13 digits, so a
// foreign hire's passport number (letters, different length) is left exactly as typed.
function formatThaiId13(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 13) return raw.trim();
  return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
}

export function ThaiIdField({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string | null }) {
  const [value, setValue] = useState(() => formatThaiId13(defaultValue ?? ""));

  return (
    <div className="space-y-1">
      <label className="block text-sm font-semibold text-on-surface-variant" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => setValue(formatThaiId13(e.target.value))}
        placeholder="เช่น 1-2345-67890-12-3"
        className="h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}
