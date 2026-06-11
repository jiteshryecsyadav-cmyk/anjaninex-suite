#!/usr/bin/env bash
# 03 — DB migrations (fresh, demo data ke bina)
# EDIT: DB_PASS + INIT_DIR. Phir: ./03-run-migrations.sh
set -e

DB_NAME="namokara"
DB_USER="namokara_app"
DB_PASS="STRONG_DB_PASS"                          # <<< 02 wala same password
INIT_DIR="/var/www/anjaninex/db/init"            # <<< code path ke hisab se

export PGPASSWORD="$DB_PASS"
cd "$INIT_DIR"

echo "==> Numbered migrations (01..NN) order me"
for f in $(ls [0-9]*.sql | sort -V); do
  echo "   -> $f"
  psql -h localhost -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$f"
done

echo "==> Permissions seed"
psql -h localhost -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f SEED-permissions.sql

echo "==> DONE. (Demo/CLEANUP/RESET/IMPORT/UPDATE files SKIP kiye — fresh prod DB)"
