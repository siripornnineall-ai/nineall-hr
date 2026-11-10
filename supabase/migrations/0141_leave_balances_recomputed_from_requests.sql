-- leave_balances.used_days / pending_days were kept by incremental triggers (+/- on insert and status change). Deleting a
-- request, WFH/OFFSITE approvals and similar paths drifted them, so employees saw "รออนุมัติ" days with no request left
-- to approve (owner 2026-11-10). The truth is the leave requests themselves, so: (1) snapshot + reconcile every balance
-- row now, (2) recompute the affected row after every insert / update / delete of a leave request from then on.

create or replace function public.recompute_leave_balance(p_employee_id uuid, p_leave_type_id uuid, p_year integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update leave_balances b
     set used_days = coalesce((select sum(l.total_days) from leave_requests l
                                where l.employee_id = b.employee_id and l.leave_type_id = b.leave_type_id
                                  and extract(year from l.start_date)::int = b.year and l.status = 'approved'), 0),
         pending_days = coalesce((select sum(l.total_days) from leave_requests l
                                   where l.employee_id = b.employee_id and l.leave_type_id = b.leave_type_id
                                     and extract(year from l.start_date)::int = b.year and l.status = 'pending'), 0)
   where b.employee_id = p_employee_id and b.leave_type_id = p_leave_type_id and b.year = p_year;
end;
$$;
revoke all on function public.recompute_leave_balance(uuid, uuid, integer) from public;

create or replace function public.trg_recompute_leave_balance()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform recompute_leave_balance(old.employee_id, old.leave_type_id, extract(year from old.start_date)::int);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform recompute_leave_balance(new.employee_id, new.leave_type_id, extract(year from new.start_date)::int);
  end if;
  return null;
end;
$$;

-- fires after the older incremental triggers (alphabetical order), so its result is what stays
create trigger trg_leave_zz_recompute_balance
  after insert or delete or update of status, total_days, leave_type_id, start_date, employee_id on public.leave_requests
  for each row execute function public.trg_recompute_leave_balance();

-- one-time reconcile, with a snapshot of every changed row in audit_logs (action 'leave_balances.reconcile') so it can be reverted
with calc as (
  select b.id, e.org_id, b.used_days old_used, b.pending_days old_pending,
         coalesce((select sum(l.total_days) from leave_requests l where l.employee_id = b.employee_id and l.leave_type_id = b.leave_type_id
                    and extract(year from l.start_date)::int = b.year and l.status = 'approved'), 0) new_used,
         coalesce((select sum(l.total_days) from leave_requests l where l.employee_id = b.employee_id and l.leave_type_id = b.leave_type_id
                    and extract(year from l.start_date)::int = b.year and l.status = 'pending'), 0) new_pending
    from leave_balances b join employees e on e.id = b.employee_id
), changed as (
  select * from calc where old_used is distinct from new_used or old_pending is distinct from new_pending
), logged as (
  insert into audit_logs (org_id, actor_profile_id, action, entity_type, entity_id, before_data)
  select c.org_id, null, 'leave_balances.reconcile', 'leave_balances', c.id,
         jsonb_build_object('used_days', c.old_used, 'pending_days', c.old_pending, 'new_used_days', c.new_used, 'new_pending_days', c.new_pending)
    from changed c
  returning 1
)
update leave_balances b set used_days = c.new_used, pending_days = c.new_pending
  from changed c where c.id = b.id;
