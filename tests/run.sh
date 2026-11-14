#!/usr/bin/env bash
# ============================================================
# Family Planner · pruebas automáticas
# ------------------------------------------------------------
# Uso:  bash tests/run.sh
#
# Crea un PostgreSQL temporal, aplica las migraciones de supabase/migrations
# (con una imitación mínima de Supabase: roles, auth.users y auth.uid()), sirve la
# web en local y ejecuta:
#   · tests/db/*.test.sql       reglas de acceso, usuarios y ajustes, aviso semanal, formatos
#   · tests/function/*.test.mjs las edge functions: aviso semanal (Resend simulado) y planes de ocio (agenda de Madrid de muestra)
#   · tests/app/*.test.js       la aplicación en Chromium contra esa base de datos
# Al terminar borra todo lo temporal. Sale con código 1 si alguna comprobación falla.
#
# Necesita: PostgreSQL 15 o superior (initdb, pg_ctl, psql), Node 22 o superior,
# Python 3 y Playwright con Chromium (npm install --prefix tests && npx --prefix tests playwright install chromium).
# Ver tests/README.md.
# ============================================================
set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TESTS="$ROOT/tests"
MIG="$ROOT/supabase/migrations"

# ---------- PostgreSQL temporal ----------
PG_CTL=$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl 2>/dev/null | sort -V | tail -1)
[ -x "$PG_CTL" ] || { echo "No se encuentra pg_ctl: instala PostgreSQL 15 o superior"; exit 2; }
PG_BIN=$(dirname "$PG_CTL")
WORK=$(mktemp -d "${TMPDIR:-/tmp}/family-planner-tests.XXXXXX")
export PGHOST="$WORK" PGPORT=54329 PGUSER=postgres PGDATABASE=fptest

# PostgreSQL no se ejecuta como root: en ese caso lo arranca el usuario "postgres"
as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else sh -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$WORK"
chmod 755 "$WORK"

as_pg "'$PG_BIN/initdb' -D '$WORK/data' -U postgres -A trust >/dev/null" || { echo "initdb ha fallado"; exit 2; }
as_pg "'$PG_CTL' -D '$WORK/data' -o \"-p $PGPORT -k '$WORK' -c listen_addresses=''\" -l '$WORK/log' -w start >/dev/null" || { echo "No arranca PostgreSQL"; cat "$WORK/log"; exit 2; }

SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  as_pg "'$PG_CTL' -D '$WORK/data' -m fast stop >/dev/null" 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT

PSQL=(psql -X -q -v ON_ERROR_STOP=1)

# Base de datos nueva con todas las migraciones aplicadas.
# Los correos de las cuentas se sustituyen por los de prueba (el repositorio no los guarda).
fresh_db() {
  "${PSQL[@]}" -d postgres -c "drop database if exists fptest" -c "create database fptest" >/dev/null 2>&1 || return 1
  "${PSQL[@]}" -f "$TESTS/db/supabase_stub.sql" >/dev/null 2>&1 || return 1
  local subst='s/CORREO_DE_ALBERTO/alberto@example.com/g; s/CORREO_DE_LAURA/laura@example.com/g'
  sed "$subst" "$MIG/001_initial_schema.sql" | "${PSQL[@]}" >/dev/null 2>&1 || { echo "falla la migración 001"; return 1; }
  "${PSQL[@]}" -f "$TESTS/db/seed_v1.sql" >/dev/null || return 1
  sed "$subst" "$MIG/002_family_members.sql" | "${PSQL[@]}" >/dev/null || { echo "falla la migración 002"; return 1; }
  for m in 003_weekly_digest 004_user_formats 005_members_only_read; do
    "${PSQL[@]}" -f "$MIG/$m.sql" >/dev/null || { echo "falla la migración $m"; return 1; }
  done
  # 006: la parte de pg_net solo existe en Supabase; aquí se aplica la de rls_auto_enable()
  sed '/^-- 2\. pg_net/,$d' "$MIG/006_advisor_fixes.sql" | "${PSQL[@]}" >/dev/null || { echo "falla la migración 006"; return 1; }
  "${PSQL[@]}" -f "$MIG/007_activities_from_plan.sql" >/dev/null || { echo "falla la migración 007"; return 1; }
  if [ "${1:-}" = extra ]; then "${PSQL[@]}" -f "$TESTS/db/seed_extra.sql" >/dev/null || return 1; fi
}

TOTAL_OK=0; TOTAL_FAIL=0
report() {   # $1 título, $2 salida de la prueba
  local okc failc
  okc=$(grep -c '^OK' <<<"$2"); failc=$(grep -cE '^FALLO|^PARADA' <<<"$2")
  TOTAL_OK=$((TOTAL_OK + okc)); TOTAL_FAIL=$((TOTAL_FAIL + failc))
  printf '%-48s %3s OK' "$1" "$okc"
  if [ "$failc" -gt 0 ]; then printf '   %s FALLO\n' "$failc"; grep -E '^FALLO|^PARADA' <<<"$2" | sed 's/^/    /'; else echo; fi
}

echo "== Base de datos"
for t in access_rules users_settings user_formats members_only from_plan; do
  fresh_db || exit 1
  out=$("${PSQL[@]}" -f "$TESTS/db/$t.test.sql" 2>&1 | grep -oE '(OK   |FALLO).*|ERROR.*' | sed 's/^ERROR/FALLO ERROR/')
  report "db/$t" "$out"
done
fresh_db extra || exit 1
out=$("${PSQL[@]}" -f "$TESTS/db/weekly_digest.test.sql" 2>&1 | grep -oE '(OK   |FALLO).*|ERROR.*' | sed 's/^ERROR/FALLO ERROR/')
report "db/weekly_digest" "$out"

echo "== Edge functions (aviso semanal y planes de ocio)"
fresh_db || exit 1
out=$(timeout 180 node --experimental-strip-types --no-warnings "$TESTS/function/weekly-digest.test.mjs" 2>&1 || echo "PARADA: la prueba no ha terminado bien")
report "function/weekly-digest" "$out"
out=$(timeout 120 node --experimental-strip-types --no-warnings "$TESTS/function/leisure-events.test.mjs" 2>&1 || echo "PARADA: la prueba no ha terminado bien")
report "function/leisure-events" "$out"

echo "== Aplicación (Chromium)"
python3 -m http.server 8199 --bind 127.0.0.1 --directory "$ROOT" >/dev/null 2>&1 &
SERVER_PID=$!
sleep 1
export BASE_URL="http://127.0.0.1:8199/"
for t in flow planner boot idle csp leisure; do
  fresh_db || exit 1
  out=$(cd "$TESTS/app" && timeout 300 node "$t.test.js" 2>&1 || echo "PARADA: la prueba no ha terminado bien")
  report "app/$t" "$out"
done

echo
echo "Total: $TOTAL_OK correctas, $TOTAL_FAIL fallidas"
[ "$TOTAL_FAIL" -eq 0 ]
