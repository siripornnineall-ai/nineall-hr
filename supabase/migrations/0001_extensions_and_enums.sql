-- Nineall HR — extensions and enums
-- Safe to re-run: uses IF NOT EXISTS / DO blocks throughout.

create extension if not exists pgcrypto;

do $$ begin
  create type user_role as enum ('super_admin', 'hr', 'manager', 'employee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type employment_type as enum ('monthly', 'daily', 'hourly', 'part_time', 'contract');
exception when duplicate_object then null; end $$;

do $$ begin
  create type employment_status as enum ('active', 'probation', 'suspended', 'resigned', 'terminated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attendance_status as enum ('on_time', 'late', 'early_leave', 'absent', 'holiday', 'leave', 'work_from_home', 'off_site', 'pending_offline');
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_status as enum ('draft', 'pending', 'approved', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type leave_unit as enum ('full_day', 'half_day', 'hourly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payroll_run_status as enum ('draft', 'under_review', 'pending_approval', 'approved', 'paid', 'locked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type time_correction_reason as enum ('forgot_clock_in', 'forgot_clock_out', 'wrong_time', 'off_site_work', 'device_issue', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_channel as enum ('push', 'in_app', 'email');
exception when duplicate_object then null; end $$;

-- Generic updated_at trigger used by every table below.
create or replace function set_updated_at()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Great-circle distance in meters between two lat/lng points (no PostGIS dependency).
create or replace function haversine_distance_meters(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
set search_path = public
as $$
  select 6371000 * 2 * asin(
    sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    )
  );
$$;
