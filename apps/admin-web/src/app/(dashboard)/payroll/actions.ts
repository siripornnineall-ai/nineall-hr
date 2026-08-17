"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { calculatePayrollForEmployee, bahtToSatang, satangToBaht } from "@nineall-hr/payroll-engine";
import type { AttendanceStatus, PayrollEmployeeInput, PayrollInputDay } from "@nineall-hr/payroll-engine";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadPolicyConfig } from "@/lib/payroll/policy";
import { generatePayslipBuffer } from "@/lib/pdf/generatePayslipBuffer";

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

  // A period can have at most one non-locked run at a time — reuse it instead of creating a
  // duplicate. This is the safety net for double-submits (slow network, impatient re-clicks,
  // multiple tabs); the submit button also disables itself while pending, but that alone
  // doesn't protect against a second in-flight request from a different tab/retry.
  const { data: existingRun } = await supabase
    .from("payroll_runs")
    .select("id")
    .eq("payroll_period_id", period.id)
    .neq("status", "locked")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingRun) {
    redirect(`/payroll/${existingRun.id}`);
  }

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

  // Each employee needs ~5 reads + ~4 writes to calculate. Running employees sequentially
  // (a plain for-loop with await inside) meant 16 employees took 100+ round-trips one after
  // another — slow enough to look hung, with no progress shown. Employees are independent of
  // each other, so process them concurrently instead; this doesn't change what gets written,
  // only how long it takes to get there.
  async function processEmployee(emp: NonNullable<typeof employees>[number]) {
    const { data: comp } = await supabase
      .from("employee_compensation")
      .select("*")
      .eq("employee_id", emp.id)
      .lte("effective_date", period.period_end)
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!comp) return null; // no compensation on file yet — surfaced in the UI as "missing data"

    const [{ data: attendance }, { data: shiftAssignments }, { data: overtime }, { data: unpaidLeave }] = await Promise.all([
      supabase
        .from("attendance_records")
        .select("work_date, status, late_minutes, early_leave_minutes, worked_minutes")
        .eq("employee_id", emp.id)
        .gte("work_date", period.period_start)
        .lte("work_date", period.period_end),
      supabase
        .from("shift_assignments")
        .select("work_date, is_day_off")
        .eq("employee_id", emp.id)
        .gte("work_date", period.period_start)
        .lte("work_date", period.period_end),
      supabase
        .from("overtime_requests")
        .select("work_date, approved_hours, rate_multiplier")
        .eq("employee_id", emp.id)
        .eq("status", "approved")
        .gte("work_date", period.period_start)
        .lte("work_date", period.period_end),
      supabase
        .from("leave_requests")
        .select("total_days, leave_types!inner(is_paid)")
        .eq("employee_id", emp.id)
        .eq("status", "approved")
        .eq("leave_types.is_paid", false)
        .gte("start_date", period.period_start)
        .lte("end_date", period.period_end),
    ]);

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
    const hasMissingData = days.length === 0;

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
    if (calcError || !calc) return null;

    await Promise.all([
      supabase.from("payroll_earning_items").delete().eq("payroll_calc_id", calc.id),
      supabase.from("payroll_deduction_items").delete().eq("payroll_calc_id", calc.id),
    ]);
    await Promise.all([
      result.earnings.length > 0
        ? supabase
            .from("payroll_earning_items")
            .insert(result.earnings.map((e) => ({ payroll_calc_id: calc.id, label: e.label, quantity: e.quantity, amount: satangToBaht(e.amountSatang) })))
        : Promise.resolve(),
      result.deductions.length > 0
        ? supabase
            .from("payroll_deduction_items")
            .insert(result.deductions.map((d) => ({ payroll_calc_id: calc.id, label: d.label, quantity: d.quantity, amount: satangToBaht(d.amountSatang) })))
        : Promise.resolve(),
    ]);

    return {
      gross: satangToBaht(result.grossEarningsSatang),
      deduction: satangToBaht(result.totalDeductionsSatang),
      net: satangToBaht(result.netPaySatang),
    };
  }

  const results = await Promise.all((employees ?? []).map(processEmployee));

  let totalGross = 0;
  let totalDeduction = 0;
  let totalNet = 0;
  for (const r of results) {
    if (!r) continue;
    totalGross += r.gross;
    totalDeduction += r.deduction;
    totalNet += r.net;
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

// A single "approve" step, not a separate submit-then-approve dance: for a
// small team the same person calculates and signs off, so the extra click
// and status hop were pure friction. The anomaly check that used to gate
// submission now gates approval directly.
export async function approvePayrollRunAction(runId: string) {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { count } = await supabase
    .from("payroll_employee_calculations")
    .select("id", { count: "exact", head: true })
    .eq("payroll_run_id", runId)
    .eq("has_anomaly", true);
  if ((count ?? 0) > 0) {
    throw new Error("ยังมีรายการที่มีความผิดปกติซึ่งยังไม่ได้ตรวจสอบ กรุณาแก้ไขก่อนอนุมัติ");
  }

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

  const { data: calcs } = await supabase.from("payroll_employee_calculations").select("*").eq("payroll_run_id", runId);

  await supabase.from("payroll_runs").update({ status: "locked", locked_at: new Date().toISOString(), locked_by: user.profileId }).eq("id", runId);

  const { data: run } = await supabase
    .from("payroll_runs")
    .select("payroll_period_id, org_id, payroll_periods(label, period_start, period_end, pay_date)")
    .eq("id", runId)
    .single();
  if (!run || !calcs) {
    revalidatePath(`/payroll/${runId}`);
    return;
  }

  const { data: org } = await supabase.from("organizations").select("name, legal_name").eq("id", run.org_id).single();
  const period = run.payroll_periods as unknown as { label: string; period_start: string; period_end: string; pay_date: string } | null;

  await supabase.from("payslips").upsert(
    calcs.map((c) => ({ payroll_calc_id: c.id, employee_id: c.employee_id, payroll_period_id: run.payroll_period_id, issued_at: new Date().toISOString() })),
    { onConflict: "payroll_calc_id" }
  );

  // Generate + upload each payslip PDF in parallel, same pattern as the payroll
  // calculation step — independent per-employee work, no reason to serialize it.
  //
  // Path is keyed on runId, not payroll_period_id: the `payslips` bucket's storage RLS
  // only grants INSERT (no UPDATE), so re-locking a period that already produced a payslip
  // at the same path fails with an RLS error on the upsert. Runs are already unique per
  // lock, so keying on runId means every generation writes a fresh object and never needs
  // to overwrite one — sidesteps the missing policy without needing DB access to add it.
  await Promise.all(
    calcs.map(async (c) => {
      try {
        const pdfBuffer = await generatePayslipBuffer({
          orgName: org?.name ?? "-",
          orgLegalName: org?.legal_name ?? null,
          employeeCode: c.employee_code_snapshot,
          employeeName: c.employee_name_snapshot,
          department: c.department_snapshot,
          position: c.position_snapshot,
          periodLabel: period?.label ?? "-",
          periodStart: period?.period_start ? new Date(period.period_start).toLocaleDateString("th-TH") : "-",
          periodEnd: period?.period_end ? new Date(period.period_end).toLocaleDateString("th-TH") : "-",
          payDate: period?.pay_date ? new Date(period.pay_date).toLocaleDateString("th-TH") : "-",
          baseAmount: Number(c.base_amount),
          otAmount: Number(c.ot_amount),
          workedDays: Number(c.worked_days),
          absentDays: Number(c.absent_days),
          lateCount: Number(c.late_count),
          grossEarnings: Number(c.gross_earnings),
          socialSecurityAmount: Number(c.social_security_amount),
          taxAmount: Number(c.tax_amount),
          totalDeductions: Number(c.total_deductions),
          netPay: Number(c.net_pay),
        });

        const path = `${run.org_id}/${c.employee_id}/payslip-${runId}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from("payslips")
          .upload(path, pdfBuffer, { contentType: "application/pdf", upsert: true });
        if (uploadError) {
          console.error(`Payslip upload failed for ${c.employee_code_snapshot}:`, uploadError.message);
          return;
        }

        await supabase.from("payslips").update({ pdf_file_path: path }).eq("payroll_calc_id", c.id);
      } catch (err) {
        console.error(`Payslip generation failed for ${c.employee_code_snapshot}:`, err);
      }
    })
  );

  revalidatePath(`/payroll/${runId}`);
}
