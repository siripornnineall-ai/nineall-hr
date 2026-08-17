"use server";

import { revalidatePath } from "next/cache";
import { leaveTypeSchema } from "@nineall-hr/shared-validation";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface LeaveTypeActionState {
  error?: string;
}

export async function createLeaveTypeAction(_prev: LeaveTypeActionState, formData: FormData): Promise<LeaveTypeActionState> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  const parsed = leaveTypeSchema.safeParse({
    code: formData.get("code"),
    nameTh: formData.get("nameTh"),
    nameEn: formData.get("nameEn") || undefined,
    isPaid: formData.get("isPaid") === "on",
    daysPerYear: Number(formData.get("daysPerYear")),
    allowHalfDay: formData.get("allowHalfDay") === "on",
    allowHourly: formData.get("allowHourly") === "on",
    requiresAttachment: formData.get("requiresAttachment") === "on",
    minServiceMonths: 0,
    noticeDaysRequired: Number(formData.get("noticeDaysRequired") || 0),
    carryOverAllowed: false,
    carryOverMaxDays: 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const supabase = await createClient();
  const { data: leaveType, error } = await supabase
    .from("leave_types")
    .insert({
      org_id: user.orgId,
      code: parsed.data.code,
      name_th: parsed.data.nameTh,
      name_en: parsed.data.nameEn || null,
      is_paid: parsed.data.isPaid,
    })
    .select("id")
    .single();
  if (error || !leaveType) return { error: error?.message ?? "บันทึกไม่สำเร็จ" };

  await supabase.from("leave_policies").insert({
    leave_type_id: leaveType.id,
    effective_date: new Date().toISOString().slice(0, 10),
    days_per_year: parsed.data.daysPerYear,
    allow_half_day: parsed.data.allowHalfDay,
    allow_hourly: parsed.data.allowHourly,
    requires_attachment: parsed.data.requiresAttachment,
    notice_days_required: parsed.data.noticeDaysRequired,
    created_by: user.profileId,
  });

  revalidatePath("/settings");
  return {};
}

type FormValues = Record<string, string | boolean>;
const str = (v: FormValues, key: string) => (typeof v[key] === "string" ? (v[key] as string).trim() : "");
const strOrNull = (v: FormValues, key: string) => str(v, key) || null;
const bool = (v: FormValues, key: string) => Boolean(v[key]);
const num = (v: FormValues, key: string, fallback = 0) => {
  const n = Number(v[key]);
  return Number.isFinite(n) ? n : fallback;
};

async function requireSettingsUser() {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  return user;
}

// FK violations (Postgres code 23503) mean the row is still referenced by real data
// (an employee, employment history, a leave request, etc.) — surface a friendly
// message instead of the raw constraint name.
function fkMessage(entityLabel: string): string {
  return `ไม่สามารถลบ${entityLabel}นี้ได้ เนื่องจากมีข้อมูลพนักงานหรือประวัติที่เกี่ยวข้องอยู่`;
}

// Returns { error } instead of throwing: Next.js redacts thrown Server Action error
// messages in production builds (a security default, not a bug) — the client only ever
// sees a generic digest, never the real text. Validation-style errors that the user needs
// to actually read must come back as a normal return value instead.
export async function createLeaveTypeQuickAction(values: FormValues): Promise<{ error?: string } | void> {
  const user = await requireSettingsUser();
  if (!str(values, "code") || !str(values, "nameTh")) return { error: "กรุณากรอกรหัสและชื่อประเภทการลา" };
  const supabase = await createClient();
  const { data: leaveType, error } = await supabase
    .from("leave_types")
    .insert({ org_id: user.orgId, code: str(values, "code"), name_th: str(values, "nameTh"), is_paid: bool(values, "isPaid") })
    .select("id")
    .single();
  if (error || !leaveType) return { error: error?.message ?? "บันทึกไม่สำเร็จ" };
  await supabase.from("leave_policies").insert({
    leave_type_id: leaveType.id,
    effective_date: new Date().toISOString().slice(0, 10),
    days_per_year: num(values, "daysPerYear"),
    allow_half_day: bool(values, "allowHalfDay"),
    allow_hourly: bool(values, "allowHourly"),
    requires_attachment: bool(values, "requiresAttachment"),
    attachment_required_after_days: num(values, "attachmentRequiredAfterDays"),
    notice_days_required: num(values, "noticeDaysRequired"),
    min_service_months: num(values, "minServiceMonths"),
    created_by: user.profileId,
  });
  revalidatePath("/settings");
}

// Policy fields are edited in place on the current policy row rather than versioned
// with a new effective-dated row — this is a quick-edit settings UI, not the
// effective-dated history flow (that's what leave_policies is designed to support
// later, e.g. a "change policy starting next year" feature, not built here).
export async function updateLeaveTypeAction(id: string, values: FormValues): Promise<{ error?: string } | void> {
  const user = await requireSettingsUser();
  const supabase = await createClient();
  const { error: typeErr } = await supabase
    .from("leave_types")
    .update({ code: str(values, "code"), name_th: str(values, "nameTh"), is_paid: bool(values, "isPaid") })
    .eq("id", id)
    .eq("org_id", user.orgId);
  if (typeErr) return { error: typeErr.message };

  const policyFields = {
    days_per_year: num(values, "daysPerYear"),
    allow_half_day: bool(values, "allowHalfDay"),
    allow_hourly: bool(values, "allowHourly"),
    requires_attachment: bool(values, "requiresAttachment"),
    attachment_required_after_days: num(values, "attachmentRequiredAfterDays"),
    notice_days_required: num(values, "noticeDaysRequired"),
    min_service_months: num(values, "minServiceMonths"),
  };

  const { data: currentPolicy } = await supabase
    .from("leave_policies")
    .select("id")
    .eq("leave_type_id", id)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (currentPolicy) {
    const { error: policyErr } = await supabase.from("leave_policies").update(policyFields).eq("id", currentPolicy.id);
    if (policyErr) return { error: policyErr.message };
  } else {
    const { error: policyErr } = await supabase.from("leave_policies").insert({
      leave_type_id: id,
      effective_date: new Date().toISOString().slice(0, 10),
      created_by: user.profileId,
      ...policyFields,
    });
    if (policyErr) return { error: policyErr.message };
  }

  revalidatePath("/settings");
}

export async function deleteLeaveTypeAction(id: string): Promise<{ error?: string } | void> {
  const user = await requireSettingsUser();
  const supabase = await createClient();
  const { error } = await supabase.from("leave_types").delete().eq("id", id).eq("org_id", user.orgId);
  if (error) return { error: error.code === "23503" ? fkMessage("ประเภทการลา") : error.message };
  revalidatePath("/settings");
}

export async function updateOrganizationAction(values: FormValues) {
  const user = await requireSettingsUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name: str(values, "name"), timezone: str(values, "timezone") })
    .eq("id", user.orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

// --- Branches ---------------------------------------------------------------
export async function createBranchAction(values: FormValues) {
  const user = await requireSettingsUser();
  if (!str(values, "name")) throw new Error("กรุณากรอกชื่อสาขา");
  const supabase = await createClient();
  const { error } = await supabase.from("branches").insert({ org_id: user.orgId, name: str(values, "name"), address: strOrNull(values, "address") });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function updateBranchAction(id: string, values: FormValues) {
  const user = await requireSettingsUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("branches")
    .update({ name: str(values, "name"), address: strOrNull(values, "address") })
    .eq("id", id)
    .eq("org_id", user.orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function deleteBranchAction(id: string): Promise<{ error?: string } | void> {
  const user = await requireSettingsUser();
  const supabase = await createClient();
  const { error } = await supabase.from("branches").delete().eq("id", id).eq("org_id", user.orgId);
  if (error) return { error: error.code === "23503" ? fkMessage("สาขา") : error.message };
  revalidatePath("/settings");
}

// --- Departments --------------------------------------------------------------
export async function createDepartmentAction(values: FormValues) {
  const user = await requireSettingsUser();
  if (!str(values, "name")) throw new Error("กรุณากรอกชื่อแผนก");
  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .insert({ org_id: user.orgId, name: str(values, "name"), name_en: strOrNull(values, "nameEn") });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function updateDepartmentAction(id: string, values: FormValues) {
  const user = await requireSettingsUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .update({ name: str(values, "name"), name_en: strOrNull(values, "nameEn") })
    .eq("id", id)
    .eq("org_id", user.orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function deleteDepartmentAction(id: string): Promise<{ error?: string } | void> {
  const user = await requireSettingsUser();
  const supabase = await createClient();
  const { error } = await supabase.from("departments").delete().eq("id", id).eq("org_id", user.orgId);
  if (error) return { error: error.code === "23503" ? fkMessage("แผนก") : error.message };
  revalidatePath("/settings");
}

// --- Teams --------------------------------------------------------------------
export async function createTeamAction(values: FormValues) {
  const user = await requireSettingsUser();
  if (!str(values, "name")) throw new Error("กรุณากรอกชื่อทีม");
  const supabase = await createClient();
  const { error } = await supabase
    .from("teams")
    .insert({ org_id: user.orgId, name: str(values, "name"), department_id: strOrNull(values, "departmentId") });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function updateTeamAction(id: string, values: FormValues) {
  const user = await requireSettingsUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("teams")
    .update({ name: str(values, "name"), department_id: strOrNull(values, "departmentId") })
    .eq("id", id)
    .eq("org_id", user.orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function deleteTeamAction(id: string): Promise<{ error?: string } | void> {
  const user = await requireSettingsUser();
  const supabase = await createClient();
  const { error } = await supabase.from("teams").delete().eq("id", id).eq("org_id", user.orgId);
  if (error) return { error: error.code === "23503" ? fkMessage("ทีม") : error.message };
  revalidatePath("/settings");
}

// --- Job positions --------------------------------------------------------------
export async function createJobPositionAction(values: FormValues) {
  const user = await requireSettingsUser();
  if (!str(values, "title")) throw new Error("กรุณากรอกชื่อตำแหน่ง");
  const supabase = await createClient();
  const { error } = await supabase.from("job_positions").insert({
    org_id: user.orgId,
    title: str(values, "title"),
    title_en: strOrNull(values, "titleEn"),
    department_id: strOrNull(values, "departmentId"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function updateJobPositionAction(id: string, values: FormValues) {
  const user = await requireSettingsUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("job_positions")
    .update({ title: str(values, "title"), title_en: strOrNull(values, "titleEn"), department_id: strOrNull(values, "departmentId") })
    .eq("id", id)
    .eq("org_id", user.orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function deleteJobPositionAction(id: string): Promise<{ error?: string } | void> {
  const user = await requireSettingsUser();
  const supabase = await createClient();
  const { error } = await supabase.from("job_positions").delete().eq("id", id).eq("org_id", user.orgId);
  if (error) return { error: error.code === "23503" ? fkMessage("ตำแหน่งงาน") : error.message };
  revalidatePath("/settings");
}

// --- Work shifts --------------------------------------------------------------
export async function createShiftAction(values: FormValues) {
  const user = await requireSettingsUser();
  if (!str(values, "name") || !str(values, "startTime") || !str(values, "endTime")) throw new Error("กรุณากรอกชื่อกะและเวลาเข้า-ออกให้ครบ");
  const supabase = await createClient();
  const { error } = await supabase.from("work_shifts").insert({
    org_id: user.orgId,
    name: str(values, "name"),
    start_time: str(values, "startTime"),
    end_time: str(values, "endTime"),
    grace_minutes_late: num(values, "graceMinutesLate"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function updateShiftAction(id: string, values: FormValues) {
  const user = await requireSettingsUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("work_shifts")
    .update({
      name: str(values, "name"),
      start_time: str(values, "startTime"),
      end_time: str(values, "endTime"),
      grace_minutes_late: num(values, "graceMinutesLate"),
    })
    .eq("id", id)
    .eq("org_id", user.orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function deleteShiftAction(id: string): Promise<{ error?: string } | void> {
  const user = await requireSettingsUser();
  const supabase = await createClient();
  const { error } = await supabase.from("work_shifts").delete().eq("id", id).eq("org_id", user.orgId);
  if (error) return { error: error.code === "23503" ? fkMessage("กะการทำงาน") : error.message };
  revalidatePath("/settings");
}

// --- Work locations -------------------------------------------------------------
function parseLatLng(values: FormValues) {
  const lat = num(values, "latitude", NaN);
  const lng = num(values, "longitude", NaN);
  if (!str(values, "name") || Number.isNaN(lat) || Number.isNaN(lng)) throw new Error("กรุณากรอกชื่อสถานที่และพิกัด GPS ให้ครบ");
  if (lat < -90 || lat > 90) throw new Error("ละติจูดไม่ถูกต้อง (ต้องอยู่ระหว่าง -90 ถึง 90)");
  if (lng < -180 || lng > 180) throw new Error("ลองจิจูดไม่ถูกต้อง (ต้องอยู่ระหว่าง -180 ถึง 180)");
  return { lat, lng };
}

export async function createWorkLocationAction(values: FormValues) {
  const user = await requireSettingsUser();
  const { lat, lng } = parseLatLng(values);
  const supabase = await createClient();
  const { error } = await supabase.from("work_locations").insert({
    org_id: user.orgId,
    name: str(values, "name"),
    latitude: lat,
    longitude: lng,
    radius_meters: num(values, "radiusMeters", 150),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function updateWorkLocationAction(id: string, values: FormValues) {
  const user = await requireSettingsUser();
  const { lat, lng } = parseLatLng(values);
  const supabase = await createClient();
  const { error } = await supabase
    .from("work_locations")
    .update({ name: str(values, "name"), latitude: lat, longitude: lng, radius_meters: num(values, "radiusMeters", 150) })
    .eq("id", id)
    .eq("org_id", user.orgId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function deleteWorkLocationAction(id: string): Promise<{ error?: string } | void> {
  const user = await requireSettingsUser();
  const supabase = await createClient();
  const { error } = await supabase.from("work_locations").delete().eq("id", id).eq("org_id", user.orgId);
  if (error) return { error: error.code === "23503" ? fkMessage("สถานที่ทำงาน") : error.message };
  revalidatePath("/settings");
}

// --- Company holidays -------------------------------------------------------------
export async function createHolidayAction(values: FormValues): Promise<{ error?: string } | void> {
  const user = await requireSettingsUser();
  if (!str(values, "name") || !str(values, "holidayDate")) return { error: "กรุณากรอกชื่อวันหยุดและวันที่" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_holidays")
    .insert({ org_id: user.orgId, name: str(values, "name"), holiday_date: str(values, "holidayDate") });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export async function updateHolidayAction(id: string, values: FormValues): Promise<{ error?: string } | void> {
  const user = await requireSettingsUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_holidays")
    .update({ name: str(values, "name"), holiday_date: str(values, "holidayDate") })
    .eq("id", id)
    .eq("org_id", user.orgId);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export async function deleteHolidayAction(id: string): Promise<{ error?: string } | void> {
  const user = await requireSettingsUser();
  const supabase = await createClient();
  const { error } = await supabase.from("company_holidays").delete().eq("id", id).eq("org_id", user.orgId);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}
