-- OT cutoff per employee (owner 2026-10-26): Burmese and Lao staff have their OT counted over the
-- calendar month (1st to the last day); everyone else keeps the 26th-25th cycle.
--
-- employees has no nationality column, so the rule is a per-employee switch:
-- ot_calendar_month = true means "OT is counted 1st-to-end-of-month". It is editable on the
-- employee edit page. The initial set below was chosen from the Latin-script Lao / Burmese names
-- of the pack team (plus one marketing employee) and must be confirmed by the owner.

alter table employees add column if not exists ot_calendar_month boolean not null default false;

update employees set ot_calendar_month = true
 where deleted_at is null
   and employee_code in ('90043','90044','90045','90046','90047','90048','90055','90056','90057','90058','90059','90060');
