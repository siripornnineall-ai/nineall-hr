-- Kom-kaem (90027) and Yok (90041) get the same display rule as Ice and Kanin (0105 / 0115): a late day
-- shows as on time only when approved OT covers it, otherwise it shows as late.
update employees set hide_late_status = true
 where employee_code in ('90027', '90041') and deleted_at is null;
