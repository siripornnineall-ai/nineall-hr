import type { PayrollPolicyConfig } from "@nineall-hr/payroll-engine";
import { bahtToSatang } from "@nineall-hr/payroll-engine";
import { createClient } from "@/lib/supabase/server";

/**
 * Fallback policy used only when the org hasn't configured `policy_settings` yet
 * (e.g. right after first setup). These are placeholder numbers, NOT authoritative
 * Thai tax/social-security law — see docs/PAYROLL_RULES.md. Admin-web's Settings
 * page always lets HR override them with a reviewed, effective-dated version.
 */
const FALLBACK_POLICY: PayrollPolicyConfig = {
  socialSecurity: {
    employeeRate: 0.05,
    minBaseSatang: bahtToSatang(1_650),
    maxContributionSatang: bahtToSatang(875),
  },
  taxBrackets: [
    { uptoSatang: bahtToSatang(150_000), rate: 0 },
    { uptoSatang: bahtToSatang(300_000), rate: 0.05 },
    { uptoSatang: bahtToSatang(500_000), rate: 0.1 },
    { uptoSatang: bahtToSatang(750_000), rate: 0.15 },
    { uptoSatang: bahtToSatang(1_000_000), rate: 0.2 },
    { uptoSatang: null, rate: 0.25 },
  ],
  otRateMultipliers: { normal: 1.5, holiday: 3 },
};

export async function loadPolicyConfig(orgId: string, asOfDate: string): Promise<PayrollPolicyConfig> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("policy_settings")
    .select("setting_type, value")
    .eq("org_id", orgId)
    .lte("effective_date", asOfDate)
    .order("effective_date", { ascending: false });

  const policy: PayrollPolicyConfig = structuredClone(FALLBACK_POLICY);
  const seen = new Set<string>();
  for (const row of data ?? []) {
    if (seen.has(row.setting_type)) continue; // most recent effective row wins
    seen.add(row.setting_type);
    if (row.setting_type === "social_security") policy.socialSecurity = row.value;
    if (row.setting_type === "tax_bracket") policy.taxBrackets = row.value;
    if (row.setting_type === "ot_rate") policy.otRateMultipliers = row.value;
  }
  return policy;
}
