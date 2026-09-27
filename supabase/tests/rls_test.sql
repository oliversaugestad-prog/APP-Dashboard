-- Tilgangstester for Prosjektpanel. Kjøres av run.sh mot en lokal database.
-- Hver sjekk kaster en feil hvis resultatet ikke er som forventet.

\set ON_ERROR_STOP 1

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'Anna@Test.no', now(), '{"display_name":"Anna"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bjorn@test.no', now(), '{"display_name":"Bjørn"}'),
  ('00000000-0000-0000-0000-00000000000c', 'cato@test.no', now(), '{}'),
  ('00000000-0000-0000-0000-00000000000d', 'dina@test.no', null, '{}');

create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, false);
$$;
create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'TEST FEILET: %', msg; end if;
end $$;

-- Profil opprettes automatisk med navn fra metadata eller e-post.
select pg_temp.check((select display_name from profiles where id = '00000000-0000-0000-0000-00000000000a') = 'Anna', 'profil med navn');
select pg_temp.check((select display_name from profiles where id = '00000000-0000-0000-0000-00000000000c') = 'cato', 'profil uten navn');
select pg_temp.check((select email from profiles where id = '00000000-0000-0000-0000-00000000000a') = 'anna@test.no', 'e-post i små bokstaver');

set role authenticated;

-- Anna oppretter et prosjekt og blir eier.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
create temp table ids as select public.create_project('Sommerfest', 1000000) as project_id;
grant select on ids to authenticated;
select pg_temp.check((select role from project_members where user_id = auth.uid()) = 'owner', 'oppretter blir eier');

-- Kan ikke opprette prosjekt direkte (bare via RPC).
do $$ begin
  insert into projects (name) values ('Snik');
  raise exception 'TEST FEILET: direkte innsetting i projects';
exception when insufficient_privilege then null;
end $$;

-- Oppgave og post; registrert av settes av serveren.
insert into tasks (project_id, title, kind, status, assignee_id, created_by)
  select project_id, 'Bestille lokale', 'task', 'done', auth.uid(), '00000000-0000-0000-0000-00000000000c' from ids;
select pg_temp.check((select created_by from tasks) = '00000000-0000-0000-0000-00000000000a', 'created_by kan ikke forfalskes');
select pg_temp.check((select completed_at is not null from tasks), 'completed_at settes ved fullført');
update tasks set status = 'in_progress';
select pg_temp.check((select completed_at is null from tasks), 'completed_at nullstilles');

insert into transactions (project_id, name, amount_ore, occurred_on, type, category, person_id)
  select project_id, 'Leie av lokale', 250000, '2026-09-15', 'expense', 'Lokaler', auth.uid() from ids;
select pg_temp.check((select month from transactions) = '2026-09-01', 'måned utledes av dato');
update transactions set occurred_on = '2026-10-03';
select pg_temp.check((select month from transactions) = '2026-10-01', 'måned følger ny dato');

-- Negative beløp og ugyldige typer avvises.
do $$ begin
  insert into transactions (project_id, name, amount_ore, occurred_on, type) select project_id, 'x', -5, '2026-09-01', 'expense' from ids;
  raise exception 'TEST FEILET: negativt beløp';
exception when check_violation then null;
end $$;

-- Ansvarlig må være medlem av prosjektet.
do $$ begin
  insert into tasks (project_id, title, assignee_id) select project_id, 'x', '00000000-0000-0000-0000-00000000000c' from ids;
  raise exception 'TEST FEILET: ansvarlig utenfor prosjektet';
exception when foreign_key_violation then null;
end $$;

insert into month_budgets (project_id, month, budget_ore) select project_id, '2026-10-01', 300000 from ids;

-- Invitasjoner til Bjørn og Dina (ubekreftet e-post).
insert into project_invitations (project_id, email, handles_finance) select project_id, 'Bjorn@test.no ', true from ids;
insert into project_invitations (project_id, email) select project_id, 'dina@test.no' from ids;

-- Cato (utenforstående) ser ingenting.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from projects) = 0, 'utenforstående ser ikke prosjekt');
select pg_temp.check((select count(*) from tasks) = 0, 'utenforstående ser ikke oppgaver');
select pg_temp.check((select count(*) from transactions) = 0, 'utenforstående ser ikke poster');
select pg_temp.check((select count(*) from month_budgets) = 0, 'utenforstående ser ikke budsjett');
select pg_temp.check((select count(*) from project_invitations) = 0, 'utenforstående ser ikke invitasjoner');
select pg_temp.check((select count(*) from profiles) = 1, 'utenforstående ser bare egen profil');
update tasks set title = 'Hacket';
delete from transactions;
do $$ begin
  insert into tasks (project_id, title) select project_id, 'Snik' from ids;
  raise exception 'TEST FEILET: utenforstående kan lage oppgave';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.accept_invitation((select id from project_invitations limit 1));
  raise exception 'TEST FEILET: Cato godtok andres invitasjon';
exception when others then
  if sqlerrm like 'TEST FEILET%' then raise; end if;
end $$;
do $$ begin
  insert into project_invitations (project_id, email) select project_id, 'cato@test.no' from ids;
  raise exception 'TEST FEILET: utenforstående kan invitere seg selv';
exception when insufficient_privilege then null;
end $$;

-- Dina har ikke bekreftet e-post og kan ikke godta.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.check((select count(*) from project_invitations) = 0, 'ubekreftet ser ikke invitasjon');
select pg_temp.check((select count(*) from public.my_invitations()) = 0, 'ubekreftet får ikke invitasjonslisten');

-- Bjørn ser og godtar invitasjonen.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from project_invitations) = 1, 'mottaker ser invitasjonen');
select pg_temp.check((select project_name = 'Sommerfest' and invited_by_name = 'Anna' from public.my_invitations()), 'mottaker ser prosjektnavn og avsender');
select pg_temp.check((select count(*) from projects) = 0, 'mottaker ser ikke prosjektet før godkjenning');
select public.accept_invitation((select id from project_invitations));
select pg_temp.check((select count(*) from projects) = 1, 'medlem ser prosjektet');
select pg_temp.check((select handles_finance from project_members where user_id = auth.uid()), 'ansvar fra invitasjonen');
select pg_temp.check((select role from project_members where user_id = auth.uid()) = 'member', 'nytt medlem er ikke eier');
select pg_temp.check((select count(*) from profiles) = 2, 'medlem ser andres profil');
select pg_temp.check((select updated_by from month_budgets) = '00000000-0000-0000-0000-00000000000a', 'budsjett registrert av Anna');

-- Medlem kan jobbe med oppgaver og poster, men ikke endre prosjekt eller roller.
update tasks set title = 'Bestille lokale (bekreftet)', assignee_id = auth.uid();
select pg_temp.check((select assignee_id from tasks) = '00000000-0000-0000-0000-00000000000b', 'medlem kan endre ansvarlig');
select pg_temp.check((select created_by from tasks) = '00000000-0000-0000-0000-00000000000a', 'registrert av er uendret');
update projects set name = 'Kapret';
reset role;
select pg_temp.check((select name from projects) = 'Sommerfest', 'medlem kan ikke gi prosjektet nytt navn');
set role authenticated;
do $$ begin
  update project_members set role = 'owner' where user_id = auth.uid();
  raise exception 'TEST FEILET: medlem gjorde seg selv til eier';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.set_member_role((select project_id from ids), auth.uid(), 'owner');
  raise exception 'TEST FEILET: set_member_role uten å være eier';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.remove_member((select project_id from ids), '00000000-0000-0000-0000-00000000000a');
  raise exception 'TEST FEILET: medlem fjernet eieren';
exception when insufficient_privilege then null;
end $$;
update project_members set handles_tasks = false where user_id = auth.uid();
select pg_temp.check((select not handles_tasks from project_members where user_id = auth.uid()), 'medlem endrer eget ansvar');

-- Eieren kan ikke forlate prosjektet som eneste eier.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  perform public.remove_member((select project_id from ids), auth.uid());
  raise exception 'TEST FEILET: siste eier forlot prosjektet';
exception when check_violation then null;
end $$;

-- Når Bjørn fjernes, mister oppgaven ansvarlig, men beholder prosjektet.
select public.remove_member((select project_id from ids), '00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select assignee_id is null and project_id is not null from tasks), 'ansvarlig nullstilles ved fjerning');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from tasks) = 0, 'fjernet medlem mister tilgang');

-- Sletting av prosjekt fjerner alt.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
delete from projects;
reset role;
select pg_temp.check((select count(*) from tasks) + (select count(*) from transactions) + (select count(*) from month_budgets) = 0, 'sletting kaskaderer');

-- Hjelpefunksjonene ligger utenfor API-skjemaet.
select pg_temp.check(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('is_project_member', 'is_project_owner', 'shares_project_with', 'my_confirmed_email')), 'hjelpere ikke i public');
select pg_temp.check(not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'), 'handle_new_user kan ikke kalles');

-- Kategorier huskes med farge og er private for prosjektet.
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
create temp table ids2 as select public.create_project('Kategoritest') as project_id;
insert into tasks (project_id, title, category) select project_id, 'a', 'Program' from ids2;
insert into tasks (project_id, title, category) select project_id, 'b', 'Lyd' from ids2;
insert into tasks (project_id, title, category) select project_id, 'c', 'Program' from ids2;
insert into transactions (project_id, name, amount_ore, occurred_on, type, category) select project_id, 'x', 100, '2026-09-01', 'expense', 'Program' from ids2;
select pg_temp.check((select count(*) from categories where scope = 'task') = 2, 'to oppgavekategorier');
select pg_temp.check((select color from categories where scope = 'task' and name = 'Lyd') = 1, 'neste ledige farge');
select pg_temp.check((select count(*) from categories where scope = 'finance') = 1, 'økonomikategori separat');
update categories set color = 5 where name = 'Lyd';
select pg_temp.check((select color from categories where name = 'Lyd') = 5, 'farge kan endres');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from categories) = 0, 'utenforstående ser ikke kategorier');
update categories set color = 0;
reset role;
select pg_temp.check((select color from categories where name = 'Lyd') = 5, 'utenforstående kan ikke endre farge');

-- Nytt navn på kategori oppdaterer alle oppgaver og beholder fargen.
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.rename_category((select project_id from ids2), 'task', 'Lyd', 'Lyd og lys');
select pg_temp.check((select count(*) from tasks where category = 'Lyd og lys') = 1, 'oppgave fikk nytt kategorinavn');
select pg_temp.check((select color from categories where name = 'Lyd og lys') = 5, 'farge beholdt');
select pg_temp.check(not exists (select 1 from categories where name = 'Lyd'), 'gammelt navn fjernet');
select pg_temp.check((select count(*) from transactions where category = 'Program') = 1, 'økonomi urørt');
select public.rename_category((select project_id from ids2), 'task', 'Lyd og lys', 'Program');
select pg_temp.check((select count(*) from tasks where category = 'Program') = 3, 'sammenslått');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  perform public.rename_category((select project_id from ids2), 'task', 'Program', 'Hacket');
  raise exception 'TEST FEILET: utenforstående ga nytt navn';
exception when insufficient_privilege then null;
end $$;
reset role;
