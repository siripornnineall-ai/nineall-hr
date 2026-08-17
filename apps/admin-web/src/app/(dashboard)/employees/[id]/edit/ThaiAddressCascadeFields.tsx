"use client";

import { useEffect, useState } from "react";
import { getThaiAmphoesAction, getThaiProvincesAction, getThaiTambonsAction } from "../../thaiAddressActions";

interface AddressValue {
  province?: string;
  district?: string;
  subDistrict?: string;
  postalCode?: string;
}

// province = จังหวัด, district = อำเภอ/เขต, subDistrict = ตำบล/แขวง. Picking a
// sub-district auto-fills the postal code — that's the whole point of this cascade
// (Thai zip codes are keyed to sub-district, not district, so nothing shorter works).
//
// namePrefix names the <select>s for the surrounding native <form>'s FormData (e.g.
// "idCardProvince"). Disabled <select>s never appear in FormData at all (unlike text
// inputs, there's no readOnly for selects), so the "same as ID card" locked state adds
// parallel hidden inputs carrying the same values instead of relying on the selects.
export function ThaiAddressCascadeFields({
  namePrefix,
  value,
  onChange,
  disabled,
}: {
  namePrefix: string;
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
      {disabled && (
        <>
          <input type="hidden" name={`${namePrefix}Province`} value={value.province ?? ""} />
          <input type="hidden" name={`${namePrefix}District`} value={value.district ?? ""} />
          <input type="hidden" name={`${namePrefix}SubDistrict`} value={value.subDistrict ?? ""} />
          <input type="hidden" name={`${namePrefix}PostalCode`} value={value.postalCode ?? ""} />
        </>
      )}
      <div>
        <label className="mb-1 block text-xs font-semibold text-on-surface-variant">จังหวัด</label>
        <select
          name={disabled ? undefined : `${namePrefix}Province`}
          value={value.province ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ province: e.target.value, district: "", subDistrict: "", postalCode: "" })}
          className="h-10 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm disabled:bg-surface-container-low"
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
        <label className="mb-1 block text-xs font-semibold text-on-surface-variant">อำเภอ/เขต</label>
        <select
          name={disabled ? undefined : `${namePrefix}District`}
          value={value.district ?? ""}
          disabled={disabled || !value.province}
          onChange={(e) => onChange({ district: e.target.value, subDistrict: "", postalCode: "" })}
          className="h-10 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm disabled:bg-surface-container-low"
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
        <label className="mb-1 block text-xs font-semibold text-on-surface-variant">ตำบล/แขวง</label>
        <select
          name={disabled ? undefined : `${namePrefix}SubDistrict`}
          value={value.subDistrict ?? ""}
          disabled={disabled || !value.district}
          onChange={(e) => {
            const match = tambons.find((t) => t.tambon === e.target.value);
            onChange({ subDistrict: e.target.value, postalCode: match?.zipcode ?? "" });
          }}
          className="h-10 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm disabled:bg-surface-container-low"
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
        <label className="mb-1 block text-xs font-semibold text-on-surface-variant">รหัสไปรษณีย์</label>
        <input
          name={disabled ? undefined : `${namePrefix}PostalCode`}
          value={value.postalCode ?? ""}
          readOnly
          className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm"
        />
      </div>
    </>
  );
}
