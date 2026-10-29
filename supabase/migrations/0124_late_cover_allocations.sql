-- Show WHERE a covered late day was paid from (owner 2026-10-29: "say which day it was deducted from and how
-- many minutes, so nobody gets confused"). The same rule as 0123 (spare time after the shift end, anywhere in
-- the year, covers leftover lateness, oldest lateness first; a late day is covered only when the whole pool is
-- enough for all of its minutes), but the minutes are now assigned to concrete days: the spare time of the
-- days closest BEFORE the late day is used first, then the days after it, oldest first.
--   * _late_cover_allocations(): rows (late_date, source_date, minutes_used) where either date is in the range
--   * _late_covered_dates(): now derived from the allocations (same result as 0123)
--   * late_cover_details(): checked wrapper for the screens (HR/admin or the person themself)
-- Display only; nothing is deducted here.

create or replace function public._late_cover_allocations(p_employee_id uuid, p_from date, p_to date)
returns table(late_date date, source_date date, minutes_used integer)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_year_start date := make_date(extract(year from p_to)::int, 1, 1);
  v_year_end date := make_date(extract(year from p_to)::int, 12, 31);
  sd date[];
  sr integer[];
  v_n integer;
  v_piv integer;
  k integer;
  v_total integer := 0;
  v_need integer;
  v_take integer;
  r record;
begin
  select coalesce(array_agg(q.d order by q.d), '{}'), coalesce(array_agg(q.sp order by q.d), '{}')
    into sd, sr
  from (
    select a.work_date as d,
           greatest(0, x.after_end - x.orig_late) as sp
    from attendance_records a
    join work_shifts s on s.id = a.shift_id
    cross join lateral (
      select
        greatest(0, round(extract(epoch from (a.clock_out_server_at - ((a.work_date + s.end_time) at time zone 'Asia/Bangkok'))) / 60))::int as after_end,
        greatest(0, greatest(0, round(extract(epoch from (a.clock_in_server_at - ((a.work_date + s.start_time) at time zone 'Asia/Bangkok'))) / 60))::int - coalesce(s.grace_minutes_late, 0)) as orig_late
    ) x
    where a.employee_id = p_employee_id
      and a.work_date between v_year_start and v_year_end
      and a.status in ('on_time', 'late', 'early_leave')
      and a.clock_in_server_at is not null and a.clock_out_server_at is not null
  ) q
  where q.sp > 0;

  v_n := coalesce(array_length(sd, 1), 0);
  select coalesce(sum(v), 0) into v_total from unnest(sr) as v;

  for r in
    select a.work_date as d, a.late_minutes as m
      from attendance_records a
     where a.employee_id = p_employee_id and a.status = 'late' and a.late_minutes > 0
       and a.work_date between v_year_start and v_year_end
     order by a.work_date
  loop
    if v_total >= r.m then
      v_need := r.m;
      v_total := v_total - r.m;

      v_piv := 0;
      for k in 1..v_n loop
        if sd[k] <= r.d then
          v_piv := k;
        end if;
      end loop;

      -- spare time of the closest earlier days first
      k := v_piv;
      while v_need > 0 and k >= 1 loop
        if sr[k] > 0 then
          v_take := least(v_need, sr[k]);
          sr[k] := sr[k] - v_take;
          v_need := v_need - v_take;
          if r.d between p_from and p_to or sd[k] between p_from and p_to then
            late_date := r.d;
            source_date := sd[k];
            minutes_used := v_take;
            return next;
          end if;
        end if;
        k := k - 1;
      end loop;

      -- then the days after it, oldest first
      k := v_piv + 1;
      while v_need > 0 and k <= v_n loop
        if sr[k] > 0 then
          v_take := least(v_need, sr[k]);
          sr[k] := sr[k] - v_take;
          v_need := v_need - v_take;
          if r.d between p_from and p_to or sd[k] between p_from and p_to then
            late_date := r.d;
            source_date := sd[k];
            minutes_used := v_take;
            return next;
          end if;
        end if;
        k := k + 1;
      end loop;
    end if;
  end loop;
end;
$$;

revoke all on function public._late_cover_allocations(uuid, date, date) from public;

create or replace function public._late_covered_dates(p_employee_id uuid, p_from date, p_to date)
returns setof date
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct a.late_date from public._late_cover_allocations(p_employee_id, p_from, p_to) a
  where a.late_date between p_from and p_to;
$$;

revoke all on function public._late_covered_dates(uuid, date, date) from public;

create or replace function public.late_cover_details(p_employee_id uuid, p_from date, p_to date)
returns table(late_date date, source_date date, minutes_used integer)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not (coalesce(is_admin_or_hr(), false) or p_employee_id = current_employee_id()) then
    return;
  end if;
  return query select * from public._late_cover_allocations(p_employee_id, p_from, p_to);
end;
$$;
revoke all on function public.late_cover_details(uuid, date, date) from public;
grant execute on function public.late_cover_details(uuid, date, date) to authenticated;
