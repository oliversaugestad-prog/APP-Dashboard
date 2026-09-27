-- Roller og skjema som Supabase har fra før. Brukes bare av den lokale teststakken.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password 'lokal';
grant anon, authenticated, service_role to authenticator;
create role supabase_auth_admin login createrole noinherit password 'lokal';
create schema auth authorization supabase_auth_admin;
grant create on database postgres to supabase_auth_admin;
alter role supabase_auth_admin set search_path = 'auth';
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
