"use client";

import { THAI_BANKS } from "@/lib/thaiBanks";

export function BankNameSelect({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-semibold text-on-surface-variant" htmlFor={name}>
        ธนาคาร
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        className="h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm"
      >
        <option value="">-- เลือกธนาคาร --</option>
        {THAI_BANKS.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
    </div>
  );
}
