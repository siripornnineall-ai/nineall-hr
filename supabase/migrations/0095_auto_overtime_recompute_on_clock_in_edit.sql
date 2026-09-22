-- The auto-OT recompute trigger (0089/0090) only fired when the clock-out, shift or status
-- changed. Since 0091 the OT figure also depends on the clock-in (morning lateness is
-- netted off), so an HR edit that only moved the clock-in time left ot_minutes and the
-- auto OT row stale — seen live on 2026-09-22 (a row stuck at 129 raw minutes instead of
-- the rounded 120). Fire on clock_in_server_at changes too.

drop trigger if exists trg_auto_overtime_update on attendance_records;
create trigger trg_auto_overtime_update
  after update of clock_in_server_at, clock_out_server_at, shift_id, status on attendance_records
  for each row
  when (old.clock_in_server_at is distinct from new.clock_in_server_at
        or old.clock_out_server_at is distinct from new.clock_out_server_at
        or old.shift_id is distinct from new.shift_id
        or old.status is distinct from new.status)
  execute function sync_auto_overtime_from_attendance();
