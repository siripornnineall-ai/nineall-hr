"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ApplyForm({ vacancyId, orgId }: { vacancyId: string; orgId: string }) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!fullName.trim()) {
      setError("กรุณากรอกชื่อ-นามสกุล");
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setError("กรุณากรอกเบอร์โทรหรืออีเมลอย่างน้อยหนึ่งช่องทาง");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("job_candidates").insert({
      org_id: orgId,
      vacancy_id: vacancyId,
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      cover_note: coverNote.trim() || null,
      status: "applied",
    });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
        <span className="material-symbols-outlined text-[40px] text-status-success">check_circle</span>
        <p className="mt-2 text-lg font-bold text-on-surface">ส่งใบสมัครเรียบร้อยแล้ว</p>
        <p className="mt-1 text-sm text-on-surface-variant">ขอบคุณที่สนใจร่วมงานกับเรา ทีมงานจะติดต่อกลับหากคุณสมบัติตรงตามที่เปิดรับ</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl bg-white p-6 shadow-sm">
      <div className="space-y-1">
        <label className="block text-sm font-semibold text-on-surface-variant">ชื่อ-นามสกุล *</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11 w-full rounded-lg border border-outline-variant px-3 text-sm" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-on-surface-variant">เบอร์โทร</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 w-full rounded-lg border border-outline-variant px-3 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-on-surface-variant">อีเมล</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 w-full rounded-lg border border-outline-variant px-3 text-sm" />
        </div>
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-semibold text-on-surface-variant">แนะนำตัว / ประสบการณ์ที่เกี่ยวข้อง (ไม่บังคับ)</label>
        <textarea value={coverNote} onChange={(e) => setCoverNote(e.target.value)} rows={5} className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm" />
      </div>
      {error && <p className="text-sm font-semibold text-status-danger">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="h-12 w-full rounded-xl bg-primary font-bold text-white shadow-md disabled:opacity-60"
      >
        {submitting ? "กำลังส่งใบสมัคร..." : "ส่งใบสมัคร"}
      </button>
    </div>
  );
}
