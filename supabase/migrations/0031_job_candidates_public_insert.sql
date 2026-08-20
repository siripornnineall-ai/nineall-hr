-- Nineall HR — let anyone (no login) submit a job application for an open vacancy.
-- Scoped tightly: insert-only, and only when the referenced vacancy is still open —
-- an applicant can't read other candidates' data (job_candidates_select stays
-- admin/HR-only) or apply to a closed/other-org vacancy.
create policy job_candidates_public_insert on job_candidates for insert
  to anon, authenticated
  with check (exists (select 1 from job_vacancies v where v.id = job_candidates.vacancy_id and v.status = 'open'));
