-- HR/super_admin can delete a holiday-swap (สลับวันหยุดนักขัตฤกษ์) request outright
-- (requested 2026-10-07). An approved swap changed the schedule, so deleting it also puts the
-- schedule back, but only the parts the swap itself wrote and nobody has used:
--   * the holiday date's "work that day" shift row, and the substitute date's "day off" row,
--     both tagged source = 'holiday_swap' — unless another approved swap of the same person
--     still needs that same date
--   * the substitute date's "day_off" attendance placeholder with no clock-in
--   * for half-day swaps, the pre-filled 08:00-12:00 / 13:00-17:00 attendance with no GPS
-- Real clock-ins are never removed. Same shape as delete_leave_request (0101).

create or replace function public.delete_holiday_swap_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r holiday_swap_requests%rowtype;
  v_prev_trusted text;
  v_att uuid;
  v_hol_in_use boolean;
  v_sub_in_use boolean;
begin
  if not coalesce(is_admin_or_hr(), false) then
    raise exception 'FORBIDDEN: only super_admin/hr can delete a holiday swap request';
  end if;

  select * into r from holiday_swap_requests where id = p_request_id and org_id = current_org_id();
  if r.id is null then
    raise exception 'NOT_FOUND';
  end if;

  if r.status = 'approved' then
    -- Dates still claimed by another approved swap of the same employee.
    select exists (select 1 from holiday_swap_requests o
                    where o.employee_id = r.employee_id and o.id <> r.id and o.status = 'approved'
                      and (o.holiday_date = r.holiday_date or o.substitute_date = r.holiday_date)),
           exists (select 1 from holiday_swap_requests o
                    where o.employee_id = r.employee_id and o.id <> r.id and o.status = 'approved'
                      and (o.holiday_date = r.substitute_date or o.substitute_date = r.substitute_date))
      into v_hol_in_use, v_sub_in_use;

    v_prev_trusted := current_setting('app.trusted_attendance_write', true);
    perform set_config('app.trusted_attendance_write', 'true', true);

    if not v_hol_in_use then
      delete from shift_assignments
        where employee_id = r.employee_id and work_date = r.holiday_date
          and source = 'holiday_swap' and is_day_off = false;
      -- Half-day swaps pre-fill the worked half; remove that, keep any real scan.
      if r.unit = 'half_day' then
        delete from attendance_records
          where employee_id = r.employee_id and work_date = r.holiday_date
            and clock_in_latitude is null and clock_out_latitude is null
            and status = 'on_time'
            and to_char(clock_in_server_at at time zone 'Asia/Bangkok', 'HH24:MI') in ('08:00', '13:00');
      end if;
    end if;

    if r.unit <> 'half_day' and not v_sub_in_use then
      delete from shift_assignments
        where employee_id = r.employee_id and work_date = r.substitute_date
          and source = 'holiday_swap' and is_day_off = true;
      delete from attendance_records
        where employee_id = r.employee_id and work_date = r.substitute_date
          and status = 'day_off' and clock_in_server_at is null;
    end if;

    perform set_config('app.trusted_attendance_write', coalesce(v_prev_trusted, ''), true);
  end if;

  insert into audit_logs (org_id, actor_profile_id, action, entity_type, entity_id, before_data)
  values (r.org_id, auth.uid(), 'holiday_swap_requests.delete', 'holiday_swap_requests', r.id, to_jsonb(r));

  delete from holiday_swap_requests where id = r.id;

  -- A half-day swap shortened the substitute day's expected hours; judge that day again
  -- now the swap is gone.
  if r.status = 'approved' and r.unit = 'half_day' then
    select id into v_att from attendance_records
      where employee_id = r.employee_id and work_date = r.substitute_date and clock_in_server_at is not null
      limit 1;
    if v_att is not null then
      perform rejudge_attendance_day(v_att);
    end if;
  end if;
end;
$$;

revoke all on function public.delete_holiday_swap_request(uuid) from public;
grant execute on function public.delete_holiday_swap_request(uuid) to authenticated;
