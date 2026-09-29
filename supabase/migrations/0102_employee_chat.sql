-- Employee chat (requested 2026-09-29): people can message each other 1:1 and create group
-- chats inside the employee app.
--
-- Shape:
--   chat_conversations  one row per direct pair or group (direct pairs are deduplicated by
--                       direct_key = the two employee ids sorted)
--   chat_members        who is in a conversation + where they have read up to
--   chat_messages       the messages (soft-deleted by the sender via deleted_at)
--
-- Reads go straight through RLS (a member can read their conversations, members and
-- messages; anyone can insert a message into a conversation they belong to). Everything
-- else (starting a chat, creating a group, adding people, leaving) goes through
-- security-definer RPCs so the membership rules live in one place.
--
-- A new message updates the conversation preview and drops a `chat_message` notification
-- for every other member (deduplicated: no second unread notification for the same
-- conversation within 5 minutes), which the 0081 trigger turns into a push with
-- data.url = /chat/<id>. chat_messages is added to the realtime publication so open
-- threads update live.

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  type text not null check (type in ('direct', 'group')),
  name text,
  direct_key text unique,
  created_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_employee_id uuid references employees(id) on delete set null
);

create table if not exists public.chat_members (
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, employee_id)
);
create index if not exists chat_members_employee_idx on public.chat_members (employee_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  sender_employee_id uuid not null references employees(id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists chat_messages_conversation_idx on public.chat_messages (conversation_id, created_at desc);

alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

-- Membership check used by every policy (security definer so the chat_members policy can
-- use it without recursing into itself).
create or replace function public.chat_is_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from chat_members m
    where m.conversation_id = p_conversation_id
      and m.employee_id = current_employee_id()
  );
$$;
revoke all on function public.chat_is_member(uuid) from public;
grant execute on function public.chat_is_member(uuid) to authenticated;

drop policy if exists chat_conversations_select on public.chat_conversations;
create policy chat_conversations_select on public.chat_conversations
  for select to authenticated using (chat_is_member(id));

drop policy if exists chat_members_select on public.chat_members;
create policy chat_members_select on public.chat_members
  for select to authenticated using (chat_is_member(conversation_id));

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select to authenticated using (chat_is_member(conversation_id));

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check (sender_employee_id = current_employee_id() and chat_is_member(conversation_id) and deleted_at is null);

-- A sender may soft-delete (or edit) only their own message.
drop policy if exists chat_messages_update_own on public.chat_messages;
create policy chat_messages_update_own on public.chat_messages
  for update to authenticated
  using (sender_employee_id = current_employee_id())
  with check (sender_employee_id = current_employee_id());

grant select on public.chat_conversations, public.chat_members to authenticated;
grant select, insert, update on public.chat_messages to authenticated;

-- ---------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------

create or replace function public.chat_display_name(p_employee_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(nullif(e.nickname, ''), e.first_name) from employees e where e.id = p_employee_id;
$$;

-- Same org, still employed, and not the caller.
create or replace function public.chat_valid_member_ids(p_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct e.id from employees e
  where e.id = any(p_ids)
    and e.org_id = current_org_id()
    and e.deleted_at is null
    and e.employment_status in ('active', 'probation');
$$;

-- ---------------------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------------------

-- Open (or reuse) the 1:1 conversation with another employee.
create or replace function public.chat_start_direct(p_other_employee_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := current_employee_id();
  v_key text;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'FORBIDDEN: no employee profile';
  end if;
  if p_other_employee_id is null or p_other_employee_id = v_me then
    raise exception 'INVALID: cannot chat with yourself';
  end if;
  if not exists (select 1 from chat_valid_member_ids(array[p_other_employee_id])) then
    raise exception 'NOT_FOUND: employee not found';
  end if;

  v_key := least(v_me, p_other_employee_id)::text || ':' || greatest(v_me, p_other_employee_id)::text;

  select id into v_id from chat_conversations where direct_key = v_key;
  if v_id is null then
    insert into chat_conversations (org_id, type, direct_key, created_by)
      values (current_org_id(), 'direct', v_key, v_me)
      returning id into v_id;
  end if;

  -- Both sides are always members (re-adds anyone who left).
  insert into chat_members (conversation_id, employee_id, role)
    values (v_id, v_me, 'member'), (v_id, p_other_employee_id, 'member')
    on conflict do nothing;

  return v_id;
end;
$$;
revoke all on function public.chat_start_direct(uuid) from public;
grant execute on function public.chat_start_direct(uuid) to authenticated;

create or replace function public.chat_create_group(p_name text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := current_employee_id();
  v_id uuid;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if v_me is null then
    raise exception 'FORBIDDEN: no employee profile';
  end if;
  if v_name is null then
    raise exception 'INVALID: group name required';
  end if;
  if length(v_name) > 80 then
    raise exception 'INVALID: group name too long';
  end if;

  insert into chat_conversations (org_id, type, name, created_by)
    values (current_org_id(), 'group', v_name, v_me)
    returning id into v_id;

  insert into chat_members (conversation_id, employee_id, role) values (v_id, v_me, 'owner');
  insert into chat_members (conversation_id, employee_id, role)
    select v_id, x, 'member' from chat_valid_member_ids(coalesce(p_member_ids, '{}')) x
    where x <> v_me
    on conflict do nothing;

  return v_id;
end;
$$;
revoke all on function public.chat_create_group(text, uuid[]) from public;
grant execute on function public.chat_create_group(text, uuid[]) to authenticated;

-- Any member of a group can bring in more people.
create or replace function public.chat_add_members(p_conversation_id uuid, p_member_ids uuid[])
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := current_employee_id();
  v_type text;
  v_added int;
begin
  select type into v_type from chat_conversations where id = p_conversation_id;
  if v_type is null or not chat_is_member(p_conversation_id) then
    raise exception 'FORBIDDEN: not a member of this conversation';
  end if;
  if v_type <> 'group' then
    raise exception 'INVALID: can only add members to a group';
  end if;

  with ins as (
    insert into chat_members (conversation_id, employee_id, role)
      select p_conversation_id, x, 'member' from chat_valid_member_ids(coalesce(p_member_ids, '{}')) x
      on conflict do nothing
      returning 1
  )
  select count(*) into v_added from ins;

  if v_added > 0 then
    insert into chat_messages (conversation_id, sender_employee_id, body)
      values (p_conversation_id, v_me, chat_display_name(v_me) || ' เพิ่มสมาชิก ' || v_added || ' คน');
  end if;
  return v_added;
end;
$$;
revoke all on function public.chat_add_members(uuid, uuid[]) from public;
grant execute on function public.chat_add_members(uuid, uuid[]) to authenticated;

create or replace function public.chat_rename_group(p_conversation_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if not chat_is_member(p_conversation_id) then
    raise exception 'FORBIDDEN: not a member of this conversation';
  end if;
  if v_name is null or length(v_name) > 80 then
    raise exception 'INVALID: group name';
  end if;
  update chat_conversations set name = v_name where id = p_conversation_id and type = 'group';
end;
$$;
revoke all on function public.chat_rename_group(uuid, text) from public;
grant execute on function public.chat_rename_group(uuid, text) to authenticated;

-- Leave a group. The last member out removes the group. Direct chats can't be left (they
-- simply stay in the list); hiding them is a later feature if anyone asks.
create or replace function public.chat_leave(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := current_employee_id();
  v_type text;
begin
  select type into v_type from chat_conversations where id = p_conversation_id;
  if v_type is null or not chat_is_member(p_conversation_id) then
    raise exception 'FORBIDDEN: not a member of this conversation';
  end if;
  if v_type <> 'group' then
    raise exception 'INVALID: cannot leave a direct chat';
  end if;

  insert into chat_messages (conversation_id, sender_employee_id, body)
    values (p_conversation_id, v_me, chat_display_name(v_me) || ' ออกจากกลุ่ม');
  delete from chat_members where conversation_id = p_conversation_id and employee_id = v_me;

  if not exists (select 1 from chat_members where conversation_id = p_conversation_id) then
    delete from chat_conversations where id = p_conversation_id;
  end if;
end;
$$;
revoke all on function public.chat_leave(uuid) from public;
grant execute on function public.chat_leave(uuid) to authenticated;

create or replace function public.chat_mark_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update chat_members set last_read_at = now()
    where conversation_id = p_conversation_id and employee_id = current_employee_id();
  update notifications set is_read = true, read_at = now()
    where profile_id = auth.uid() and is_read = false and type = 'chat_message'
      and data->>'conversation_id' = p_conversation_id::text;
$$;
revoke all on function public.chat_mark_read(uuid) from public;
grant execute on function public.chat_mark_read(uuid) to authenticated;

-- The chat list: every conversation the caller belongs to, newest activity first, with the
-- other person's name/photo for direct chats and the unread count.
create or replace function public.chat_list_conversations()
returns table (
  conversation_id uuid,
  type text,
  name text,
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_name text,
  unread_count int,
  member_count int,
  other_employee_id uuid,
  other_first_name text,
  other_nickname text,
  other_photo_url text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    c.id,
    c.type,
    c.name,
    c.last_message_at,
    c.last_message_preview,
    chat_display_name(c.last_sender_employee_id),
    (select count(*)::int from chat_messages m
       where m.conversation_id = c.id and m.deleted_at is null
         and m.sender_employee_id <> me.employee_id and m.created_at > me.last_read_at),
    (select count(*)::int from chat_members x where x.conversation_id = c.id),
    o.id, o.first_name, o.nickname, o.photo_url
  from chat_members me
  join chat_conversations c on c.id = me.conversation_id
  left join lateral (
    select e.id, e.first_name, e.nickname, e.photo_url
    from chat_members om join employees e on e.id = om.employee_id
    where c.type = 'direct' and om.conversation_id = c.id and om.employee_id <> me.employee_id
    limit 1
  ) o on true
  where me.employee_id = current_employee_id()
  order by coalesce(c.last_message_at, c.created_at) desc;
$$;
revoke all on function public.chat_list_conversations() from public;
grant execute on function public.chat_list_conversations() to authenticated;

create or replace function public.chat_conversation_members(p_conversation_id uuid)
returns table (
  employee_id uuid,
  employee_code text,
  first_name text,
  last_name text,
  nickname text,
  photo_url text,
  role text,
  last_read_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.id, e.employee_code, e.first_name, e.last_name, e.nickname, e.photo_url, m.role, m.last_read_at
  from chat_members m join employees e on e.id = m.employee_id
  where m.conversation_id = p_conversation_id and chat_is_member(p_conversation_id)
  order by m.role = 'owner' desc, m.joined_at;
$$;
revoke all on function public.chat_conversation_members(uuid) from public;
grant execute on function public.chat_conversation_members(uuid) to authenticated;

-- Total unread messages across all chats (badge on the bottom nav).
create or replace function public.chat_unread_total()
returns int
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(cnt), 0)::int from (
    select (select count(*) from chat_messages m
              where m.conversation_id = me.conversation_id and m.deleted_at is null
                and m.sender_employee_id <> me.employee_id and m.created_at > me.last_read_at) as cnt
    from chat_members me where me.employee_id = current_employee_id()
  ) s;
$$;
revoke all on function public.chat_unread_total() from public;
grant execute on function public.chat_unread_total() to authenticated;

-- ---------------------------------------------------------------------------------------
-- New message: update the conversation preview + notify the other members
-- ---------------------------------------------------------------------------------------

create or replace function public.chat_on_message_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c chat_conversations%rowtype;
  v_sender text := chat_display_name(new.sender_employee_id);
  v_title text;
  v_body text := left(new.body, 120);
  r record;
begin
  select * into c from chat_conversations where id = new.conversation_id;

  update chat_conversations
    set last_message_at = new.created_at,
        last_message_preview = left(new.body, 120),
        last_sender_employee_id = new.sender_employee_id
    where id = new.conversation_id;

  -- The sender counts as having read their own message.
  update chat_members set last_read_at = greatest(last_read_at, new.created_at)
    where conversation_id = new.conversation_id and employee_id = new.sender_employee_id;

  if c.type = 'group' then
    v_title := coalesce(c.name, 'กลุ่ม') || ' · ' || coalesce(v_sender, '');
  else
    v_title := coalesce(v_sender, 'ข้อความใหม่');
  end if;

  for r in
    select p.id as profile_id, p.org_id
    from chat_members m
    join profiles p on p.employee_id = m.employee_id
    where m.conversation_id = new.conversation_id
      and m.employee_id <> new.sender_employee_id
  loop
    -- One unread notification per conversation per 5 minutes is enough.
    if exists (
      select 1 from notifications n
      where n.profile_id = r.profile_id and n.type = 'chat_message' and n.is_read = false
        and n.data->>'conversation_id' = new.conversation_id::text
        and n.created_at > now() - interval '5 minutes'
    ) then
      continue;
    end if;
    insert into notifications (org_id, profile_id, type, title, body, data)
    values (
      r.org_id, r.profile_id, 'chat_message', v_title, v_body,
      jsonb_build_object('conversation_id', new.conversation_id, 'url', '/chat/' || new.conversation_id::text)
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_chat_on_message_insert on public.chat_messages;
create trigger trg_chat_on_message_insert
  after insert on public.chat_messages
  for each row execute function public.chat_on_message_insert();

-- Live updates for open threads / the chat list.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
