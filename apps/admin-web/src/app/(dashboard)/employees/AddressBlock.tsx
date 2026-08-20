"use client";

import { ThaiAddressCascadeFields } from "./[id]/edit/ThaiAddressCascadeFields";

export interface AddressValue {
  houseNo?: string;
  moo?: string;
  soi?: string;
  yaek?: string;
  road?: string;
  subDistrict?: string;
  district?: string;
  province?: string;
  postalCode?: string;
}

// Free-text sub-fields only — province/district/subDistrict/postalCode are handled by
// the cascading selects in ThaiAddressCascadeFields instead.
const ADDRESS_TEXT_FIELDS: { key: keyof AddressValue; label: string }[] = [
  { key: "houseNo", label: "เลขที่" },
  { key: "moo", label: "หมู่ที่" },
  { key: "soi", label: "ตรอก/ซอย" },
  { key: "yaek", label: "แยก" },
  { key: "road", label: "ถนน" },
];

function capitalize(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// Shared between the create and edit employee forms — both need the same
// house-number/road/cascading-province-district-subdistrict block, twice
// (ID-card address + current address).
export function AddressBlock({
  namePrefix,
  value,
  onChange,
  disabled,
}: {
  namePrefix: "idCard" | "current";
  value: AddressValue;
  onChange: (patch: Partial<AddressValue>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {ADDRESS_TEXT_FIELDS.map((f) => (
        <AddressTextField
          key={f.key}
          label={f.label}
          name={`${namePrefix}${capitalize(f.key)}`}
          value={value[f.key] ?? ""}
          onChange={(v) => onChange({ [f.key]: v })}
          disabled={disabled}
        />
      ))}
      <ThaiAddressCascadeFields namePrefix={namePrefix} value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function AddressTextField({
  label,
  name,
  value,
  onChange,
  disabled,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-on-surface-variant" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={disabled}
        className="h-10 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary read-only:bg-surface-container-low"
      />
    </div>
  );
}
