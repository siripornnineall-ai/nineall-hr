-- Nineall HR — Row Level Security policies
-- Principle: every business table is scoped to the caller's organization, then
-- narrowed by role. Employees see only themselves; managers see their team;
-- HR/super_admin see the whole org. Salary/bank data is never visible to managers.

-- ---------- organizations ----------
alter table organizations enable row level security;
create policy org_select on organizations for select
  using (id = current_org_id());
create policy org_write on organizations for all
  using (id = current_org_id() and current_user_role() = 'super_admin')
  with check (id = current_org_id() and current_user_role() = 'super_admin');

-- ---------- org-scoped reference tables: admin/HR write, everyone in org read ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'branches', 'work_locations', 'departments', 'teams', 'job_positions',
    'work_shifts', 'company_holidays', 'leave_types', 'earnings_types',
    'deduction_types', 'system_settings', 'role_permissions'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy %I on %I for select using (org_id = current_org_id());',
      t || '_select', t
    );
    execute format(
      'create policy %I on %I for all using (org_id = current_org_id() and is_admin_or_hr()) with check (org_id = current_org_id() and is_admin_or_hr());',
      t || '_write', t
    );
  end loop;
end $$;

-- leave_policies / policy_settings are keyed off leave_type_id / org_id respectively
alter table leave_policies enable row level security;
create policy leave_policies_select on leave_policies for select
  using (exists (select 1 from leave_types lt where lt.id = leave_policies.leave_type_id and lt.org_id = current_org_id()));
create policy leave_policies_write on leave_policies for all
  using (exists (select 1 from leave_types lt where lt.id = leave_policies.leave_type_id and lt.org_id = current_org_id()) and is_admin_or_hr())
  with check (exists (select 1 from leave_types lt where lt.id = leave_policies.leave_type_id and lt.org_id = current_org_id()) and is_admin_or_hr());

alter table policy_settings enable row level security;
create policy policy_settings_select on policy_settings for select
  using (org_id = current_org_id() and is_admin_or_hr());
create policy policy_settings_write on policy_settings for all
  using (org_id = current_org_id() and current_user_role() = 'super_admin')
  with check (org_id = current_org_id() and current_user_role() = 'super_admin');

-- ---------- profiles ----------
alter table profiles enable row level security;
create policy profiles_select on profiles for select
  using (org_id = current_org_id() and (id = auth.uid() or is_admin_or_hr() or is_manager_of(employee_id)));
create policy profiles_update_self on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
create policy profiles_write_admin on profiles for all
  using (org_id = current_org_id() and current_user_role() = 'super_admin')
  with check (org_id = current_org_id() and current_user_role() = 'super_admin');

-- ---------- employees ----------
alter table employees enable row level security;
create policy employees_select on employees for select
  using (
    org_id = current_org_id()
    and (is_admin_or_hr() or is_self(id) or is_manager_of(id))
  );
create policy employees_write_admin_hr on employees for all
  using (org_id = current_org_id() and is_admin_or_hr())
  with check (org_id = current_org_id() and is_admin_or_hr());
create policy employees_update_self on employees for update
  using (id = current_employee_id())
  with check (id = current_employee_id());

alter table employment_records enable row level security;
create policy employment_records_select on employment_records for select
  using (exists (select 1 from employees e where e.id = employment_records.employee_id
    and (is_admin_or_hr() or is_self(e.id) or is_manager_of(e.id))));
create policy employment_records_write on employment_records for all
  using (exists (select 1 from employees e where e.id = employment_records.employee_id and e.org_id = current_org_id()) and is_admin_or_hr())
  with check (exists (select 1 from employees e where e.id = employment_records.employee_id and e.org_id = current_org_id()) and is_admin_or_hr());

-- Salary and bank data: HR/super_admin, and the employee themself. Managers: never.
alter table employee_compensation enable row level security;
create policy employee_compensation_select on employee_compensation for select
  using (is_admin_or_hr() or is_self(employee_id));
create policy employee_compensation_write on employee_compensation for all
  using (exists (select 1 from employees e where e.id = employee_compensation.employee_id and e.org_id = current_org_id()) and is_admin_or_hr())
  with check (exists (select 1 from employees e where e.id = employee_compensation.employee_id and e.org_id = current_org_id()) and is_admin_or_hr());

alter table bank_accounts enable row level security;
create policy bank_accounts_select on bank_accounts for select
  using (is_admin_or_hr() or is_self(employee_id));
create policy bank_accounts_write on bank_accounts for all
  using ((is_admin_or_hr() and exists (select 1 from employees e where e.id = bank_accounts.employee_id and e.org_id = current_org_id())) or is_self(employee_id))
  with check ((is_admin_or_hr() and exists (select 1 from employees e where e.id = bank_accounts.employee_id and e.org_id = current_org_id())) or is_self(employee_id));

alter table emergency_contacts enable row level security;
create policy emergency_contacts_select on emergency_contacts for select
  using (is_admin_or_hr() or is_self(employee_id) or is_manager_of(employee_id));
create policy emergency_contacts_write on emergency_contacts for all
  using (is_admin_or_hr() or is_self(employee_id))
  with check (is_admin_or_hr() or is_self(employee_id));

alter table employee_documents enable row level security;
create policy employee_documents_select on employee_documents for select
  using (is_admin_or_hr() or is_self(employee_id));
create policy employee_documents_write on employee_documents for all
  using (is_admin_or_hr() or is_self(employee_id))
  with check (is_admin_or_hr() or is_self(employee_id));

-- ---------- attendance ----------
alter table shift_assignments enable row level security;
create policy shift_assignments_select on shift_assignments for select
  using (org_id = current_org_id() and (is_admin_or_hr() or is_self(employee_id) or is_manager_of(employee_id)));
create policy shift_assignments_write on shift_assignments for all
  using (org_id = current_org_id() and (is_admin_or_hr() or is_manager_of(employee_id)))
  with check (org_id = current_org_id() and (is_admin_or_hr() or is_manager_of(employee_id)));

alter table shift_swap_requests enable row level security;
create policy shift_swap_select on shift_swap_requests for select
  using (org_id = current_org_id() and (is_admin_or_hr() or is_self(requester_employee_id) or is_self(target_employee_id) or is_manager_of(requester_employee_id)));
create policy shift_swap_insert on shift_swap_requests for insert
  with check (org_id = current_org_id() and is_self(requester_employee_id));
create policy shift_swap_update on shift_swap_requests for update
  using (org_id = current_org_id() and (is_admin_or_hr() or is_manager_of(requester_employee_id)))
  with check (org_id = current_org_id() and (is_admin_or_hr() or is_manager_of(requester_employee_id)));

alter table attendance_records enable row level security;
create policy attendance_select on attendance_records for select
  using (org_id = current_org_id() and (is_admin_or_hr() or is_self(employee_id) or is_manager_of(employee_id)));
create policy attendance_insert_self on attendance_records for insert
  with check (org_id = current_org_id() and is_self(employee_id));
create policy attendance_update_self on attendance_records for update
  using (org_id = current_org_id() and is_self(employee_id))
  with check (org_id = current_org_id() and is_self(employee_id));
create policy attendance_write_admin_hr on attendance_records for all
  using (org_id = current_org_id() and is_admin_or_hr())
  with check (org_id = current_org_id() and is_admin_or_hr());

alter table break_records enable row level security;
create policy break_records_select on break_records for select
  using (exists (select 1 from attendance_records a where a.id = break_records.attendance_id
    and (is_admin_or_hr() or is_self(a.employee_id) or is_manager_of(a.employee_id))));
create policy break_records_write on break_records for all
  using (exists (select 1 from attendance_records a where a.id = break_records.attendance_id and (is_admin_or_hr() or is_self(a.employee_id))))
  with check (exists (select 1 from attendance_records a where a.id = break_records.attendance_id and (is_admin_or_hr() or is_self(a.employee_id))));

alter table time_correction_requests enable row level security;
create policy time_correction_select on time_correction_requests for select
  using (org_id = current_org_id() and (is_admin_or_hr() or is_self(employee_id) or is_manager_of(employee_id)));
create policy time_correction_insert on time_correction_requests for insert
  with check (org_id = current_org_id() and is_self(employee_id));
create policy time_correction_update on time_correction_requests for update
  using (org_id = current_org_id() and (is_admin_or_hr() or is_manager_of(employee_id) or (is_self(employee_id) and status = 'pending')))
  with check (org_id = current_org_id() and (is_admin_or_hr() or is_manager_of(employee_id) or is_self(employee_id)));

-- ---------- approvals (leave / OT / time-correction / shift-swap / payroll) ----------
alter table approval_steps enable row level security;
create policy approval_steps_select on approval_steps for select
  using (org_id = current_org_id() and (is_admin_or_hr() or is_self(approver_employee_id) or is_manager_of(approver_employee_id)
    or approver_employee_id = current_employee_id()));
create policy approval_steps_write on approval_steps for all
  using (org_id = current_org_id() and (is_admin_or_hr() or approver_employee_id = current_employee_id()))
  with check (org_id = current_org_id() and (is_admin_or_hr() or approver_employee_id = current_employee_id()));

-- ---------- leave ----------
alter table leave_balances enable row level security;
create policy leave_balances_select on leave_balances for select
  using (is_admin_or_hr() or is_self(employee_id) or is_manager_of(employee_id));
create policy leave_balances_write on leave_balances for all
  using (is_admin_or_hr())
  with check (is_admin_or_hr());

alter table leave_requests enable row level security;
create policy leave_requests_select on leave_requests for select
  using (org_id = current_org_id() and (is_admin_or_hr() or is_self(employee_id) or is_manager_of(employee_id)));
create policy leave_requests_insert on leave_requests for insert
  with check (org_id = current_org_id() and is_self(employee_id) and status = 'pending');
create policy leave_requests_update_owner on leave_requests for update
  using (org_id = current_org_id() and is_self(employee_id) and status = 'pending')
  with check (org_id = current_org_id() and is_self(employee_id));
create policy leave_requests_decide on leave_requests for update
  using (org_id = current_org_id() and (is_admin_or_hr() or is_manager_of(employee_id)))
  with check (org_id = current_org_id() and (is_admin_or_hr() or is_manager_of(employee_id)));

-- ---------- overtime ----------
alter table overtime_requests enable row level security;
create policy overtime_requests_select on overtime_requests for select
  using (org_id = current_org_id() and (is_admin_or_hr() or is_self(employee_id) or is_manager_of(employee_id)));
create policy overtime_requests_insert on overtime_requests for insert
  with check (org_id = current_org_id() and is_self(employee_id) and status = 'pending');
create policy overtime_requests_update_owner on overtime_requests for update
  using (org_id = current_org_id() and is_self(employee_id) and status = 'pending')
  with check (org_id = current_org_id() and is_self(employee_id));
create policy overtime_requests_decide on overtime_requests for update
  using (org_id = current_org_id() and (is_admin_or_hr() or is_manager_of(employee_id)))
  with check (org_id = current_org_id() and (is_admin_or_hr() or is_manager_of(employee_id)));

-- ---------- payroll: HR/super_admin full; employee sees only their own calculation + payslip; managers: none ----------
alter table payroll_periods enable row level security;
create policy payroll_periods_all on payroll_periods for all
  using (org_id = current_org_id() and is_admin_or_hr())
  with check (org_id = current_org_id() and is_admin_or_hr());

alter table payroll_runs enable row level security;
create policy payroll_runs_all on payroll_runs for all
  using (org_id = current_org_id() and is_admin_or_hr())
  with check (org_id = current_org_id() and is_admin_or_hr());

alter table payroll_employee_calculations enable row level security;
create policy payroll_calc_select on payroll_employee_calculations for select
  using (is_admin_or_hr() or is_self(employee_id));
create policy payroll_calc_write on payroll_employee_calculations for all
  using (is_admin_or_hr() and exists (select 1 from payroll_runs r where r.id = payroll_employee_calculations.payroll_run_id and r.org_id = current_org_id()))
  with check (is_admin_or_hr() and exists (select 1 from payroll_runs r where r.id = payroll_employee_calculations.payroll_run_id and r.org_id = current_org_id()));

alter table payroll_earning_items enable row level security;
create policy payroll_earning_items_select on payroll_earning_items for select
  using (exists (select 1 from payroll_employee_calculations c where c.id = payroll_earning_items.payroll_calc_id and (is_admin_or_hr() or is_self(c.employee_id))));
create policy payroll_earning_items_write on payroll_earning_items for all
  using (is_admin_or_hr())
  with check (is_admin_or_hr());

alter table payroll_deduction_items enable row level security;
create policy payroll_deduction_items_select on payroll_deduction_items for select
  using (exists (select 1 from payroll_employee_calculations c where c.id = payroll_deduction_items.payroll_calc_id and (is_admin_or_hr() or is_self(c.employee_id))));
create policy payroll_deduction_items_write on payroll_deduction_items for all
  using (is_admin_or_hr())
  with check (is_admin_or_hr());

alter table payroll_adjustments enable row level security;
create policy payroll_adjustments_all on payroll_adjustments for all
  using (is_admin_or_hr())
  with check (is_admin_or_hr());

alter table payslips enable row level security;
create policy payslips_select on payslips for select
  using (is_admin_or_hr() or is_self(employee_id));
create policy payslips_write on payslips for all
  using (is_admin_or_hr())
  with check (is_admin_or_hr());

-- ---------- announcements / notifications / files ----------
alter table announcements enable row level security;
create policy announcements_select on announcements for select
  using (org_id = current_org_id());
create policy announcements_write on announcements for all
  using (org_id = current_org_id() and is_admin_or_hr())
  with check (org_id = current_org_id() and is_admin_or_hr());

alter table announcement_reads enable row level security;
create policy announcement_reads_select on announcement_reads for select
  using (is_admin_or_hr() or is_self(employee_id));
create policy announcement_reads_insert on announcement_reads for insert
  with check (is_self(employee_id));

alter table notifications enable row level security;
create policy notifications_select on notifications for select
  using (profile_id = auth.uid());
create policy notifications_update on notifications for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

alter table uploaded_files enable row level security;
create policy uploaded_files_select on uploaded_files for select
  using (org_id = current_org_id() and (is_admin_or_hr() or uploaded_by = auth.uid()));
create policy uploaded_files_insert on uploaded_files for insert
  with check (org_id = current_org_id());

-- ---------- audit / login events: super_admin read-only, no direct client writes ----------
alter table audit_logs enable row level security;
create policy audit_logs_select on audit_logs for select
  using (org_id = current_org_id() and current_user_role() = 'super_admin');

alter table login_events enable row level security;
create policy login_events_select on login_events for select
  using (profile_id = auth.uid() or exists (
    select 1 from profiles p where p.id = login_events.profile_id and p.org_id = current_org_id() and current_user_role() = 'super_admin'
  ));
