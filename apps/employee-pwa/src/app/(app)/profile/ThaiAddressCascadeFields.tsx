"use client";

import { useEffect, useState } from "react";
import { getThaiAmphoesAction, getThaiProvincesAction, getThaiTambonsAction } from "./thaiAddressActions";

interface AddressValue {
  province?: string;
  district?: string;
  subDistrict?: string;
  postalCode?: string;
}

// province = จังหวัด, district = อำเภอ/เขต, subDistrict = ตำบล/แขวง. Picking a
// sub-district auto-fills the postal code — Thai zip codes are keyed to sub-district,
// not district, so nothing shorter works.
export function ThaiAddressCascadeFields({
  value,
  onChange,
  disabled,
}: {
  value: AddressValue;
  onChange: (patch: AddressValue) => void;
  disabled?: boolean;
}) {
  const [provinces, setProvinces] = useState<string[]>([]);
  const [amphoes, setAmphoes] = useState<string[]>([]);
  const [tambons, setTambons] = useState<{ tambon: string; zipcode: string }[]>([]);

  useEffect(() => {
    getThaiProvincesAction().then(setProvinces);
  }, []);

  useEffect(() => {
    if (!value.province) {
      setAmphoes([]);
      return;
    }
    getThaiAmphoesAction(value.province).then(setAmphoes);
  }, [value.province]);

  useEffect(() => {
    if (!value.province || !value.district) {
      setTambons([]);
      return;
    }
    getThaiTambonsAction(value.province, value.district).then(setTambons);
  }, [value.province, value.district]);

  return (
    <>
      <div>
        <label className="mb-1 block text-xs text-on-surface-variant">จังหวัด</label>
        <select
          value={value.province ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ province: e.target.value, district: "", subDistrict: "", postalCode: "" })}
          className="w-full rounded-lg border border-outline-variant px-2.5 py-2 text-sm disabled:bg-surface-container-low"
        >
          <option value="">-- เลือกจังหวัด --</option>
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-on-surface-variant">อำเภอ/เขต</label>
        <select
          value={value.district ?? ""}
          disabled={disabled || !value.province}
          onChange={(e) => onChange({ district: e.target.value, subDistrict: "", postalCode: "" })}
          className="w-full rounded-lg border border-outline-variant px-2.5 py-2 text-sm disabled:bg-surface-container-low"
        >
          <option value="">-- เลือกอำเภอ/เขต --</option>
          {amphoes.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-on-surface-variant">ตำบล/แขวง</label>
        <select
          value={value.subDistrict ?? ""}
          disabled={disabled || !value.district}
          onChange={(e) => {
            const match = tambons.find((t) => t.tambon === e.target.value);
            onChange({ subDistrict: e.target.value, postalCode: match?.zipcode ?? "" });
          }}
          className="w-full rounded-lg border border-outline-variant px-2.5 py-2 text-sm disabled:bg-surface-container-low"
        >
          <option value="">-- เลือกตำบล/แขวง --</option>
          {tambons.map((t) => (
            <option key={t.tambon} value={t.tambon}>
              {t.tambon}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-on-surface-variant">รหัสไปรษณีย์</label>
        <input value={value.postalCode ?? ""} readOnly className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-2.5 py-2 text-sm" />
      </div>
    </>
  );
}
