"use client";

import { useState, type InputHTMLAttributes } from "react";

// Password field with a show / hide button (owner 2026-10-28), so people can see what they typed.
export function PasswordInput({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${className} pr-12`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
        title={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
        className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
      >
        <span className="material-symbols-outlined text-[22px]">{visible ? "visibility_off" : "visibility"}</span>
      </button>
    </div>
  );
}
