"use client";

import { useState } from "react";
import { formatThaiId13 } from "@nineall-hr/shared-validation";

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
