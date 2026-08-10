-- Nineall HR — harden functions flagged by the Supabase security linter for a
-- mutable search_path (0001/0010/0011 already fix this for fresh installs;
-- this migration exists because it was applied as a follow-up fix on the first
-- live project and is kept for an accurate migration history).
create or replace function set_updated_at()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

create or replace function default_approved_ot_hours()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'approved' and new.approved_hours is null then
    new.approved_hours := new.requested_hours;
  end if;
  return new;
end;
$$;

create or replace function storage_path_org_id(object_name text)
returns uuid language sql immutable set search_path = public as $$
  select nullif(split_part(object_name, '/', 1), '')::uuid;
$$;

create or replace function storage_path_employee_id(object_name text)
returns uuid language sql immutable set search_path = public as $$
  select nullif(split_part(object_name, '/', 2), '')::uuid;
$$;
