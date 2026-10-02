-- Valutaer.
--
-- Hvert prosjekt har en regnskapsvaluta (projects.currency). Alle summer,
-- budsjetter og saldoer er i den. En post kan registreres i en annen valuta:
-- da lagres originalbeløpet, valutaen og kursen som ble brukt, og
-- transactions.amount_ore er beløpet regnet om til regnskapsvalutaen
-- (i hundredeler). Slik blir summene stabile selv om kursene endrer seg.

alter table public.projects
  add column currency text not null default 'NOK' check (currency ~ '^[A-Z]{3}$');
-- Eksisterende prosjekter beholder NOK; nye prosjekter får DKK.
alter table public.projects alter column currency set default 'DKK';

alter table public.transactions
  add column orig_currency text check (orig_currency ~ '^[A-Z]{3}$'),
  add column orig_amount bigint check (orig_amount > 0 and orig_amount < 1000000000000000),
  -- Antall enheter regnskapsvaluta per enhet originalvaluta.
  add column fx_rate numeric(20, 10) check (fx_rate > 0),
  -- Datoen kursen gjelder for (siste bankdag før eller på postens dato).
  add column fx_date date;

update public.transactions t
set orig_currency = p.currency, orig_amount = t.amount_ore, fx_rate = 1, fx_date = t.occurred_on
from public.projects p
where p.id = t.project_id;

alter table public.transactions
  alter column orig_currency set not null,
  alter column orig_amount set not null,
  alter column fx_rate set not null;

-- En post uten valutafelt er i regnskapsvalutaen.
create or replace function public.default_tx_currency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.orig_currency is null then
    new.orig_currency := (select currency from public.projects where id = new.project_id);
  end if;
  if new.orig_amount is null then
    new.orig_amount := new.amount_ore;
  end if;
  if new.fx_rate is null then
    new.fx_rate := 1;
  end if;
  if new.fx_date is null then
    new.fx_date := new.occurred_on;
  end if;
  return new;
end;
$$;
create trigger transactions_default_currency before insert on public.transactions
  for each row execute function public.default_tx_currency();
revoke execute on function public.default_tx_currency() from public, anon, authenticated;

-- Valutaen settes når prosjektet opprettes.
create or replace function public.create_project(p_name text, p_opening_balance_ore bigint default 0, p_currency text default 'DKK')
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
  insert into public.projects (name, opening_balance_ore, currency, created_by)
  values (btrim(p_name), coalesce(p_opening_balance_ore, 0), upper(coalesce(p_currency, 'DKK')), auth.uid())
  returning id into v_id;
  insert into public.project_members (project_id, user_id, role, handles_tasks, handles_finance)
  values (v_id, auth.uid(), 'owner', true, true);
  return v_id;
end;
$$;
drop function if exists public.create_project(text, bigint);
revoke execute on function public.create_project(text, bigint, text) from public, anon;
grant execute on function public.create_project(text, bigint, text) to authenticated;

-- Bytt regnskapsvaluta og regn om alt i én transaksjon. Appen henter kursene
-- og sender de nye beløpene; her sjekkes tilgang og at alle poster er med.
--   p_tx       [{ "id": uuid, "amount": hundredeler, "rate": kurs, "fx_date": dato }]
--   p_budgets  [{ "month": dato, "amount": hundredeler }]
create or replace function public.set_project_currency(
  p_project uuid, p_currency text, p_opening bigint, p_tx jsonb, p_budgets jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not private.is_project_owner(p_project) then
    raise exception 'Bare prosjekteiere kan bytte valuta.' using errcode = '42501';
  end if;
  if p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Ukjent valuta.' using errcode = '22023';
  end if;
  select count(*) into v_count from public.transactions where project_id = p_project;
  if v_count <> jsonb_array_length(coalesce(p_tx, '[]'::jsonb)) then
    raise exception 'Alle poster må regnes om. Last siden på nytt og prøv igjen.' using errcode = '40001';
  end if;

  update public.transactions t
  set amount_ore = (x ->> 'amount')::bigint,
      fx_rate = (x ->> 'rate')::numeric,
      fx_date = (x ->> 'fx_date')::date
  from jsonb_array_elements(p_tx) x
  where t.id = (x ->> 'id')::uuid and t.project_id = p_project;

  update public.month_budgets b
  set budget_ore = (x ->> 'amount')::bigint
  from jsonb_array_elements(coalesce(p_budgets, '[]'::jsonb)) x
  where b.project_id = p_project and b.month = (x ->> 'month')::date;

  update public.projects set currency = p_currency, opening_balance_ore = p_opening where id = p_project;
end;
$$;
revoke execute on function public.set_project_currency(uuid, text, bigint, jsonb, jsonb) from public, anon;
grant execute on function public.set_project_currency(uuid, text, bigint, jsonb, jsonb) to authenticated;
