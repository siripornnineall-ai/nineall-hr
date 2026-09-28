// Which leave types make up the employee-facing "วันลาคงเหลือ" figure. Owner's rule
// (2026-09-28): only sick, personal and vacation leave. Every other type (unpaid, WFH,
// off-site, marriage, childcare, maternity, ...) can still be requested and still has its
// own quota enforced on the request — it just isn't shown as "days left".
export const QUOTA_DISPLAY_LEAVE_CODES = new Set(["SICK", "PERSONAL", "VACATION"]);

export function countsTowardLeaveQuota(code: string | null | undefined): boolean {
  return !!code && QUOTA_DISPLAY_LEAVE_CODES.has(code);
}
