// Probation period is a fixed 119 days from hire date company-wide.
export const PROBATION_DAYS = 119;

export function calculateProbationEndDate(hireDateIso: string): string | null {
  if (!hireDateIso) return null;
  const hire = new Date(`${hireDateIso}T00:00:00`);
  if (Number.isNaN(hire.getTime())) return null;
  hire.setDate(hire.getDate() + PROBATION_DAYS);
  return `${hire.getFullYear()}-${String(hire.getMonth() + 1).padStart(2, "0")}-${String(hire.getDate()).padStart(2, "0")}`;
}
