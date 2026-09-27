-- Gjentakende oppgaver og prosjektkalender.
--
-- Gjentakelse: en regel (hyppighet, intervall, ukedager, til-dato) på oppgaven.
-- Når en gjentakende oppgave fullføres, lager databasen neste forekomst med ny
-- frist. Den fullførte blir stående som historikk. Samme regel kan brukes på
-- kalenderhendelser, som da vises på hver forekomst.

-- ---------------------------------------------------------------- Neste forekomst

-- Neste dato etter p_from ut fra regelen. Null når regelen er slutt (p_until).
-- Ukedager: 1 = mandag … 7 = søndag (ISO). Ukentlig med intervall teller uker
-- fra uken p_anchor ligger i, slik at «annenhver uke» holder takten.
create or replace function public.next_occurrence(
  p_from date, p_freq text, p_interval integer, p_weekdays smallint[], p_until date, p_anchor date default null
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_interval integer := greatest(coalesce(p_interval, 1), 1);
  v_anchor date := coalesce(p_anchor, p_from);
  v_next date;
  v_week_anchor date := v_anchor - (extract(isodow from v_anchor)::integer - 1);
  v_i integer;
begin
  if p_from is null or p_freq is null then
    return null;
  end if;
  if p_freq = 'daily' then
    v_next := p_from + v_interval;
  elsif p_freq = 'weekly' then
    if p_weekdays is null or cardinality(p_weekdays) = 0 then
      v_next := p_from + 7 * v_interval;
    else
      v_next := null;
      for v_i in 1 .. (7 * v_interval + 7) loop
        if extract(isodow from p_from + v_i)::smallint = any (p_weekdays)
           and (((p_from + v_i) - (extract(isodow from p_from + v_i)::integer - 1) - v_week_anchor) / 7) % v_interval = 0 then
          v_next := p_from + v_i;
          exit;
        end if;
      end loop;
    end if;
  elsif p_freq in ('monthly', 'yearly') then
    -- Tell fra første forekomst, så månedsslutt ikke glir (31. jan -> 28. feb -> 31. mar).
    v_next := null;
    for v_i in 1 .. 1200 loop
      v_next := (v_anchor + case when p_freq = 'monthly'
        then make_interval(months => v_interval * v_i)
        else make_interval(years => v_interval * v_i) end)::date;
      exit when v_next > p_from;
    end loop;
  else
    return null;
  end if;
  if p_until is not null and v_next > p_until then
    return null;
  end if;
  return v_next;
end;
$$;

-- ---------------------------------------------------------------- Oppgaver

alter table public.tasks
  add column repeat_freq text check (repeat_freq in ('daily', 'weekly', 'monthly', 'yearly')),
  add column repeat_interval smallint not null default 1 check (repeat_interval between 1 and 99),
  add column repeat_weekdays smallint[] not null default '{}' check (repeat_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  add column repeat_until date,
  -- Første frist i serien, så «den 31. hver måned» ikke glir til den 28.
  add column repeat_anchor date,
  -- Forrige forekomst i serien (den som ble fullført og lagde denne).
  add column recurs_from uuid references public.tasks (id) on delete set null;
create index tasks_recurs_from_idx on public.tasks (recurs_from);

-- Når en gjentakende oppgave fullføres: lag neste, én gang.
create or replace function public.spawn_next_occurrence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_next date;
begin
  if new.status <> 'done' or old.status = 'done' or new.repeat_freq is null or new.kind <> 'task' then
    return new;
  end if;
  if exists (select 1 from public.tasks where recurs_from = new.id) then
    return new;
  end if;
  v_next := public.next_occurrence(
    coalesce(new.due_date, current_date), new.repeat_freq, new.repeat_interval, new.repeat_weekdays, new.repeat_until,
    coalesce(new.repeat_anchor, new.due_date, current_date)
  );
  if v_next is null then
    return new;
  end if;
  insert into public.tasks (
    project_id, title, description, due_date, category, assignee_id, kind, status, custom,
    repeat_freq, repeat_interval, repeat_weekdays, repeat_until, repeat_anchor, recurs_from
  ) values (
    new.project_id, new.title, new.description, v_next, new.category, new.assignee_id, 'task', 'not_started', new.custom,
    new.repeat_freq, new.repeat_interval, new.repeat_weekdays, new.repeat_until,
    coalesce(new.repeat_anchor, new.due_date, current_date), new.id
  );
  return new;
end;
$$;

create trigger tasks_spawn_next after update of status on public.tasks
  for each row execute function public.spawn_next_occurrence();

-- recurs_from settes bare av databasen.
revoke update on public.tasks from authenticated;
grant update (title, description, due_date, category, assignee_id, kind, status, custom,
  repeat_freq, repeat_interval, repeat_weekdays, repeat_until, repeat_anchor) on public.tasks to authenticated;

-- ---------------------------------------------------------------- Kalender

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  location text not null default '' check (char_length(location) <= 300),
  category text not null default '' check (char_length(category) <= 60),
  type text not null default 'meeting' check (type in ('meeting', 'event', 'deadline', 'work', 'other')),
  start_date date not null,
  end_date date not null,
  -- Uten klokkeslett er hendelsen heldags.
  start_time time,
  end_time time,
  person_id uuid,
  repeat_freq text check (repeat_freq in ('daily', 'weekly', 'monthly', 'yearly')),
  repeat_interval smallint not null default 1 check (repeat_interval between 1 and 99),
  repeat_weekdays smallint[] not null default '{}' check (repeat_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  repeat_until date,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 62),
  check ((start_time is null) = (end_time is null)),
  check (start_time is null or end_date > start_date or end_time > start_time),
  foreign key (project_id, person_id) references public.project_members (project_id, user_id) on delete set null (person_id)
);
create index calendar_events_project_idx on public.calendar_events (project_id, start_date);

create trigger calendar_events_protect before update on public.calendar_events
  for each row execute function public.protect_row();
create trigger calendar_events_created_by before insert on public.calendar_events
  for each row execute function public.set_created_by();

-- Hendelser deler kategorier med oppgavene.
create or replace function public.remember_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_scope text := case when tg_table_name = 'transactions' then 'finance' else 'task' end;
begin
  if btrim(new.category) <> '' then
    insert into public.categories (project_id, scope, name, color)
    values (
      new.project_id, v_scope, new.category,
      (select count(*) from public.categories c where c.project_id = new.project_id and c.scope = v_scope) % 8
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger calendar_events_remember_category after insert or update of category on public.calendar_events
  for each row execute function public.remember_category();

alter table public.calendar_events enable row level security;
create policy "Medlemmer ser hendelser" on public.calendar_events
  for select to authenticated using (private.is_project_member(project_id));
create policy "Medlemmer lager hendelser" on public.calendar_events
  for insert to authenticated with check (private.is_project_member(project_id));
create policy "Medlemmer endrer hendelser" on public.calendar_events
  for update to authenticated using (private.is_project_member(project_id)) with check (private.is_project_member(project_id));
create policy "Medlemmer sletter hendelser" on public.calendar_events
  for delete to authenticated using (private.is_project_member(project_id));

revoke all on public.calendar_events from anon, authenticated;
grant select, insert, update, delete on public.calendar_events to authenticated;

revoke execute on function public.spawn_next_occurrence() from public, anon, authenticated;
revoke execute on function public.next_occurrence(date, text, integer, smallint[], date, date) from public, anon;
grant execute on function public.next_occurrence(date, text, integer, smallint[], date, date) to authenticated;
