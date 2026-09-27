#!/usr/bin/env bash
# Kjører migrasjonen og tilgangstestene mot en midlertidig lokal Postgres.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
PGBIN=/usr/lib/postgresql/16/bin
DATA=$(mktemp -d)
chown postgres "$DATA" 2>/dev/null || true
run() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
run "$PGBIN/initdb -D $DATA -A trust >/dev/null"
run "$PGBIN/pg_ctl -D $DATA -o '-p 54339 -k /tmp' -l $DATA/log start >/dev/null"
trap 'run "$PGBIN/pg_ctl -D $DATA stop -m fast >/dev/null"; rm -rf $DATA' EXIT
PSQL="psql -h /tmp -p 54339 -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c 'create database t'
$PSQL -d t -f "$DIR/stub_auth.sql"
for f in "$DIR"/../migrations/*.sql; do $PSQL -d t -f "$f"; done
$PSQL -d t -o /dev/null -f "$DIR/rls_test.sql"
echo "Alle databasetester bestått."
