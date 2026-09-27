-- Prosjektpanel: prosjekter, medlemmer, invitasjoner, oppgaver og økonomi.
-- All tilgang styres med radnivåsikkerhet (RLS): bare medlemmer av et prosjekt
-- kan lese eller endre prosjektets data. Beløp lagres som heltall i øre.

-- ---------------------------------------------------------------- Profiler

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  email text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 80),
    lower(coalesce(new.email, ''))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- Prosjekter

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Saldo før den første økonomiske posten. Startsaldo per måned regnes ut fra denne.
  opening_balance_ore bigint not null default 0 check (abs(opening_balance_ore) < 1000000000000000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  handles_tasks boolean not null default true,
  handles_finance boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

create table public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  handles_tasks boolean not null default true,
  handles_finance boolean not null default false,
  invited_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (project_id, email)
);
create index project_invitations_email_idx on public.project_invitations (email);

-- ---------------------------------------------------------------- Oppgaver

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  due_date date,
  category text not null default '' check (char_length(category) <= 60),
  assignee_id uuid,
  kind text not null default 'task' check (kind in ('task', 'idea')),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'done')),
  completed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Ansvarlig må være medlem av samme prosjekt. Forsvinner medlemmet, blir oppgaven uten ansvarlig.
  foreign key (project_id, assignee_id) references public.project_members (project_id, user_id) on delete set null (assignee_id)
);
create index tasks_project_idx on public.tasks (project_id);

-- ---------------------------------------------------------------- Økonomi

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  amount_ore bigint not null check (amount_ore > 0 and amount_ore < 1000000000000000),
  occurred_on date not null,
  -- Måneden posten tilhører. Følger datoen automatisk når den endres.
  month date generated always as (date_trunc('month', occurred_on::timestamp)::date) stored,
  type text not null check (type in ('expense', 'income')),
  category text not null default '' check (char_length(category) <= 60),
  -- Hvem som betalte utgiften eller mottok inntekten.
  person_id uuid,
  note text not null default '' check (char_length(note) <= 2000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, person_id) references public.project_members (project_id, user_id) on delete set null (person_id)
);
create index transactions_project_month_idx on public.transactions (project_id, month);

create table public.month_budgets (
  project_id uuid not null references public.projects (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  budget_ore bigint not null check (budget_ore >= 0 and budget_ore < 1000000000000000),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (project_id, month)
);

-- ---------------------------------------------------------------- Triggere

-- Hvem som registrerte en post og hvilket prosjekt den tilhører, kan ikke endres i etterkant.
create or replace function public.protect_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.project_id := old.project_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_protect before update on public.tasks
  for each row execute function public.protect_row();
create trigger transactions_protect before update on public.transactions
  for each row execute function public.protect_row();

-- Registrerende bruker settes alltid av serveren.
create or replace function public.set_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

create trigger tasks_created_by before insert on public.tasks
  for each row execute function public.set_created_by();
create trigger transactions_created_by before insert on public.transactions
  for each row execute function public.set_created_by();

create or replace function public.task_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_completion before insert or update on public.tasks
  for each row execute function public.task_completion();

create or replace function public.touch_budget()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger month_budgets_touch before insert or update on public.month_budgets
  for each row execute function public.touch_budget();

create or replace function public.set_invited_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.invited_by := auth.uid();
  new.email := lower(btrim(new.email));
  return new;
end;
$$;

create trigger invitations_invited_by before insert on public.project_invitations
  for each row execute function public.set_invited_by();

-- ---------------------------------------------------------------- Tilgangshjelpere

create or replace function public.is_project_member(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_project_owner(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

create or replace function public.shares_project_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members a
    join public.project_members b on b.project_id = a.project_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- Bekreftet e-postadresse for innlogget bruker (brukes for invitasjoner).
create or replace function public.my_confirmed_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;
$$;

-- ---------------------------------------------------------------- RPC-er

create or replace function public.create_project(p_name text, p_opening_balance_ore bigint default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Du må være logget inn.' using errcode = '42501';
  end if;
  insert into public.projects (name, opening_balance_ore, created_by)
  values (btrim(p_name), coalesce(p_opening_balance_ore, 0), auth.uid())
  returning id into v_id;
  insert into public.project_members (project_id, user_id, role, handles_tasks, handles_finance)
  values (v_id, auth.uid(), 'owner', true, true);
  return v_id;
end;
$$;

create or replace function public.accept_invitation(p_invitation uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.project_invitations;
  v_email text := public.my_confirmed_email();
begin
  if v_email is null then
    raise exception 'Du må ha en bekreftet e-postadresse for å bli med i et prosjekt.' using errcode = '42501';
  end if;
  select * into v_inv from public.project_invitations where id = p_invitation;
  if not found or v_inv.email <> v_email then
    raise exception 'Fant ingen invitasjon til din e-postadresse.' using errcode = 'P0002';
  end if;
  insert into public.project_members (project_id, user_id, role, handles_tasks, handles_finance)
  values (v_inv.project_id, auth.uid(), 'member', v_inv.handles_tasks, v_inv.handles_finance)
  on conflict (project_id, user_id) do nothing;
  delete from public.project_invitations where id = v_inv.id;
  return v_inv.project_id;
end;
$$;

-- Invitasjoner til innlogget bruker, med prosjektnavn og hvem som inviterte.
create or replace function public.my_invitations()
returns table (id uuid, project_id uuid, project_name text, invited_by_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.project_id, p.name, pr.display_name, i.created_at
  from public.project_invitations i
  join public.projects p on p.id = i.project_id
  left join public.profiles pr on pr.id = i.invited_by
  where i.email = public.my_confirmed_email()
  order by i.created_at;
$$;

create or replace function public.set_member_role(p_project uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_project_owner(p_project) then
    raise exception 'Bare prosjekteiere kan endre roller.' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'member') then
    raise exception 'Ukjent rolle.' using errcode = '22023';
  end if;
  if p_role = 'member' and (
    select count(*) from public.project_members
    where project_id = p_project and role = 'owner' and user_id <> p_user
  ) = 0 then
    raise exception 'Prosjektet må ha minst én eier.' using errcode = '23514';
  end if;
  update public.project_members set role = p_role
  where project_id = p_project and user_id = p_user;
end;
$$;

create or replace function public.remove_member(p_project uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user <> auth.uid() and not public.is_project_owner(p_project) then
    raise exception 'Bare prosjekteiere kan fjerne andre medlemmer.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.project_members where project_id = p_project and user_id = p_user) then
    raise exception 'Personen er ikke medlem av prosjektet.' using errcode = 'P0002';
  end if;
  if (
    select count(*) from public.project_members
    where project_id = p_project and role = 'owner' and user_id <> p_user
  ) = 0 then
    raise exception 'Prosjektet må ha minst én eier. Gjør en annen til eier først, eller slett prosjektet.' using errcode = '23514';
  end if;
  delete from public.project_members where project_id = p_project and user_id = p_user;
end;
$$;

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invitations enable row level security;
alter table public.tasks enable row level security;
alter table public.transactions enable row level security;
alter table public.month_budgets enable row level security;

create policy "Se egen profil og profiler i felles prosjekter" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_project_with(id));
create policy "Endre egen profil" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Medlemmer ser prosjektet" on public.projects
  for select to authenticated using (public.is_project_member(id));
create policy "Eiere endrer prosjektet" on public.projects
  for update to authenticated using (public.is_project_owner(id)) with check (public.is_project_owner(id));
create policy "Eiere sletter prosjektet" on public.projects
  for delete to authenticated using (public.is_project_owner(id));

create policy "Medlemmer ser medlemslisten" on public.project_members
  for select to authenticated using (public.is_project_member(project_id));
create policy "Eiere eller en selv endrer ansvar" on public.project_members
  for update to authenticated
  using (user_id = (select auth.uid()) or public.is_project_owner(project_id))
  with check (user_id = (select auth.uid()) or public.is_project_owner(project_id));

create policy "Medlemmer og mottaker ser invitasjoner" on public.project_invitations
  for select to authenticated
  using (public.is_project_member(project_id) or email = public.my_confirmed_email());
create policy "Medlemmer inviterer" on public.project_invitations
  for insert to authenticated with check (public.is_project_member(project_id));
create policy "Medlemmer trekker tilbake, mottaker avslår" on public.project_invitations
  for delete to authenticated
  using (public.is_project_member(project_id) or email = public.my_confirmed_email());

create policy "Medlemmer ser oppgaver" on public.tasks
  for select to authenticated using (public.is_project_member(project_id));
create policy "Medlemmer lager oppgaver" on public.tasks
  for insert to authenticated with check (public.is_project_member(project_id));
create policy "Medlemmer endrer oppgaver" on public.tasks
  for update to authenticated using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));
create policy "Medlemmer sletter oppgaver" on public.tasks
  for delete to authenticated using (public.is_project_member(project_id));

create policy "Medlemmer ser poster" on public.transactions
  for select to authenticated using (public.is_project_member(project_id));
create policy "Medlemmer registrerer poster" on public.transactions
  for insert to authenticated with check (public.is_project_member(project_id));
create policy "Medlemmer endrer poster" on public.transactions
  for update to authenticated using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));
create policy "Medlemmer sletter poster" on public.transactions
  for delete to authenticated using (public.is_project_member(project_id));

create policy "Medlemmer ser budsjett" on public.month_budgets
  for select to authenticated using (public.is_project_member(project_id));
create policy "Medlemmer setter budsjett" on public.month_budgets
  for insert to authenticated with check (public.is_project_member(project_id));
create policy "Medlemmer endrer budsjett" on public.month_budgets
  for update to authenticated using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));
create policy "Medlemmer sletter budsjett" on public.month_budgets
  for delete to authenticated using (public.is_project_member(project_id));

-- ---------------------------------------------------------------- Rettigheter

revoke all on public.profiles, public.projects, public.project_members, public.project_invitations,
  public.tasks, public.transactions, public.month_budgets from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, delete on public.projects to authenticated;
grant update (name, opening_balance_ore) on public.projects to authenticated;
grant select on public.project_members to authenticated;
grant update (handles_tasks, handles_finance) on public.project_members to authenticated;
grant select, delete on public.project_invitations to authenticated;
grant insert (project_id, email, handles_tasks, handles_finance) on public.project_invitations to authenticated;
grant select, insert, update, delete on public.tasks, public.transactions, public.month_budgets to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.create_project(text, bigint), public.accept_invitation(uuid), public.my_invitations(),
  public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid),
  public.is_project_member(uuid), public.is_project_owner(uuid), public.shares_project_with(uuid),
  public.my_confirmed_email() to authenticated;
