#!/usr/bin/env bash
# 02 — PostgreSQL: DB + non-superuser app role (RLS ke liye zaroori)
# EDIT password neeche, phir: sudo ./02-db-setup.sh
set -e

DB_NAME="namokara"
DB_USER="namokara_app"
DB_PASS="STRONG_DB_PASS"     # <<< BADLO (strong password)

echo "==> Creating DB + user"
sudo -u postgres psql <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  END IF;
END \$\$;
SELECT 'db' FROM pg_database WHERE datname='${DB_NAME}' \gset
\if :{?db}
\else
  CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
\endif
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL

sudo -u postgres psql -d "${DB_NAME}" <<SQL
ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};
GRANT ALL ON SCHEMA public TO ${DB_USER};
SQL

echo "==> DONE. DB=${DB_NAME} USER=${DB_USER}"
echo "NOTE: App isi user se connect kare — 'postgres' superuser se NAHI (RLS bypass na ho)."
