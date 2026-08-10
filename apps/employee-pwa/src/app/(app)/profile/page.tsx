"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const { profile, signOut } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [newPassword, setNewPassword] = useState("");
  const [changing, setChanging] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function handleChangePassword() {
    setMessage(null);
    if (newPassword.length < 8) {
      setMessage({ type: "error", text: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" });
      return;
    }
    setChanging(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error && profile) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", profile.profileId);
    }
    setChanging(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setNewPassword("");
      setMessage({ type: "success", text: "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว" });
    }
  }

  return (
    <div className="safe-top space-y-5 px-4 pb-6 pt-4">
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center justify-center rounded-full bg-primary-container" style={{ width: 72, height: 72 }}>
          <span className="material-symbols-outlined text-[36px] text-white">person</span>
        </div>
        <p className="mt-1 text-lg font-bold text-on-surface">{profile?.fullName}</p>
        <p className="text-sm text-on-surface-variant">{profile?.employeeCode}</p>
      </div>

      {profile?.mustChangePassword && (
        <div className="flex items-center gap-2 rounded-xl bg-status-warning-bg p-3">
          <span className="material-symbols-outlined text-status-warning">warning</span>
          <p className="text-xs text-on-surface">กรุณาเปลี่ยนรหัสผ่านก่อนใช้งานครั้งแรก</p>
        </div>
      )}

      <div className="space-y-3 rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <h2 className="font-bold text-on-surface">เปลี่ยนรหัสผ่าน</h2>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)"
          className="w-full rounded-xl border border-outline-variant px-3.5 py-2.5 text-sm"
        />
        {message && (
          <p className={`text-sm font-semibold ${message.type === "error" ? "text-status-danger" : "text-status-success"}`}>{message.text}</p>
        )}
        <button onClick={handleChangePassword} disabled={changing} className="h-11 w-full rounded-xl bg-primary font-bold text-white disabled:opacity-60">
          {changing ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}
        </button>
      </div>

      <div className="space-y-2 rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <h2 className="font-bold text-on-surface">ความเป็นส่วนตัว</h2>
        <p className="text-xs leading-relaxed text-on-surface-variant">
          แอปนี้เก็บข้อมูลตำแหน่ง GPS และภาพเซลฟีเฉพาะขณะลงเวลาเข้า-ออกงานเท่านั้น ไม่มีการติดตามตำแหน่งพนักงานตลอดเวลา ข้อมูลเงินเดือนและเอกสารส่วนตัว
          จัดเก็บแบบส่วนตัว (Private Storage) และเข้าถึงได้เฉพาะผู้ที่เกี่ยวข้องเท่านั้น
        </p>
      </div>

      <button onClick={() => signOut()} className="flex w-full items-center justify-center gap-2 py-3 font-bold text-status-danger">
        <span className="material-symbols-outlined text-[18px]">logout</span>
        ออกจากระบบ
      </button>
    </div>
  );
}
