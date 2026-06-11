# Getting Started — Namokara Suite

This guide walks you through running the platform locally in under 10 minutes.

## Prerequisites Check

```bash
# Verify versions:
docker --version          # Need Docker 24+
docker compose version    # Need v2.20+
node --version            # Need v20+
npm --version             # Need v10+
dotnet --version          # Need 8.0+
```

If any missing, install:
- **Docker Desktop:** https://docker.com/products/docker-desktop
- **Node 20:** https://nodejs.org or `nvm install 20`
- **.NET 8 SDK:** https://dotnet.microsoft.com/download/dotnet/8.0

## Step 1: Configure Environment

```bash
cd namokara-suite
cp .env.example .env
```

Edit `.env` if you need to change ports or passwords. **For local dev, defaults are fine.**

## Step 2: Start Infrastructure (PostgreSQL, Redis, MinIO, etc.)

```bash
docker compose up -d
```

Wait ~30 seconds. Check all services are healthy:

```bash
docker compose ps
```

You should see all containers with `(healthy)` status.

**What's running:**
- `namokara_postgres` (PostgreSQL 16) on port 5432 — DB schemas auto-created
- `namokara_pgbouncer` (connection pooler) on port 6432
- `namokara_redis` (cache) on port 6379
- `namokara_minio` (S3 storage) on port 9000 (API) + 9001 (console)
- `namokara_seq` (log viewer) on port 5341
- `namokara_pgadmin` (DB GUI) on port 5050
- `namokara_mailhog` (email catcher) on port 8025
- `namokara_jaeger` (tracing) on port 16686

## Step 3: Verify Database Schemas

```bash
docker exec -it namokara_postgres psql -U namokara -d namokara_dev -c "\dn"
```

Should show schemas: `platform`, `core`, `trading`, `accounting`, `suppliers`, `hr`, `ai`, `audit`.

## Step 4: Seed Demo Data

```bash
# Core demo data (firm, users, branches, contacts)
docker exec -i namokara_postgres psql -U namokara -d namokara_dev < db/seed/demo-data.sql

# Accounting defaults (chart of accounts + ledgers)
docker exec -i namokara_postgres psql -U namokara -d namokara_dev < db/seed/accounting-defaults.sql

# Trading defaults (party profiles + sample items)
docker exec -i namokara_postgres psql -U namokara -d namokara_dev < db/seed/trading-defaults.sql

# Suppliers defaults (27 categories + supplier profiles)
docker exec -i namokara_postgres psql -U namokara -d namokara_dev < db/seed/suppliers-defaults.sql

# HR defaults (policy + holidays + salary structures + 3 employees from demo users)
docker exec -i namokara_postgres psql -U namokara -d namokara_dev < db/seed/hr-defaults.sql
```

Output should say:
```
Demo data seeded ✓
firms_count: 1  users_count: 4  branches_count: 3  contacts_count: 4

Accounting defaults seeded ✓
heads: 5  groups: 11  sub_groups: 15  ledgers: 14

Trading defaults seeded ✓
parties: 2  items: 7

Suppliers defaults seeded ✓
categories: 27  suppliers: 2
```

## Step 5: Start Backend API

```bash
cd apps/api
dotnet restore
dotnet run
```

Wait for:
```
Namokara API ready on http://localhost:5000
```

Open http://localhost:5000/swagger — Swagger UI should load.

Test the version endpoint:
```bash
curl http://localhost:5000/api/version
```

## Step 6: Start Frontend

In a **new terminal**:

```bash
cd apps/web
npm install
npm start
```

Wait for:
```
✔ Compiled successfully.
➜  Local:   http://localhost:4200/
```

Open **http://localhost:4200** in browser.

## Step 7: Login

Use one of these demo accounts (all passwords: `Demo@123`):

| Username | Role | What you can do |
|---|---|---|
| `anjaninex` | Super Admin | Everything (Anjaninex platform owner) |
| `rajesh` | Firm Owner | All Namokara Agencies operations |
| `admin` | Firm Admin | Most operations except wallet recharge |
| `asha` | Staff | Basic bill/payment entry |

After login you'll see the dashboard with debug session info showing all your permissions loaded.

## Common Issues

### "Connection refused" on port 5432
- Postgres still starting. Wait 30 seconds and try again.
- Check: `docker logs namokara_postgres`

### Backend can't connect to DB
- Verify `appsettings.Development.json` connection string uses `Port=6432` (PgBouncer)
- Or `Port=5432` if connecting directly

### Frontend "ERR_CONNECTION_REFUSED"
- Backend not running. Start it first.
- Check CORS in `apps/api/appsettings.json` allows `http://localhost:4200`

### Login fails with "Invalid credentials"
- Did you run the demo data seed? (Step 4)
- Check `core.users` table:
  ```bash
  docker exec -it namokara_postgres psql -U namokara -d namokara_dev -c "SELECT username, full_name FROM core.users;"
  ```

### PWA install button not showing
- PWA only works over HTTPS in production. In local dev, use Chrome DevTools → Application → Manifest to verify.
- In production, the install prompt will appear automatically on 2nd visit.

## Next Steps After Setup

1. Read `BLUEPRINT.md` (parent folder) — understand the full architecture
2. Look at `apps/api/Modules/Platform/` to see how Platform module is structured
3. Look at `apps/web/src/app/pages/login/` to see how Angular components work
4. Start building **Accounting module** (Week 5-6 plan in BLUEPRINT.md)

## Reset Everything

If you want to start fresh:

```bash
# Stop everything + delete all data
docker compose down -v

# Restart
docker compose up -d

# Re-seed
docker exec -i namokara_postgres psql -U namokara -d namokara_dev < db/seed/demo-data.sql
```

## Production Deployment

See `deploy/hostinger-vps/install.sh` for Hostinger VPS setup (coming in Week 12).

---

*Need help? Email support@anjaninex.com*
