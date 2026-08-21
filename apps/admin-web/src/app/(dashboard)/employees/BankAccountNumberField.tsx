"use client";

import { useState } from "react";
import { formatThaiBankAccount } from "@nineall-hr/shared-validation";

export function BankAccountNumberField({ defaultValue }: { defaultValue?: string | null }) {
  const [value, setValue] = useState(() => formatThaiBankAccount(defaultValue ?? ""));

  return (
    <div className="space-y-1">
      <label className="block text-sm font-semibold text-on-surface-variant" htmlFor="bankAccountNumber">
        เลขที่บัญชี
      </label>
      <input
        id="bankAccountNumber"
        name="bankAccountNumber"
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => setValue(formatThaiBankAccount(e.target.value))}
        className="h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}
