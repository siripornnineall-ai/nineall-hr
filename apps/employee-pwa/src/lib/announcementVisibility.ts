export interface AnnouncementVisibilityCheck {
  targetType: string;
  targetIds: string[];
  expireAt: string | null;
}

export interface EmployeeScope {
  employeeId: string;
  departmentId: string | null;
  teamId: string | null;
  branchId: string | null;
}

// Shared between the announcements list and detail pages so a targeted announcement
// can't be viewed by guessing its id — the detail page must apply the exact same rule
// the list uses to decide what an employee is allowed to see.
export function isAnnouncementVisibleTo(announcement: AnnouncementVisibilityCheck, employee: EmployeeScope): boolean {
  if (announcement.expireAt && new Date(announcement.expireAt) < new Date()) return false;
  switch (announcement.targetType) {
    case "all":
      return true;
    case "employee":
      return announcement.targetIds.includes(employee.employeeId);
    case "department":
      return !!employee.departmentId && announcement.targetIds.includes(employee.departmentId);
    case "team":
      return !!employee.teamId && announcement.targetIds.includes(employee.teamId);
    case "branch":
      return !!employee.branchId && announcement.targetIds.includes(employee.branchId);
    default:
      return false;
  }
}
