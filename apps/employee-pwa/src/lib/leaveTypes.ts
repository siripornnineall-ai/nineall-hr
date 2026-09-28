// Leave types that are not part of an employee's leave quota. They still exist as request
// types (unpaid leave, WFH, off-site work, marriage, childcare) but the owner's rule
// (2026-09-28) is that "วันลาคงเหลือ" means the quota kinds only — sick, personal,
// vacation, etc. — so these are left out of the remaining-days figure and list.
export const NON_QUOTA_LEAVE_CODES = new Set(["UNPAID", "WFH", "OFFSITE", "MARRIAGE", "CHILDCARE"]);

export function countsTowardLeaveQuota(code: string | null | undefined): boolean {
  return !!code && !NON_QUOTA_LEAVE_CODES.has(code);
}
