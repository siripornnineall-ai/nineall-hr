-- One-off for Ice (owner 2026-10-30): her WFH day on 31 Oct 2026 is used to make up for her lateness, and must
-- show as WFH. Not a general rule: only an attendance row that was explicitly marked by hand (status
-- 'work_from_home' and edit_reason starting with 'ชดเวลามาสาย') counts as make-up time, using its worked_minutes.
-- Nothing else changes: normal WFH requests/days still give no make-up time. The allocation rows now carry
-- is_wfh so the screens can write "WFH" next to that source day. Display only; nothing is deducted here.

drop function if exists public.late_cover_details(uuid, date, date);
drop function if exists public._late_cover_allocations(uuid, date, date);

create or replace function public._late_cover_allocations(p_employee_id uuid, p_from date, p_to date)
returns table(late_date date, source_date date, minutes_used integer, is_wfh boolean)
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
  sw boolean[];
  v_n integer;
  v_piv integer;
  k integer;
  v_total integer := 0;
  v_need integer;
  v_take integer;
  r record;
begin
  select coalesce(array_agg(q.d order by q.d), '{}'), coalesce(array_agg(q.sp order by q.d), '{}'), coalesce(array_agg(q.w order by q.d), '{}')
    into sd, sr, sw
  from (
    -- spare time after the shift end on normal working days
    select a.work_date as d,
           greatest(0, x.after_end - x.orig_late) as sp,
           false as w
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
    union all
    -- hand-marked WFH make-up day
    select m.work_date, m.worked_minutes::int, true
    from attendance_records m
    where m.employee_id = p_employee_id
      and m.work_date between v_year_start and v_year_end
      and m.status = 'work_from_home'
      and m.edit_reason like 'ชดเวลามาสาย%'
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
            is_wfh := sw[k];
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
            is_wfh := sw[k];
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

create or replace function public.late_cover_details(p_employee_id uuid, p_from date, p_to date)
returns table(late_date date, source_date date, minutes_used integer, is_wfh boolean)
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
