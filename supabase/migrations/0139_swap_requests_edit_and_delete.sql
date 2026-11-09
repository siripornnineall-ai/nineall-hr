-- Day-off swap (สลับวันหยุดประจำ) and holiday swap (สลับวันหยุดนักขัตฤกษ์): HR can edit and delete a request
-- (owner 2026-11-09).
--   * delete_day_off_swap_request: new (holiday swap already had delete_holiday_swap_request, 0104).
--   * an approved swap has already changed the schedule, so both delete and edit first put back what the swap
--     itself wrote and nobody used (see _undo_*_swap_effects). Real clock-ins are never removed.
--   * edit of an approved swap = reopen_*_swap_request (undo the schedule, status back to pending) -> the admin app
--     updates the fields -> approves again, which applies the new dates through the normal approval code.

-- ---------- holiday swap ----------
create or replace function public._undo_holiday_swap_effects(r holiday_swap_requests)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_prev_trusted text;
  v_hol_in_use boolean;
  v_sub_in_use boolean;
begin
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
end;
$$;
revoke all on function public._undo_holiday_swap_effects(holiday_swap_requests) from public;

create or replace function public.delete_holiday_swap_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r holiday_swap_requests%rowtype;
  v_att uuid;
begin
  if not coalesce(is_admin_or_hr(), false) then
    raise exception 'FORBIDDEN: only super_admin/hr can delete a holiday swap request';
  end if;

  select * into r from holiday_swap_requests where id = p_request_id and org_id = current_org_id();
  if r.id is null then
    raise exception 'NOT_FOUND';
  end if;

  if r.status = 'approved' then
    perform _undo_holiday_swap_effects(r);
  end if;

  insert into audit_logs (org_id, actor_profile_id, action, entity_type, entity_id, before_data)
  values (r.org_id, auth.uid(), 'holiday_swap_requests.delete', 'holiday_swap_requests', r.id, to_jsonb(r));

  delete from holiday_swap_requests where id = r.id;

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

create or replace function public.reopen_holiday_swap_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r holiday_swap_requests%rowtype;
  v_att uuid;
begin
  if not coalesce(is_admin_or_hr(), false) then
    raise exception 'FORBIDDEN: only super_admin/hr can edit a holiday swap request';
  end if;
  select * into r from holiday_swap_requests where id = p_request_id and org_id = current_org_id();
  if r.id is null then
    raise exception 'NOT_FOUND';
  end if;
  if r.status <> 'approved' then
    return;
  end if;

  perform _undo_holiday_swap_effects(r);
  update holiday_swap_requests set status = 'pending', decided_at = null, decided_by = null where id = r.id;
  insert into audit_logs (org_id, actor_profile_id, action, entity_type, entity_id, before_data)
  values (r.org_id, auth.uid(), 'holiday_swap_requests.edit', 'holiday_swap_requests', r.id, to_jsonb(r));

  if r.unit = 'half_day' then
    select id into v_att from attendance_records
      where employee_id = r.employee_id and work_date = r.substitute_date and clock_in_server_at is not null
      limit 1;
    if v_att is not null then
      perform rejudge_attendance_day(v_att);
    end if;
  end if;
end;
$$;
revoke all on function public.reopen_holiday_swap_request(uuid) from public;
grant execute on function public.reopen_holiday_swap_request(uuid) to authenticated;

-- ---------- day-off swap ----------
-- Putting a swap back: the original (normally day-off) date goes back to a day off, the substitute date goes back to
-- a working day on the employee's usual shift. Only rows the swap itself wrote (source = 'day_off_swap') are touched,
-- and dates still claimed by another approved swap of the same person are left alone.
create or replace function public._undo_day_off_swap_effects(r day_off_swap_requests)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_prev_trusted text;
  v_orig_in_use boolean := false;
  v_sub_in_use boolean;
  v_shift uuid;
  v_loc uuid;
begin
  if r.original_date is not null then
    select exists (select 1 from day_off_swap_requests o
                    where o.employee_id = r.employee_id and o.id <> r.id and o.status = 'approved'
                      and (o.original_date = r.original_date or o.substitute_date = r.original_date))
      into v_orig_in_use;
  end if;
  select exists (select 1 from day_off_swap_requests o
                  where o.employee_id = r.employee_id and o.id <> r.id and o.status = 'approved'
                    and (o.original_date = r.substitute_date or o.substitute_date = r.substitute_date))
    into v_sub_in_use;

  select shift_id, work_location_id into v_shift, v_loc
    from shift_assignments
   where employee_id = r.employee_id and shift_id is not null
   order by work_date desc limit 1;

  v_prev_trusted := current_setting('app.trusted_attendance_write', true);
  perform set_config('app.trusted_attendance_write', 'true', true);

  if r.original_date is not null and not v_orig_in_use then
    if r.unit = 'half_day' then
      delete from attendance_records
        where employee_id = r.employee_id and work_date = r.original_date
          and clock_in_latitude is null and clock_out_latitude is null
          and status = 'on_time'
          and to_char(clock_in_server_at at time zone 'Asia/Bangkok', 'HH24:MI') in ('08:00', '13:00');
    else
      update shift_assignments
         set is_day_off = true, shift_id = null, source = 'manual', updated_at = now()
       where employee_id = r.employee_id and work_date = r.original_date
         and source = 'day_off_swap' and is_day_off = false;
    end if;
  end if;

  if r.unit <> 'half_day' and not v_sub_in_use then
    update shift_assignments
       set is_day_off = false, shift_id = v_shift, work_location_id = coalesce(v_loc, work_location_id),
           source = 'manual', updated_at = now()
     where employee_id = r.employee_id and work_date = r.substitute_date
       and source = 'day_off_swap' and is_day_off = true;
    delete from attendance_records
      where employee_id = r.employee_id and work_date = r.substitute_date
        and status = 'day_off' and clock_in_server_at is null;
  end if;

  perform set_config('app.trusted_attendance_write', coalesce(v_prev_trusted, ''), true);
end;
$$;
revoke all on function public._undo_day_off_swap_effects(day_off_swap_requests) from public;

create or replace function public.delete_day_off_swap_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r day_off_swap_requests%rowtype;
  v_att uuid;
begin
  if not coalesce(is_admin_or_hr(), false) then
    raise exception 'FORBIDDEN: only super_admin/hr can delete a day-off swap request';
  end if;
  select * into r from day_off_swap_requests where id = p_request_id and org_id = current_org_id();
  if r.id is null then
    raise exception 'NOT_FOUND';
  end if;

  if r.status = 'approved' then
    perform _undo_day_off_swap_effects(r);
  end if;

  insert into audit_logs (org_id, actor_profile_id, action, entity_type, entity_id, before_data)
  values (r.org_id, auth.uid(), 'day_off_swap_requests.delete', 'day_off_swap_requests', r.id, to_jsonb(r));

  delete from day_off_swap_requests where id = r.id;

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
revoke all on function public.delete_day_off_swap_request(uuid) from public;
grant execute on function public.delete_day_off_swap_request(uuid) to authenticated;

create or replace function public.reopen_day_off_swap_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r day_off_swap_requests%rowtype;
  v_att uuid;
begin
  if not coalesce(is_admin_or_hr(), false) then
    raise exception 'FORBIDDEN: only super_admin/hr can edit a day-off swap request';
  end if;
  select * into r from day_off_swap_requests where id = p_request_id and org_id = current_org_id();
  if r.id is null then
    raise exception 'NOT_FOUND';
  end if;
  if r.status <> 'approved' then
    return;
  end if;

  perform _undo_day_off_swap_effects(r);
  update day_off_swap_requests set status = 'pending', decided_at = null, decided_by = null where id = r.id;
  insert into audit_logs (org_id, actor_profile_id, action, entity_type, entity_id, before_data)
  values (r.org_id, auth.uid(), 'day_off_swap_requests.edit', 'day_off_swap_requests', r.id, to_jsonb(r));

  if r.unit = 'half_day' then
    select id into v_att from attendance_records
      where employee_id = r.employee_id and work_date = r.substitute_date and clock_in_server_at is not null
      limit 1;
    if v_att is not null then
      perform rejudge_attendance_day(v_att);
    end if;
  end if;
end;
$$;
revoke all on function public.reopen_day_off_swap_request(uuid) from public;
grant execute on function public.reopen_day_off_swap_request(uuid) to authenticated;
