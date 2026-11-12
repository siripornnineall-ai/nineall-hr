-- Birthday reminders in the notification bell for HR + super_admin (owner 2026-11-01):
-- 7 days before and on the day, 08:00 Bangkok. Already applied to production on 2026-11-01; kept here so the
-- repository matches the database.
create or replace function public.send_birthday_notifications(p_today date default (now() at time zone 'Asia/Bangkok')::date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_rows integer;
  v_offset integer;
  v_target date;
begin
  foreach v_offset in array array[0, 7] loop
    v_target := p_today + v_offset;

    insert into notifications (org_id, profile_id, type, title, body, data, channel)
    select e.org_id, p.id, 'employee_birthday',
      case when v_offset = 0
        then '🎂 วันนี้วันเกิด ' || coalesce(nullif(e.nickname, ''), e.first_name)
        else '🎂 อีก 7 วันวันเกิด ' || coalesce(nullif(e.nickname, ''), e.first_name)
      end,
      e.first_name || ' ' || e.last_name
        || coalesce(' (' || nullif(e.nickname, '') || ')', '')
        || ' · ' || to_char(v_target, 'DD/MM')
        || ' · อายุครบ ' || (extract(year from v_target)::int - extract(year from e.date_of_birth)::int) || ' ปี',
      jsonb_build_object('employee_id', e.id, 'birthday', v_target, 'days_before', v_offset,
                         'dedupe_key', 'bday:' || e.id || ':' || v_target || ':' || v_offset),
      'in_app'
    from employees e
    join profiles p on p.org_id = e.org_id and p.is_active and p.role in ('hr', 'super_admin')
    where e.deleted_at is null
      and e.date_of_birth is not null
      and e.employment_status in ('active', 'probation')
      and (
        to_char(e.date_of_birth, 'MM-DD') = to_char(v_target, 'MM-DD')
        or (to_char(e.date_of_birth, 'MM-DD') = '02-29'
            and to_char(v_target, 'MM-DD') = '02-28'
            and to_char(v_target + 1, 'MM-DD') = '03-01')
      )
      and not exists (
        select 1 from notifications n
        where n.profile_id = p.id and n.type = 'employee_birthday'
          and n.data->>'dedupe_key' = 'bday:' || e.id || ':' || v_target || ':' || v_offset
      );

    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.send_birthday_notifications(date) from public, anon, authenticated;

select cron.schedule('birthday-notifications-daily', '0 1 * * *', $$select public.send_birthday_notifications()$$);
