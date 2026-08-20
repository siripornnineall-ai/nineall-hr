"use server";

import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateCertificateBuffer } from "@/lib/pdf/generateCertificateBuffer";

export async function generateCertificateAction(
  showSalary: boolean,
  purpose: string
): Promise<{ error?: string; base64?: string; filename?: string }> {
  const user = await requireEmployee();
  const supabase = await createClient();

  const { data: employee } = await supabase
    .from("employees")
    .select("employee_code, first_name, last_name, hire_date, employment_type, departments(name), job_positions(title)")
    .eq("id", user.employeeId)
    .single();
  if (!employee) return { error: "ไม่พบข้อมูลพนักงาน" };

  const { data: org } = await supabase.from("organizations").select("name, legal_name, tax_id").eq("id", user.orgId).single();

  let baseAmountBaht: number | null = null;
  if (showSalary) {
    const { data: comp } = await supabase
      .from("employee_compensation")
      .select("base_amount")
      .eq("employee_id", user.employeeId)
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    baseAmountBaht = comp ? Number(comp.base_amount) : null;
  }

  try {
    const pdfBuffer = await generateCertificateBuffer({
      orgName: org?.name ?? "-",
      orgLegalName: org?.legal_name ?? null,
      orgTaxId: org?.tax_id ?? null,
      employeeCode: employee.employee_code,
      employeeName: `${employee.first_name} ${employee.last_name}`,
      position: (employee.job_positions as unknown as { title: string } | null)?.title ?? null,
      department: (employee.departments as unknown as { name: string } | null)?.name ?? null,
      employmentType: employee.employment_type,
      hireDate: new Date(employee.hire_date).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }),
      baseAmountBaht,
      showSalary,
      purpose: purpose || null,
      issueDate: new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }),
    });
    return { base64: pdfBuffer.toString("base64"), filename: `certificate-${employee.employee_code}-${Date.now()}.pdf` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "สร้างเอกสารไม่สำเร็จ" };
  }
}
