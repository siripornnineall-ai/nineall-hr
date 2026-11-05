-- Personal leave (ลากิจ) no longer has to be requested in advance (owner 2026-11-05). Both the database guard
-- enforce_leave_notice() and the employee app read notice_days_required from the latest leave policy, so setting
-- it to 0 lifts the 3-day rule everywhere. Vacation keeps its 7 days.

update public.leave_policies lp
   set notice_days_required = 0
  from public.leave_types lt
 where lt.id = lp.leave_type_id and lt.code = 'PERSONAL' and lp.notice_days_required <> 0;
