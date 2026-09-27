-- Flytter tilgangshjelperne ut av API-skjemaet, slik at de bare brukes av
-- RLS-regler og RPC-er og ikke kan kalles direkte via /rest/v1/rpc.

create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.is_project_member(uuid) set schema private;
alter function public.is_project_owner(uuid) set schema private;
alter function public.shares_project_with(uuid) set schema private;
alter function public.my_confirmed_email() set schema private;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Triggerfunksjonen skal aldri kalles som RPC.
revoke execute on function public.handle_new_user() from authenticated;

create or replace function public.accept_invitation(p_invitation uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.project_invitations;
  v_email text := private.my_confirmed_email();
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
  where i.email = private.my_confirmed_email()
  order by i.created_at;
$$;

create or replace function public.set_member_role(p_project uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_project_owner(p_project) then
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
  if p_user <> auth.uid() and not private.is_project_owner(p_project) then
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
