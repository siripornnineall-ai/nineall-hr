"use client";

import { formatLeaveDuration } from "@/lib/leaveDuration";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { t, useT } from "@/lib/i18n";
import { countsTowardLeaveQuota } from "@/lib/leaveTypes";

interface LeaveType {
  id: string;
  name_th: string;
  code: string;
  notice_days_required: number;
  allow_half_day: boolean;
  allow_hourly: boolean;
  requires_attachment: boolean;
  attachment_required_after_days: number;
}
interface LeaveRequestRow {
  id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  unit: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
  approval_stage: string | null;
  leave_types: { name_th: string } | null;
}

interface BalanceRow {
  leave_type_id: string;
  entitled_days: number;
  carried_over_days: number;
  used_days: number;
  pending_days: number;
}

const STATUS_TH: Record<string, string> = { pending: t("รออนุมัติ"), approved: t("อนุมัติแล้ว"), rejected: t("ปฏิเสธ"), cancelled: t("ยกเลิก") };
// Leave is approved in two steps (หัวหน้า -> HR); while pending, say whose turn it is.
function statusLabel(status: string, stage: string | null): string {
  if (status === "pending" && stage === "manager") return t("รอหัวหน้าอนุมัติ");
  if (status === "pending" && stage === "hr") return t("รอ HR อนุมัติ");
  return STATUS_TH[status] ?? status;
}
const STATUS_CLASS: Record<string, string> = {
  pending: "text-status-warning",
  approved: "text-status-success",
  rejected: "text-status-danger",
  cancelled: "text-on-surface-variant",
};

export default function LeavePage() {
  const { t } = useT();
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [balancesLoaded, setBalancesLoaded] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [unit, setUnit] = useState<"full_day" | "half_day" | "hourly">("full_day");
  const [halfDayPeriod, setHalfDayPeriod] = useState<"morning" | "afternoon">("morning");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hourlyStart, setHourlyStart] = useState("09:00");
  const [hourlyEnd, setHourlyEnd] = useState("12:00");
  // Optional clock-in / clock-out times for a full-day WFH or off-site request (blank = the shift's times).
  const [clockStart, setClockStart] = useState("");
  const [clockEnd, setClockEnd] = useState("");
  const [reason, setReason] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const [{ data: types }, { data: policies }, { data: reqs }] = await Promise.all([
      supabase.from("leave_types").select("id, name_th, code").eq("org_id", profile.orgId).eq("is_active", true).order("sort_order"),
      supabase
        .from("leave_policies")
        .select("leave_type_id, allow_half_day, allow_hourly, requires_attachment, attachment_required_after_days, notice_days_required, effective_date")
        .order("effective_date", { ascending: false }),
      supabase
        .from("leave_requests")
        .select("id, start_date, end_date, total_days, unit, start_time, end_time, status, approval_stage, leave_types(name_th)")
        .eq("employee_id", profile.employeeId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    const latestPolicyByType = new Map<
      string,
      { allow_half_day: boolean; allow_hourly: boolean; requires_attachment: boolean; attachment_required_after_days: number; notice_days_required: number }
    >();
    for (const p of policies ?? []) {
      if (!latestPolicyByType.has(p.leave_type_id)) latestPolicyByType.set(p.leave_type_id, p);
    }
    const typesWithPolicy = (types ?? []).map((t) => ({
      ...t,
      allow_half_day: latestPolicyByType.get(t.id)?.allow_half_day ?? true,
      allow_hourly: latestPolicyByType.get(t.id)?.allow_hourly ?? false,
      requires_attachment: latestPolicyByType.get(t.id)?.requires_attachment ?? false,
      attachment_required_after_days: latestPolicyByType.get(t.id)?.attachment_required_after_days ?? 0,
      // Only ลากิจ and ลาพักร้อน are locked to advance notice (the database enforces the same rule).
      notice_days_required: t.code === "PERSONAL" || t.code === "VACATION" ? (latestPolicyByType.get(t.id)?.notice_days_required ?? 0) : 0,
    }));
    setLeaveTypes(typesWithPolicy);
    setRequests((reqs ?? []) as unknown as LeaveRequestRow[]);
    setSelectedType((current) => current ?? typesWithPolicy[0]?.id ?? null);
  }, [profile, supabase]);

  // Days left per leave type for the year of the chosen start date (the database checks against that year),
  // so the person sees how much can still be taken before sending a request that would go over.
  const balanceYear = startDate ? Number(startDate.slice(0, 4)) : new Date().getFullYear();
  const loadBalances = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("leave_balances")
      .select("leave_type_id, entitled_days, carried_over_days, used_days, pending_days")
      .eq("employee_id", profile.employeeId)
      .eq("year", balanceYear);
    setBalances((data ?? []) as BalanceRow[]);
    setBalancesLoaded(true);
  }, [profile, supabase, balanceYear]);
  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  function balanceInfo(typeId: string) {
    const b = balances.find((x) => x.leave_type_id === typeId);
    if (!b) return null;
    const total = Number(b.entitled_days) + Number(b.carried_over_days);
    const used = Number(b.used_days);
    const pending = Number(b.pending_days);
    return { total, used, pending, remaining: Math.round((total - used - pending) * 100) / 100 };
  }

  const selectedLeaveType = leaveTypes.find((t) => t.id === selectedType) ?? null;
  // Earliest start date allowed for the chosen type: today (Bangkok) + the notice days.
  const noticeDays = selectedLeaveType?.notice_days_required ?? 0;
  const earliestStart = (() => {
    const base = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date())}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + noticeDays);
    return base.toISOString().slice(0, 10);
  })();
  const noticeViolated = noticeDays > 0 && !!startDate && startDate < earliestStart;
  const quotaSelected = !!selectedLeaveType && countsTowardLeaveQuota(selectedLeaveType.code);
  const selectedBalance = selectedLeaveType ? balanceInfo(selectedLeaveType.id) : null;
  const requestedDays = computeTotalDays();
  const overBalance = quotaSelected && balancesLoaded && requestedDays > 0 && requestedDays > (selectedBalance?.remaining ?? 0);

  useEffect(() => {
    load();
  }, [load]);

  function computeFullDays(): number {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  }

  function computeHourlyHours(): number {
    if (!hourlyStart || !hourlyEnd) return 0;
    const [sh, sm] = hourlyStart.split(":").map(Number);
    const [eh, em] = hourlyEnd.split(":").map(Number);
    const hours = eh + em / 60 - (sh + sm / 60);
    return hours > 0 ? hours : 0;
  }

  // total_days is what leave_balances actually gets deducted by — half day is 0.5 of a
  // day, hourly is expressed as a fraction of a standard 8-hour workday.
  function computeTotalDays(): number {
    if (unit === "full_day") return computeFullDays();
    if (unit === "half_day") return 0.5;
    return Math.round((computeHourlyHours() / 8) * 100) / 100;
  }

  // requires_attachment + a 0 threshold means "always"; a positive threshold means
  // "only once the request reaches that many days" (e.g. sick leave: medical
  // certificate only needed for 3+ days).
  const attachmentRequired =
    !!selectedLeaveType?.requires_attachment && computeTotalDays() >= (selectedLeaveType?.attachment_required_after_days ?? 0);

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    const totalDays = computeTotalDays();
    if (noticeViolated) {
      setError(`${t(selectedLeaveType?.name_th ?? "")} ${t("ต้องขอล่วงหน้าอย่างน้อย")} ${noticeDays} ${t("วัน")}`);
      return;
    }
    if (!selectedType || !startDate || totalDays <= 0 || !reason) {
      setError(t("กรุณากรอกข้อมูลให้ครบถ้วน"));
      return;
    }
    if (unit === "full_day" && (!endDate || endDate < startDate)) {
      setError(t("กรุณาระบุวันที่สิ้นสุดให้ถูกต้อง"));
      return;
    }
    const isRemoteType = selectedLeaveType?.code === "WFH" || selectedLeaveType?.code === "OFFSITE";
    const useClock = unit === "full_day" && isRemoteType && (!!clockStart || !!clockEnd);
    if (useClock && (!clockStart || !clockEnd || clockEnd <= clockStart)) {
      setError(t("กรุณาระบุเวลาเข้า-ออกงานให้ครบ และเวลาออกต้องหลังเวลาเข้า"));
      return;
    }
    if (unit === "hourly" && computeHourlyHours() <= 0) {
      setError(t("กรุณาระบุเวลาเริ่ม-สิ้นสุดให้ถูกต้อง"));
      return;
    }
    if (attachmentRequired && !attachmentFile) {
      setError(t("ประเภทการลานี้ต้องแนบเอกสารประกอบ กรุณาแนบไฟล์"));
      return;
    }

    const isSingleDay = unit !== "full_day";
    setSubmitting(true);

    let attachmentPath: string | null = null;
    if (attachmentFile) {
      setUploadingAttachment(true);
      const path = `${profile!.orgId}/${profile!.employeeId}/${Date.now()}-${attachmentFile.name}`;
      const { error: uploadError } = await supabase.storage.from("attachments").upload(path, attachmentFile, { contentType: attachmentFile.type });
      setUploadingAttachment(false);
      if (uploadError) {
        setSubmitting(false);
        setError(`${t("อัปโหลดเอกสารไม่สำเร็จ:")} ${uploadError.message}`);
        return;
      }
      attachmentPath = path;
    }

    const { error: insertError } = await supabase.from("leave_requests").insert({
      org_id: profile!.orgId,
      employee_id: profile!.employeeId,
      leave_type_id: selectedType,
      start_date: startDate,
      end_date: isSingleDay ? startDate : endDate,
      start_time: unit === "half_day" ? (halfDayPeriod === "morning" ? "08:00" : "13:00") : unit === "hourly" ? hourlyStart : useClock ? clockStart : null,
      end_time: unit === "half_day" ? (halfDayPeriod === "morning" ? "12:00" : "17:00") : unit === "hourly" ? hourlyEnd : useClock ? clockEnd : null,
      unit,
      total_days: totalDays,
      reason,
      attachment_file_path: attachmentPath,
      status: "pending",
    });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message.includes("INSUFFICIENT_LEAVE_BALANCE") ? t("วันลาคงเหลือไม่เพียงพอ") : insertError.message);
      return;
    }
    setStartDate("");
    setEndDate("");
    setClockStart("");
    setClockEnd("");
    setReason("");
    setAttachmentFile(null);
    setSuccess(t("ส่งคำขอลาเรียบร้อยแล้ว"));
    load();
    loadBalances();
  }

  return (
    <div className="safe-top space-y-5 px-4 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-primary">{t("ขอลางาน")}</h1>
        <Link href="/leave/balances" className="text-xs font-semibold text-secondary">
          {t("ดูวันลาคงเหลือ →")}
        </Link>
      </div>

      <div className="space-y-3 rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">{t("ประเภทการลา")}</label>
          <div className="flex flex-wrap gap-2">
            {leaveTypes.map((lt) => (
              <button
                key={lt.id}
                onClick={() => {
                  setSelectedType(lt.id);
                  if (unit === "half_day" && !lt.allow_half_day) setUnit("full_day");
                  if (unit === "hourly" && !lt.allow_hourly) setUnit("full_day");
                }}
                className={clsx(
                  "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                  selectedType === lt.id ? "border-primary bg-primary text-white font-bold" : "border-outline-variant text-on-surface-variant"
                )}
              >
                {t(lt.name_th)}
                {countsTowardLeaveQuota(lt.code) && balancesLoaded && (
                  <span className="ml-1 text-[11px] font-normal opacity-80">· {t("เหลือ")} {balanceInfo(lt.id)?.remaining ?? 0}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {quotaSelected && balancesLoaded && (
          <div
            className={clsx(
              "rounded-xl px-3 py-2.5 text-sm",
              overBalance ? "bg-status-danger/10 text-status-danger" : "bg-surface-container-low text-on-surface-variant"
            )}
          >
            {selectedBalance ? (
              <>
                <p className="font-semibold">
                  {t(selectedLeaveType?.name_th ?? "")}: {t("ลาได้อีก")} {selectedBalance.remaining} {t("วัน")}
                </p>
                <p className="text-xs">
                  {t("สิทธิ์ทั้งปี")} {Math.round(selectedBalance.total * 100) / 100} {t("วัน")} · {t("ใช้ไปแล้ว")} {Math.round(selectedBalance.used * 100) / 100} {t("วัน")}
                  {selectedBalance.pending > 0 ? ` · ${t("รออนุมัติ")} ${Math.round(selectedBalance.pending * 100) / 100} ${t("วัน")}` : ""}
                </p>
              </>
            ) : (
              <p className="font-semibold">
                {t(selectedLeaveType?.name_th ?? "")}: {t("ยังไม่มีสิทธิ์ลาประเภทนี้")}
              </p>
            )}
            {overBalance && (
              <p className="mt-1 text-xs font-semibold">
                {t("คำขอนี้")} {requestedDays} {t("วัน")} {t("เกินวันลาคงเหลือ — ส่งคำขอไม่ได้ กรุณาลดจำนวนวัน หรือติดต่อ HR")}
              </p>
            )}
          </div>
        )}

        {noticeDays > 0 && (
          <p className="rounded-xl bg-status-warning/10 px-3 py-2 text-xs font-semibold text-status-warning">
            {t(selectedLeaveType?.name_th ?? "")} {t("ต้องขอล่วงหน้าอย่างน้อย")} {noticeDays} {t("วัน")} ({t("ลาได้ตั้งแต่")} {earliestStart})
          </p>
        )}

        {(selectedLeaveType?.allow_half_day || selectedLeaveType?.allow_hourly) && (
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">{t("ช่วงเวลาลา")}</label>
            <div className="flex flex-wrap gap-2">
              {/* No "เต็มวัน" button — choosing a date range already means full-day leave, nothing to press.
                  Clicking an active chip here toggles back to full_day so switching back doesn't need one either. */}
              {selectedLeaveType?.allow_half_day && (
                <UnitChip label={t("ครึ่งวัน")} active={unit === "half_day"} onClick={() => setUnit(unit === "half_day" ? "full_day" : "half_day")} />
              )}
              {selectedLeaveType?.allow_hourly && (
                <UnitChip label={t("รายชั่วโมง")} active={unit === "hourly"} onClick={() => setUnit(unit === "hourly" ? "full_day" : "hourly")} />
              )}
            </div>
          </div>
        )}

        {unit === "full_day" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">{t("วันที่เริ่ม")}</label>
              <input type="date" min={noticeDays > 0 ? earliestStart : undefined} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">{t("วันที่สิ้นสุด")}</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm" />
            </div>
          </div>
        )}

        {unit === "full_day" && (selectedLeaveType?.code === "WFH" || selectedLeaveType?.code === "OFFSITE") && (
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">{t("เวลาเข้า-ออกงาน (ไม่ใส่ = ตามกะ)")}</label>
            <div className="grid grid-cols-2 gap-3">
              <input type="time" value={clockStart} onChange={(e) => setClockStart(e.target.value)} aria-label={t("เวลาเข้างาน")} className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm" />
              <input type="time" value={clockEnd} onChange={(e) => setClockEnd(e.target.value)} aria-label={t("เวลาออกงาน")} className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm" />
            </div>
          </div>
        )}

        {unit === "half_day" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">{t("วันที่ลา")}</label>
              <input type="date" min={noticeDays > 0 ? earliestStart : undefined} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">{t("ช่วง")}</label>
              <div className="flex gap-2">
                <UnitChip label={t("เช้า")} active={halfDayPeriod === "morning"} onClick={() => setHalfDayPeriod("morning")} />
                <UnitChip label={t("บ่าย")} active={halfDayPeriod === "afternoon"} onClick={() => setHalfDayPeriod("afternoon")} />
              </div>
            </div>
          </div>
        )}

        {unit === "half_day" && (

          <p className="rounded-lg bg-surface-container px-3 py-2 text-xs text-on-surface-variant">{t("ครึ่งวัน หักลา 0.5 วัน · ลาเช้า: เข้างาน 13:00 ออกตามเวลาเลิกงานปกติ (เช่น 13:00–18:00) · ลาบ่าย: ทำงาน 4 ชม. ติดกันนับจากเวลาเข้างานปกติ ไม่มีพักเที่ยง (เช่น 9:00–13:00) แล้วกลับได้เลย")}</p>

        )}


        {unit === "hourly" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">{t("วันที่ลา")}</label>
              <input type="date" min={noticeDays > 0 ? earliestStart : undefined} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">{t("เวลาเริ่ม")}</label>
                <input type="time" value={hourlyStart} onChange={(e) => setHourlyStart(e.target.value)} className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">{t("เวลาสิ้นสุด")}</label>
                <input type="time" value={hourlyEnd} onChange={(e) => setHourlyEnd(e.target.value)} className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm" />
              </div>
            </div>
          </div>
        )}

        {selectedLeaveType?.requires_attachment && (
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">
              {t("เอกสารประกอบ")}{attachmentRequired ? <span className="text-status-danger"> {t("* จำเป็น")}</span> : t(" (ไม่บังคับสำหรับจำนวนวันนี้)")}
            </label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
            />
            {attachmentFile && <p className="mt-1 text-xs text-on-surface-variant">{attachmentFile.name}</p>}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">{t("เหตุผล")}</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={t("ระบุเหตุผลการลา")}
            className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl bg-surface-container p-3.5">
          <span className="text-sm font-semibold">{t("ลารวมทั้งหมด:")}</span>
          <span className="font-bold text-primary">
            {unit === "hourly" ? `${computeHourlyHours()} ${t("ชม.")}` : `${computeTotalDays()} ${t("วัน")}`}
          </span>
        </div>

        {error && <p className="text-sm text-status-danger">{error}</p>}
        {success && <p className="text-sm font-semibold text-status-success">{success}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || noticeViolated || overBalance}
          className="h-12 w-full rounded-2xl bg-primary font-bold text-white disabled:opacity-60"
        >
          {uploadingAttachment ? t("กำลังอัปโหลดเอกสาร...") : submitting ? t("กำลังส่ง...") : t("ส่งคำขอลา")}
        </button>
      </div>

      <div>
        <h2 className="mb-3 text-base font-bold text-on-surface">{t("ประวัติคำขอ")}</h2>
        {requests.length === 0 && <p className="text-sm text-on-surface-variant">{t("ยังไม่มีคำขอลา")}</p>}
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl bg-white p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
              <div>
                <p className="font-semibold text-on-surface">{t(r.leave_types?.name_th ?? "-")}</p>
                <p className="text-xs text-on-surface-variant">
                  {r.start_date} - {r.end_date} ({formatLeaveDuration(r.unit, r.total_days, r.start_time, r.end_time)})
                </p>
              </div>
              <span className={clsx("shrink-0 text-xs font-bold", STATUS_CLASS[r.status])}>{t(statusLabel(r.status, r.approval_stage))}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UnitChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        active ? "border-primary bg-primary text-white font-bold" : "border-outline-variant text-on-surface-variant"
      )}
    >
      {label}
    </button>
  );
}
