#!/usr/bin/env bash
# Lokal Supabase-lignende stakk for ende-til-ende-tester:
# Postgres 16 + Supabase Auth (GoTrue) + PostgREST bak én proxy på http://localhost:54321.
# Bruk: e2e/stack.sh start | stop
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$DIR/.."
BIN="$DIR/.bin"
RUN="$DIR/.run"
PGBIN=/usr/lib/postgresql/16/bin
PORT=54329
JWT_SECRET="lokal-hemmelighet-som-er-minst-32-tegn-lang"
as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }

fetch() {
  mkdir -p "$BIN"
  if [ ! -x "$BIN/postgrest" ]; then
    curl -sSL https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz | tar xJ -C "$BIN"
  fi
  if [ ! -x "$BIN/auth" ]; then
    curl -sSL https://github.com/supabase/auth/releases/download/v2.180.0/auth-v2.180.0-x86.tar.gz | tar xz -C "$BIN"
  fi
}

stop() {
  for p in "$RUN"/*.pid; do [ -f "$p" ] && kill "$(cat "$p")" 2>/dev/null || true; done
  [ -d "$RUN/pg" ] && as_pg "$PGBIN/pg_ctl -D $RUN/pg stop -m fast" >/dev/null 2>&1 || true
  rm -rf "$RUN"
}

start() {
  fetch
  stop
  mkdir -p "$RUN/pg"
  chown postgres "$RUN" "$RUN/pg" 2>/dev/null || true
  as_pg "$PGBIN/initdb -D $RUN/pg -A trust -U postgres >/dev/null"
  as_pg "$PGBIN/pg_ctl -D $RUN/pg -o '-p $PORT -k /tmp -c listen_addresses=127.0.0.1' -l $RUN/pg/log start >/dev/null"
  PSQL="psql -h 127.0.0.1 -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
  $PSQL -f "$DIR/roles.sql"

  # Supabase Auth kjører sine egne migrasjoner i auth-skjemaet ved oppstart.
  (
    cd "$BIN"
    GOTRUE_DB_DRIVER=postgres \
    DATABASE_URL="postgres://supabase_auth_admin:lokal@127.0.0.1:$PORT/postgres" \
    GOTRUE_DB_NAMESPACE=auth \
    GOTRUE_SITE_URL=http://localhost:4173 \
    GOTRUE_URI_ALLOW_LIST="http://localhost:4173/**,http://localhost:5173/**" \
    API_EXTERNAL_URL=http://localhost:54321/auth/v1 \
    GOTRUE_API_HOST=127.0.0.1 PORT=9999 \
    GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated \
    GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
    GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
    GOTRUE_MAILER_AUTOCONFIRM="${AUTOCONFIRM:-true}" \
    GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=2500 GOTRUE_SMTP_ADMIN_EMAIL=test@localhost \
    GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_RATE_LIMIT_TOKEN_REFRESH=10000 GOTRUE_RATE_LIMIT_VERIFY=10000 \
    GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true GOTRUE_PASSWORD_MIN_LENGTH=8 \
    GOTRUE_LOG_LEVEL=warn \
    ./auth > "$RUN/auth.log" 2>&1 &
    echo $! > "$RUN/auth.pid"
  )
  for _ in $(seq 1 60); do curl -sf http://127.0.0.1:9999/health >/dev/null 2>&1 && break; sleep 0.5; done
  curl -sf http://127.0.0.1:9999/health >/dev/null || { cat "$RUN/auth.log"; exit 1; }

  # Appens migrasjoner, i samme rekkefølge som i Supabase.
  for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -f "$f"; done

  PGRST_DB_URI="postgres://authenticator:lokal@127.0.0.1:$PORT/postgres" \
  PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" \
  PGRST_SERVER_HOST=127.0.0.1 PGRST_SERVER_PORT=3000 PGRST_DB_POOL=10 \
    "$BIN/postgrest" > "$RUN/postgrest.log" 2>&1 &
  echo $! > "$RUN/postgrest.pid"

  node "$DIR/proxy.mjs" > "$RUN/proxy.log" 2>&1 &
  echo $! > "$RUN/proxy.pid"
  for _ in $(seq 1 60); do curl -sf http://127.0.0.1:54321/rest/v1/ -H "apikey: $(node "$DIR/anon-key.mjs")" >/dev/null 2>&1 && break; sleep 0.5; done
  echo "Lokal stakk kjører på http://localhost:54321 (anon-nøkkel: node e2e/anon-key.mjs)"
}

"${1:-start}"
