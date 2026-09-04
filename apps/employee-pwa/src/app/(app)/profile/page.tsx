"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { ThaiAddressCascadeFields } from "./ThaiAddressCascadeFields";
import { formatThaiId13 } from "@nineall-hr/shared-validation";

interface AddressValue {
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

interface EditableProfile {
  firstName: string;
  lastName: string;
  nickname: string;
  phone: string;
  bio: string;
  photoUrl: string | null;
  taxId: string;
  socialSecurityId: string;
  idCardAddress: AddressValue;
  currentAddress: AddressValue;
}

type Section = "basic" | "idCardAddress" | "currentAddress" | "taxInfo" | "password" | "privacy";

// Free-text sub-fields only — province/district/subDistrict/postalCode are handled by
// the cascading selects in ThaiAddressCascadeFields instead.
const ADDRESS_TEXT_FIELDS: { key: keyof AddressValue; label: string }[] = [
  { key: "houseNo", label: "เลขที่" },
  { key: "moo", label: "หมู่ที่" },
  { key: "soi", label: "ตรอก/ซอย" },
  { key: "yaek", label: "แยก" },
  { key: "road", label: "ถนน" },
];

const MENU_ITEMS: { section: Section; icon: string; label: string }[] = [
  { section: "basic", icon: "person", label: "ข้อมูลส่วนตัว" },
  { section: "idCardAddress", icon: "badge", label: "ที่อยู่ตามบัตรประชาชน" },
  { section: "currentAddress", icon: "home", label: "ที่อยู่ปัจจุบัน" },
  { section: "taxInfo", icon: "request_quote", label: "เลขผู้เสียภาษี / ประกันสังคม" },
  { section: "password", icon: "lock", label: "เปลี่ยนรหัสผ่าน" },
  { section: "privacy", icon: "privacy_tip", label: "ความเป็นส่วนตัว" },
];

export default function ProfilePage() {
  const { profile, loading: authLoading, signOut, refreshProfile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [openSection, setOpenSection] = useState<Section | null>(null);

  const [edit, setEdit] = useState<EditableProfile | null>(null);
  const [editLoadFailed, setEditLoadFailed] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const [sameAsIdCard, setSameAsIdCard] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [changing, setChanging] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    if (!profile) return;
    setEditLoadFailed(false);
    supabase
      .from("employees")
      .select("first_name, last_name, nickname, phone, bio, photo_url, tax_id, social_security_id, id_card_address, current_address")
      .eq("id", profile.employeeId)
      .single()
      .then(async ({ data, error }) => {
        if (error || !data) {
          setEditLoadFailed(true);
          return;
        }
        setEdit({
          firstName: data.first_name ?? "",
          lastName: data.last_name ?? "",
          nickname: data.nickname ?? "",
          phone: data.phone ?? "",
          bio: data.bio ?? "",
          photoUrl: data.photo_url,
          taxId: data.tax_id ?? "",
          socialSecurityId: data.social_security_id ?? "",
          idCardAddress: (data.id_card_address as AddressValue | null) ?? {},
          currentAddress: (data.current_address as AddressValue | null) ?? {},
        });
        if (data.photo_url) {
          const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(data.photo_url, 3600);
          if (signed) setPhotoPreview(signed.signedUrl);
        }
      });
  }, [profile, supabase]);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile || !edit) return;
    setUploadingPhoto(true);
    setProfileMessage(null);
    try {
      const path = `${profile.orgId}/${profile.employeeId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);

      const { error: updateError } = await supabase.from("employees").update({ photo_url: path }).eq("id", profile.employeeId);
      if (updateError) throw new Error(updateError.message);

      const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(path, 3600);
      setPhotoPreview(signed?.signedUrl ?? null);
      setEdit({ ...edit, photoUrl: path });
      await refreshProfile();
      setProfileMessage({ type: "success", text: "เปลี่ยนรูปโปรไฟล์แล้ว" });
    } catch (err) {
      setProfileMessage({ type: "error", text: err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ" });
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  }

  async function handleSaveProfile() {
    if (!profile || !edit) return;
    setProfileMessage(null);
    if (!edit.firstName.trim() || !edit.lastName.trim()) {
      setProfileMessage({ type: "error", text: "กรุณากรอกชื่อและนามสกุล" });
      return;
    }
    setSavingProfile(true);
    const { error } = await supabase
      .from("employees")
      .update({
        first_name: edit.firstName.trim(),
        last_name: edit.lastName.trim(),
        nickname: edit.nickname.trim() || null,
        phone: edit.phone.trim() || null,
        bio: edit.bio.trim() || null,
        id_card_address: Object.keys(edit.idCardAddress).length > 0 ? edit.idCardAddress : null,
        current_address: Object.keys(edit.currentAddress).length > 0 ? edit.currentAddress : null,
      })
      .eq("id", profile.employeeId);
    setSavingProfile(false);
    if (error) {
      setProfileMessage({ type: "error", text: error.message });
      return;
    }
    setProfileMessage({ type: "success", text: "บันทึกข้อมูลแล้ว" });
    await refreshProfile();
    setTimeout(() => setOpenSection(null), 700);
  }

  function updateIdCardAddress(key: keyof AddressValue, value: string) {
    patchIdCardAddress({ [key]: value });
  }

  function patchIdCardAddress(patch: Partial<AddressValue>) {
    if (!edit) return;
    const nextIdCard = { ...edit.idCardAddress, ...patch };
    setEdit({ ...edit, idCardAddress: nextIdCard, currentAddress: sameAsIdCard ? nextIdCard : edit.currentAddress });
  }

  function toggleSameAsIdCard(checked: boolean) {
    setSameAsIdCard(checked);
    if (checked && edit) setEdit({ ...edit, currentAddress: edit.idCardAddress });
  }

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
      setTimeout(() => setOpenSection(null), 700);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="safe-top space-y-5 px-4 pb-6 pt-4">
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingPhoto}
          className="relative flex items-center justify-center overflow-hidden rounded-full bg-primary-container"
          style={{ width: 88, height: 88 }}
        >
          {photoPreview ? (
            <Image src={photoPreview} alt="" fill className="object-cover" unoptimized />
          ) : (
            <span className="material-symbols-outlined text-[44px] text-white">person</span>
          )}
          <div className="absolute inset-0 flex items-end justify-center bg-black/30 pb-1 opacity-0 transition-opacity hover:opacity-100">
            <span className="material-symbols-outlined text-[18px] text-white">{uploadingPhoto ? "progress_activity" : "photo_camera"}</span>
          </div>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
        <p className="mt-1 text-lg font-bold text-on-surface">{profile?.fullName}</p>
        <p className="text-sm text-on-surface-variant">{profile?.employeeCode}</p>
        <button onClick={() => fileInputRef.current?.click()} className="text-xs font-semibold text-secondary">
          เปลี่ยนรูปโปรไฟล์
        </button>
      </div>

      {profile?.mustChangePassword && (
        <div className="flex items-center gap-2 rounded-xl bg-status-warning-bg p-3">
          <span className="material-symbols-outlined text-status-warning">warning</span>
          <p className="text-xs text-on-surface">กรุณาเปลี่ยนรหัสผ่านก่อนใช้งานครั้งแรก</p>
        </div>
      )}

      {!edit && !editLoadFailed && (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-5 text-sm text-on-surface-variant shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
          กำลังโหลดข้อมูลส่วนตัว...
        </div>
      )}

      {editLoadFailed && (
        <div className="rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <p className="text-sm text-status-danger">โหลดข้อมูลส่วนตัวไม่สำเร็จ กรุณารีเฟรชหน้านี้ใหม่</p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        {MENU_ITEMS.map((item, i) => (
          <button
            key={item.section}
            onClick={() => setOpenSection(item.section)}
            className={`flex w-full items-center gap-3 px-4 py-3.5 text-left ${i > 0 ? "border-t border-outline-variant" : ""}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <span className="material-symbols-outlined text-[18px] text-primary">{item.icon}</span>
            </span>
            <span className="flex-1 text-sm font-semibold text-on-surface">{item.label}</span>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">chevron_right</span>
          </button>
        ))}
      </div>

      <button onClick={() => signOut()} className="flex w-full items-center justify-center gap-2 py-3 font-bold text-status-danger">
        <span className="material-symbols-outlined text-[18px]">logout</span>
        ออกจากระบบ
      </button>

      {openSection && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setOpenSection(null)}>
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.2)] sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-on-surface">{MENU_ITEMS.find((m) => m.section === openSection)?.label}</h2>
              <button onClick={() => setOpenSection(null)} className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">close</span>
              </button>
            </div>

            {openSection === "basic" && edit && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-on-surface-variant">ชื่อ</label>
                    <input
                      value={edit.firstName}
                      onChange={(e) => setEdit({ ...edit, firstName: e.target.value })}
                      className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-on-surface-variant">นามสกุล</label>
                    <input
                      value={edit.lastName}
                      onChange={(e) => setEdit({ ...edit, lastName: e.target.value })}
                      className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-on-surface-variant">ชื่อเล่น</label>
                  <input
                    value={edit.nickname}
                    onChange={(e) => setEdit({ ...edit, nickname: e.target.value })}
                    className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-on-surface-variant">เบอร์โทร</label>
                  <input
                    type="tel"
                    value={edit.phone}
                    onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                    className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-on-surface-variant">แนะนำตัว (ไม่บังคับ)</label>
                  <textarea
                    value={edit.bio}
                    onChange={(e) => setEdit({ ...edit, bio: e.target.value })}
                    rows={3}
                    placeholder="เล่าอะไรเกี่ยวกับตัวคุณสักหน่อย..."
                    className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
                  />
                </div>
                {profileMessage && (
                  <p className={`text-sm font-semibold ${profileMessage.type === "error" ? "text-status-danger" : "text-status-success"}`}>
                    {profileMessage.text}
                  </p>
                )}
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="h-11 w-full rounded-xl bg-primary font-bold text-white disabled:opacity-60"
                >
                  {savingProfile ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              </div>
            )}

            {openSection === "idCardAddress" && edit && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {ADDRESS_TEXT_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="mb-1 block text-xs text-on-surface-variant">{f.label}</label>
                      <input
                        value={edit.idCardAddress[f.key] ?? ""}
                        onChange={(e) => updateIdCardAddress(f.key, e.target.value)}
                        className="w-full rounded-lg border border-outline-variant px-2.5 py-2 text-sm"
                      />
                    </div>
                  ))}
                  <ThaiAddressCascadeFields value={edit.idCardAddress} onChange={patchIdCardAddress} />
                </div>
                {profileMessage && (
                  <p className={`text-sm font-semibold ${profileMessage.type === "error" ? "text-status-danger" : "text-status-success"}`}>
                    {profileMessage.text}
                  </p>
                )}
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="h-11 w-full rounded-xl bg-primary font-bold text-white disabled:opacity-60"
                >
                  {savingProfile ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              </div>
            )}

            {openSection === "currentAddress" && edit && (
              <div className="space-y-3">
                <label className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                  <input type="checkbox" checked={sameAsIdCard} onChange={(e) => toggleSameAsIdCard(e.target.checked)} />
                  เหมือนที่อยู่ตามบัตรประชาชน
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ADDRESS_TEXT_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="mb-1 block text-xs text-on-surface-variant">{f.label}</label>
                      <input
                        value={edit.currentAddress[f.key] ?? ""}
                        onChange={(e) => setEdit({ ...edit, currentAddress: { ...edit.currentAddress, [f.key]: e.target.value } })}
                        readOnly={sameAsIdCard}
                        className="w-full rounded-lg border border-outline-variant px-2.5 py-2 text-sm read-only:bg-surface-container-low"
                      />
                    </div>
                  ))}
                  <ThaiAddressCascadeFields
                    value={edit.currentAddress}
                    onChange={(patch) => setEdit({ ...edit, currentAddress: { ...edit.currentAddress, ...patch } })}
                    disabled={sameAsIdCard}
                  />
                </div>
                {profileMessage && (
                  <p className={`text-sm font-semibold ${profileMessage.type === "error" ? "text-status-danger" : "text-status-success"}`}>
                    {profileMessage.text}
                  </p>
                )}
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="h-11 w-full rounded-xl bg-primary font-bold text-white disabled:opacity-60"
                >
                  {savingProfile ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              </div>
            )}

            {openSection === "taxInfo" && edit && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-on-surface-variant">เลขผู้เสียภาษี</label>
                  <p className="w-full rounded-xl bg-surface-container-low px-3 py-2.5 text-sm text-on-surface-variant">
                    {edit.taxId ? formatThaiId13(edit.taxId) : "-"}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-on-surface-variant">เลขประกันสังคม</label>
                  <p className="w-full rounded-xl bg-surface-container-low px-3 py-2.5 text-sm text-on-surface-variant">
                    {edit.socialSecurityId ? formatThaiId13(edit.socialSecurityId) : "-"}
                  </p>
                </div>
                <p className="text-xs text-on-surface-variant">เลขผู้เสียภาษี/ประกันสังคมกรอกโดยฝ่ายบุคคลเท่านั้น หากไม่ถูกต้องกรุณาแจ้ง HR</p>
              </div>
            )}

            {openSection === "password" && (
              <div className="space-y-3">
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
            )}

            {openSection === "privacy" && (
              <p className="text-sm leading-relaxed text-on-surface-variant">
                แอปนี้เก็บข้อมูลตำแหน่ง GPS และภาพเซลฟีเฉพาะขณะลงเวลาเข้า-ออกงานเท่านั้น ไม่มีการติดตามตำแหน่งพนักงานตลอดเวลา ข้อมูลเงินเดือนและเอกสารส่วนตัว
                จัดเก็บแบบส่วนตัว (Private Storage) และเข้าถึงได้เฉพาะผู้ที่เกี่ยวข้องเท่านั้น
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
