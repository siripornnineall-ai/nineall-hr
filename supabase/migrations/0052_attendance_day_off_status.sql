-- A regular scheduled day off (e.g. an employee's weekly Sunday off, set via the weekly
-- schedule editor) previously had no presence on the Attendance page at all — same gap
-- public holidays had before migration 0049-era fixes. Distinct from 'holiday' (a named
-- public holiday) so the two can be labeled differently.
alter type attendance_status add value if not exists 'day_off';
