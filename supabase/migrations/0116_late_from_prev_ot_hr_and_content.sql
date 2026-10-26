-- Owner rule (2026-10-26): the HR team and the Content team (their OT is not paid out), when late and
-- not made up, have the lateness taken from the previous OT cycle, the same rule Kanin (90031) already
-- had. employees.late_deduct_from_prev_ot_since switches it on per person (see 0103).
-- Applies to: Ice (90026), Kom-kaem (90027), Yok (90041) - position "Content" - plus Kanin (HR, already on).
update employees set late_deduct_from_prev_ot_since = date '2026-08-26'
 where employee_code in ('90026', '90027', '90041') and deleted_at is null and late_deduct_from_prev_ot_since is null;
