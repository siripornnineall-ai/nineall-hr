export interface ChannelOption {
  id: string;
  name: string;
}

export interface EmployeeOption {
  id: string;
  code: string;
  name: string;
}

export interface ScheduleRow {
  id: string;
  channel_id: string;
  work_days: string;
  start_time: string;
  end_time: string;
}

export interface ProfileData {
  id: string;
  employeeId: string;
  employeeName: string;
  jobTitle: string | null;
  photoUrl: string | null;
  shiftLabel: string | null;
  duties: string[];
  schedules: ScheduleRow[];
}
