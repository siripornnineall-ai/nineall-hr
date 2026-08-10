"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { calculatePayrollForEmployee, bahtToSatang, satangToBaht } from "@nineall-hr/payroll-engine";
import type { AttendanceStatus, PayrollEmployeeInput, PayrollInputDay } from "@nineall-hr/payroll-engine";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadPolicyConfig } from "@/lib/payroll/policy";

export async function createPayrollRunAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const periodStart = String(formData.get("periodStart"));
  const periodEnd = String(formData.get("periodEnd"));
  const payDate = String(formData.get("payDate"));
  const label = String(formData.get("label") || `${periodStart} - ${periodEnd}`);

  const { data: period, error: periodError } = await supabase
    .from("payroll_periods")
    .upsert(
      { org_id: user.orgId, label, period_start: periodStart, period_end: periodEnd, pay_date: payDate },
      { onConflict: "org_id,period_start,period_end" }
    )
    .select("id")
    .single();
  if (periodError || !period) throw new Error(periodError?.message ?? "สร้างรอบเงินเดือนไม่สำเร็จ");

  const { data: run, error: runError } = await supabase
    .from("payroll_runs")
    .insert({ org_id: user.orgId, payroll_period_id: period.id, status: "draft", created_by: user.profileId })
    .select("id")
    .single();
  if (runError || !run) throw new Error(runError?.message ?? "สร้างรอบคำนวณเงินเดือนไม่สำเร็จ");

  revalidatePath("/payroll");
  redirect(`/payroll/${run.id}`);
}

const WORKED_STATUSES = new Set<AttendanceStatus>(["on_time", "late", "early_leave", "work_from_home", "off_site", "holiday"]);

export async function calculatePayrollRunAction(runId: string) {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { data: run } = await supabase.from("payroll_runs").select("id, status, payroll_period_id").eq("id", runId).eq("org_id", user.orgId).single();
  if (!run) throw new Error("ไม่พบรอบเงินเดือนนี้");
  if (run.status === "locked") throw new Error("รอบเงินเดือนนี้ถูกล็อกแล้ว ไม่สามารถคำนวณซ้ำได้");

  const { data: period } = await supabase.from("payroll_periods").select("*").eq("id", run.payroll_period_id).single();
  if (!period) throw new Error("ไม่พบข้อมูลรอบวันที่");

  const policy = await loadPolicyConfig(user.orgId, period.period_start);

  const { data: employees } = await supabase
    .from("employees")
    .select("id, employee_code, first_name, last_name, employment_type, hire_date, resignation_date, employment_status, departments(name), job_positions(title)")
    .eq("org_id", user.orgId)
    .in("employment_status", ["active", "probation", "resigned"]);

  let totalGross = 0;
  let totalDeduction = 0;
  let totalNet = 0;

  for (const emp of employees ?? []) {
    const { data: comp } = await supabase
      .from("employee_compensation")
      .select("*")
      .eq("employee_id", emp.id)
      .lte("effective_date", period.period_end)
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!comp) continue; // no compensation on file yet — surfaced in the UI as "missing data"

    const { data: attendance } = await supabase
      .from("attendance_records")
      .select("work_date, status, late_minutes, early_leave_minutes, worked_minutes")
      .eq("employee_id", emp.id)
      .gte("work_date", period.period_start)
      .lte("work_date", period.period_end);

    const { data: shiftAssignments } = await supabase
      .from("shift_assignments")
      .select("work_date, is_day_off")
      .eq("employee_id", emp.id)
      .gte("work_date", period.period_start)
      .lte("work_date", period.period_end);

    const { data: overtime } = await supabase
      .from("overtime_requests")
      .select("work_date, approved_hours, rate_multiplier")
      .eq("employee_id", emp.id)
      .eq("status", "approved")
      .gte("work_date", period.period_start)
      .lte("work_date", period.period_end);

    const { data: unpaidLeave } = await supabase
      .from("leave_requests")
      .select("total_days, leave_types!inner(is_paid)")
      .eq("employee_id", emp.id)
      .eq("status", "approved")
      .eq("leave_types.is_paid", false)
      .gte("start_date", period.period_start)
      .lte("end_date", period.period_end);

    const days: PayrollInputDay[] = (attendance ?? []).map((a) => ({
      workDate: a.work_date,
      status: a.status,
      lateMinutes: a.late_minutes,
      earlyLeaveMinutes: a.early_leave_minutes,
      workedMinutes: a.worked_minutes,
      isScheduledWorkday: true,
    }));

    const scheduledWorkDaysInPeriod = (shiftAssignments ?? []).filter((s) => !s.is_day_off).length || 22;
    const unpaidLeaveDays = (unpaidLeave ?? []).reduce((sum, l) => sum + Number(l.total_days), 0);

    const input: PayrollEmployeeInput = {
      employmentType: comp.employment_type,
      baseAmountSatang: bahtToSatang(Number(comp.base_amount)),
      periodStart: period.period_start,
      periodEnd: period.period_end,
      scheduledWorkDaysInPeriod,
      hireDate: emp.hire_date,
      resignationDate: emp.resignation_date ?? undefined,
      days,
      overtime: (overtime ?? []).map((o) => ({
        workDate: o.work_date,
        approvedHours: Number(o.approved_hours ?? 0),
        rateMultiplier: Number(o.rate_multiplier),
      })),
      unpaidLeaveDays,
      recurringEarnings: [
        comp.position_allowance ? { label: "ค่าตำแหน่ง", amountSatang: bahtToSatang(Number(comp.position_allowance)) } : null,
        comp.transport_allowance ? { label: "ค่าเดินทาง", amountSatang: bahtToSatang(Number(comp.transport_allowance)) } : null,
        comp.meal_allowance ? { label: "ค่าอาหาร", amountSatang: bahtToSatang(Number(comp.meal_allowance)) } : null,
        comp.diligence_allowance ? { label: "เบี้ยขยัน", amountSatang: bahtToSatang(Number(comp.diligence_allowance)) } : null,
      ].filter((x): x is NonNullable<typeof x> => Boolean(x)),
      policy,
    };

    const result = calculatePayrollForEmployee(input);
    const hasMissingData = !comp || days.length === 0;

    const { data: calc, error: calcError } = await supabase
      .from("payroll_employee_calculations")
      .upsert(
        {
          payroll_run_id: runId,
          employee_id: emp.id,
          employee_code_snapshot: emp.employee_code,
          employee_name_snapshot: `${emp.first_name} ${emp.last_name}`,
          department_snapshot: (emp.departments as unknown as { name: string } | null)?.name ?? null,
          position_snapshot: (emp.job_positions as unknown as { title: string } | null)?.title ?? null,
          employment_type_snapshot: emp.employment_type,
          base_amount: satangToBaht(result.baseAmountSatang),
          worked_days: days.filter((d) => WORKED_STATUSES.has(d.status)).length,
          absent_days: days.filter((d) => d.status === "absent").length,
          unpaid_leave_days: unpaidLeaveDays,
          ot_hours: result.otHours,
          ot_amount: satangToBaht(result.otAmountSatang),
          gross_earnings: satangToBaht(result.grossEarningsSatang),
          total_deductions: satangToBaht(result.totalDeductionsSatang),
          social_security_amount: satangToBaht(result.socialSecuritySatang),
          tax_amount: satangToBaht(result.taxSatang),
          net_pay: satangToBaht(result.netPaySatang),
          has_anomaly: result.hasAnomaly || hasMissingData,
          anomaly_notes: [...result.anomalyNotes, ...(hasMissingData ? ["ไม่พบข้อมูลเงินเดือน/เวลาเข้างานครบถ้วน"] : [])].join("; ") || null,
          calculation_breakdown: result,
          is_mid_cycle_join: result.isMidCycleJoin,
          is_mid_cycle_exit: result.isMidCycleExit,
        },
        { onConflict: "payroll_run_id,employee_id" }
      )
      .select("id")
      .single();
    if (calcError || !calc) continue;

    await supabase.from("payroll_earning_items").delete().eq("payroll_calc_id", calc.id);
    await supabase.from("payroll_deduction_items").delete().eq("payroll_calc_id", calc.id);
    if (result.earnings.length > 0) {
      await supabase.from("payroll_earning_items").insert(
        result.earnings.map((e) => ({ payroll_calc_id: calc.id, label: e.label, quantity: e.quantity, amount: satangToBaht(e.amountSatang) }))
      );
    }
    if (result.deductions.length > 0) {
      await supabase.from("payroll_deduction_items").insert(
        result.deductions.map((d) => ({ payroll_calc_id: calc.id, label: d.label, quantity: d.quantity, amount: satangToBaht(d.amountSatang) }))
      );
    }

    totalGross += satangToBaht(result.grossEarningsSatang);
    totalDeduction += satangToBaht(result.totalDeductionsSatang);
    totalNet += satangToBaht(result.netPaySatang);
  }

  await supabase
    .from("payroll_runs")
    .update({
      status: "under_review",
      employee_count: (employees ?? []).length,
      total_gross_amount: totalGross,
      total_deduction_amount: totalDeduction,
      total_net_amount: totalNet,
      calculated_at: new Date().toISOString(),
    })
    .eq("id", runId);

  revalidatePath(`/payroll/${runId}`);
}

export async function submitPayrollRunAction(runId: string) {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { count } = await supabase
    .from("payroll_employee_calculations")
    .select("id", { count: "exact", head: true })
    .eq("payroll_run_id", runId)
    .eq("has_anomaly", true);
  if ((count ?? 0) > 0) {
    throw new Error("ยังมีรายการที่มีความผิดปกติซึ่งยังไม่ได้ตรวจสอบ กรุณาแก้ไขก่อนส่งอนุมัติ");
  }

  await supabase
    .from("payroll_runs")
    .update({ status: "pending_approval", submitted_at: new Date().toISOString(), submitted_by: user.profileId })
    .eq("id", runId)
    .eq("org_id", user.orgId);
  revalidatePath(`/payroll/${runId}`);
}

export async function approvePayrollRunAction(runId: string) {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();
  await supabase
    .from("payroll_runs")
    .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user.profileId })
    .eq("id", runId)
    .eq("org_id", user.orgId);
  revalidatePath(`/payroll/${runId}`);
}

export async function lockPayrollRunAction(runId: string) {
  const user = await requireUser();
  requireRole(user, ["super_admin"]);
  const supabase = await createClient();

  const { data: calcs } = await supabase.from("payroll_employee_calculations").select("id, employee_id").eq("payroll_run_id", runId);

  await supabase.from("payroll_runs").update({ status: "locked", locked_at: new Date().toISOString(), locked_by: user.profileId }).eq("id", runId);

  const { data: run } = await supabase.from("payroll_runs").select("payroll_period_id").eq("id", runId).single();
  if (run && calcs) {
    await supabase.from("payslips").upsert(
      calcs.map((c) => ({ payroll_calc_id: c.id, employee_id: c.employee_id, payroll_period_id: run.payroll_period_id, issued_at: new Date().toISOString() })),
      { onConflict: "payroll_calc_id" }
    );
  }

  revalidatePath(`/payroll/${runId}`);
}
