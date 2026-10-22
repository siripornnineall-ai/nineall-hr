-- Advance notice for leave (owner 2026-10-22): ลากิจ must be requested at least 3 days ahead and
-- ลาพักร้อน at least 7 days ahead. A request that does not meet it is refused outright.
--
--   * the numbers live in leave_policies.notice_days_required (editable in Settings); this
--     migration sets 3 (PERSONAL) and 7 (VACATION) on the policy in force
--   * only those two leave types are enforced for now (the other types already carry their own
--     notice numbers in the policy table, which have never been enforced and are left alone)
--   * HR / admins entering a request for someone, including back-dated ones, are exempt, as are
--     requests made without a login session (jobs)
--   * the rule is "start date >= today + notice days", counted on the Bangkok date

update leave_policies lp
   set notice_days_required = case lt.code when 'PERSONAL' then 3 when 'VACATION' then 7 end
  from leave_types lt
 where lt.id = lp.leave_type_id and lt.code in ('PERSONAL', 'VACATION')
   and lp.effective_date = (select max(p2.effective_date) from leave_policies p2 where p2.leave_type_id = lp.leave_type_id and p2.effective_date <= current_date);

create or replace function public.enforce_leave_notice()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_code text;
  v_name text;
  v_notice integer;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if auth.uid() is null or coalesce(is_admin_or_hr(), false) then
    return new;
  end if;

  select code, name_th into v_code, v_name from leave_types where id = new.leave_type_id;
  if v_code not in ('PERSONAL', 'VACATION') then
    return new;
  end if;

  select coalesce(notice_days_required, 0) into v_notice
    from leave_policies
    where leave_type_id = new.leave_type_id and effective_date <= v_today
    order by effective_date desc
    limit 1;

  if coalesce(v_notice, 0) > 0 and new.start_date < v_today + v_notice then
    raise exception '%ต้องขอล่วงหน้าอย่างน้อย % วัน (ลาได้ตั้งแต่วันที่ %) หากมีเหตุจำเป็นเร่งด่วนให้ติดต่อ HR',
      v_name, v_notice, to_char(v_today + v_notice, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leave_requests_a_notice on public.leave_requests;
create trigger trg_leave_requests_a_notice
  before insert on public.leave_requests
  for each row execute function public.enforce_leave_notice();
