-- Kategorier per prosjekt med fast farge, slik at de kan velges igjen.
-- scope skiller oppgavekategorier fra økonomikategorier.

create table public.categories (
  project_id uuid not null references public.projects (id) on delete cascade,
  scope text not null check (scope in ('task', 'finance')),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color smallint not null default 0 check (color between 0 and 7),
  created_at timestamptz not null default now(),
  primary key (project_id, scope, name)
);

alter table public.categories enable row level security;

create policy "Medlemmer ser kategorier" on public.categories
  for select to authenticated using (private.is_project_member(project_id));
create policy "Medlemmer lager kategorier" on public.categories
  for insert to authenticated with check (private.is_project_member(project_id));
create policy "Medlemmer endrer kategorier" on public.categories
  for update to authenticated using (private.is_project_member(project_id)) with check (private.is_project_member(project_id));
create policy "Medlemmer sletter kategorier" on public.categories
  for delete to authenticated using (private.is_project_member(project_id));

revoke all on public.categories from anon, authenticated;
grant select, insert, delete on public.categories to authenticated;
grant update (color) on public.categories to authenticated;

-- Ny kategori på en oppgave eller post lagres automatisk, med neste ledige farge.
create or replace function public.remember_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_scope text := case when tg_table_name = 'tasks' then 'task' else 'finance' end;
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

create trigger tasks_remember_category after insert or update of category on public.tasks
  for each row execute function public.remember_category();
create trigger transactions_remember_category after insert or update of category on public.transactions
  for each row execute function public.remember_category();

revoke execute on function public.remember_category() from public, anon, authenticated;

-- Ta med kategorier som allerede er i bruk.
insert into public.categories (project_id, scope, name, color)
select project_id, scope, name, ((row_number() over (partition by project_id, scope order by name)) - 1) % 8
from (
  select distinct project_id, 'task' as scope, category as name from public.tasks where btrim(category) <> ''
  union
  select distinct project_id, 'finance', category from public.transactions where btrim(category) <> ''
) s
on conflict do nothing;

-- Gi en kategori nytt navn i hele prosjektet. Finnes det nye navnet fra før, slås de sammen.
create or replace function public.rename_category(p_project uuid, p_scope text, p_old text, p_new text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new text := btrim(p_new);
begin
  if not private.is_project_member(p_project) then
    raise exception 'Du har ikke tilgang til prosjektet.' using errcode = '42501';
  end if;
  if char_length(v_new) not between 1 and 60 then
    raise exception 'Kategorinavnet må ha mellom 1 og 60 tegn.' using errcode = '22023';
  end if;
  if v_new = p_old then
    return;
  end if;
  insert into public.categories (project_id, scope, name, color)
  select project_id, scope, v_new, color from public.categories
  where project_id = p_project and scope = p_scope and name = p_old
  on conflict do nothing;
  if p_scope = 'task' then
    update public.tasks set category = v_new where project_id = p_project and category = p_old;
  else
    update public.transactions set category = v_new where project_id = p_project and category = p_old;
  end if;
  delete from public.categories where project_id = p_project and scope = p_scope and name = p_old;
end;
$$;

revoke execute on function public.rename_category(uuid, text, text, text) from public, anon;
grant execute on function public.rename_category(uuid, text, text, text) to authenticated;
