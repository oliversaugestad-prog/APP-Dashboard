-- Egendefinerte egenskaper (kolonner) i oppgavetabellen, som i Notion.
-- Definisjonen ligger i task_properties, verdiene i tasks.custom (jsonb: { egenskaps-id: verdi }).

create table public.task_properties (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  type text not null check (type in ('text', 'number', 'select', 'multi_select', 'date', 'person', 'checkbox', 'url')),
  -- Valgmuligheter for select/multi_select: [{ "name": "...", "color": 0-7 }]
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index task_properties_project_idx on public.task_properties (project_id, position);

alter table public.tasks add column custom jsonb not null default '{}'::jsonb check (jsonb_typeof(custom) = 'object');

alter table public.task_properties enable row level security;
create policy "Medlemmer ser egenskaper" on public.task_properties
  for select to authenticated using (private.is_project_member(project_id));
create policy "Medlemmer lager egenskaper" on public.task_properties
  for insert to authenticated with check (private.is_project_member(project_id));
create policy "Medlemmer endrer egenskaper" on public.task_properties
  for update to authenticated using (private.is_project_member(project_id)) with check (private.is_project_member(project_id));
create policy "Medlemmer sletter egenskaper" on public.task_properties
  for delete to authenticated using (private.is_project_member(project_id));

revoke all on public.task_properties from anon, authenticated;
grant select, delete on public.task_properties to authenticated;
grant insert (project_id, name, type, options, position) on public.task_properties to authenticated;
grant update (name, options, position) on public.task_properties to authenticated;

-- Setter én verdi uten å overskrive andre egenskaper som noen andre endrer samtidig.
-- Kjøres med innloggede brukers rettigheter, så RLS på tasks gjelder.
create or replace function public.set_task_property(p_task uuid, p_property uuid, p_value jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.task_properties p join public.tasks t on t.project_id = p.project_id
    where p.id = p_property and t.id = p_task
  ) then
    raise exception 'Fant ikke egenskapen i dette prosjektet.' using errcode = 'P0002';
  end if;
  update public.tasks
  set custom = case
    when p_value is null or p_value = 'null'::jsonb or p_value = '""'::jsonb or p_value = '[]'::jsonb then custom - p_property::text
    else jsonb_set(custom, array[p_property::text], p_value)
  end
  where id = p_task;
end;
$$;

-- Sletter egenskapen og verdiene den hadde.
create or replace function public.delete_task_property(p_property uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_project uuid;
begin
  delete from public.task_properties where id = p_property returning project_id into v_project;
  if v_project is null then
    raise exception 'Fant ikke egenskapen.' using errcode = 'P0002';
  end if;
  update public.tasks set custom = custom - p_property::text where project_id = v_project and custom ? p_property::text;
end;
$$;

revoke execute on function public.set_task_property(uuid, uuid, jsonb), public.delete_task_property(uuid) from public, anon;
grant execute on function public.set_task_property(uuid, uuid, jsonb), public.delete_task_property(uuid) to authenticated;
