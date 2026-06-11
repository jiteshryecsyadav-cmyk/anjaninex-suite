# Namokara Suite

> Multi-tenant B2B SaaS platform — **Trading · Accounting · Suppliers · HR**
> **Built by [Anjaninex](https://anjaninex.com)** for Namokara Agencies (first client)

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)]()
[![Stack](https://img.shields.io/badge/stack-Angular_19_+_.NET_8_+_PostgreSQL_16-purple.svg)]()
[![Status](https://img.shields.io/badge/status-Week_1_Foundation-green.svg)]()

## What Is This

A complete production-ready platform combining:
- **Trading module** — Orders, Bills, GR, Payments, Commission
- **Accounting module** — Tally-style double-entry with Trial Balance, P&L, Balance Sheet
- **Suppliers module** — Directory with photos, rates, WhatsApp
- **HR module** — Staff, Attendance with selfie, Leave, Payroll
- **AI Multi-Agent** — Bill scan, voice orders, smart search (7 specialized agents)
- **Multi-tenant SaaS** — Anjaninex serves many firms via the same codebase
- **Wallet system** — Per-firm wallet + Anjaninex platform revenue tracking
- **PWA** — Install on phone, works offline, auto-updates

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Angular 19 (standalone components, signals) + Tailwind CSS + PWA |
| Backend | .NET Core 8 (modular monolith) + EF Core 8 + SignalR |
| Database | PostgreSQL 16 + Row-Level Security + Partitioning |
| Cache | Redis 7 |
| Storage | MinIO (local) / S3 (production) |
| Auth | JWT + Refresh tokens + RBAC with action-level permissions |
| AI | Google Gemini 2.5 Flash + Document AI fallback |
| Hosting | Hostinger KVM → Hetzner CCX → AWS (scaling phases) |

## Quick Start (Local Dev — 3 commands)

**Prerequisites:** Docker Desktop, Node 20+, .NET 8 SDK

```bash
# 1. Clone (or you're already here)
cd namokara-suite

# 2. Copy env template
cp .env.example .env

# 3. Start everything
docker compose up -d
```

**Wait ~30 seconds** for all containers to be healthy.

Then in two separate terminals:

```bash
# Terminal 1: Backend API
cd apps/api
dotnet restore
dotnet ef database update
dotnet run
# → API at http://localhost:5000/swagger

# Terminal 2: Frontend
cd apps/web
npm install
npm start
# → Web at http://localhost:4200
```

Open **http://localhost:4200** and login with demo credentials.

## Demo Credentials

All users have password: `Demo@123`

| Username | Role | Access |
|---|---|---|
| `anjaninex` | Super Admin (Anjaninex) | All firms (platform-wide) |
| `rajesh` | Firm Owner | All branches of Namokara Agencies |
| `admin` | Firm Admin | All operations except wallet recharge |
| `asha` | Staff | Operational tasks in Jaipur HQ |

## Service URLs

| Service | URL | Credentials |
|---|---|---|
| **Frontend (Web)** | http://localhost:4200 | See demo credentials |
| **Admin Portal (Anjaninex)** | http://localhost:4201 | `anjaninex` / `Demo@123` |
| **API Swagger** | http://localhost:5000/swagger | — |
| **API Health** | http://localhost:5000/healthz | — |
| **PgAdmin (DB GUI)** | http://localhost:5050 | `dev@namokara.local` / `dev_only_change_me` |
| **MinIO Console** | http://localhost:9001 | `namokara` / `dev_only_change_me` |
| **Seq Logs** | http://localhost:5341 | — |
| **Mailhog (emails)** | http://localhost:8025 | — |
| **Jaeger (traces)** | http://localhost:16686 | — |

## Repository Structure

```
namokara-suite/
├── apps/
│   ├── api/              ← .NET Core 8 modular monolith
│   │   ├── Modules/
│   │   │   ├── Platform/       (Anjaninex: firms, plans, wallet, version)
│   │   │   ├── Core/           (users, RBAC, branches, contacts)
│   │   │   ├── Trading/        (parties, bills, payments) — Week 7-8
│   │   │   ├── Accounting/     (ledgers, vouchers) — Week 5-6
│   │   │   ├── Suppliers/      (directory, photos) — Week 11
│   │   │   ├── Hr/             (staff, attendance) — Week 10
│   │   │   └── Ai/             (agents, orchestrator) — Week 10-11
│   │   ├── Common/             (auth, middleware)
│   │   ├── Infrastructure/     (db, cache, storage)
│   │   └── Program.cs
│   │
│   ├── web/              ← Angular 19 PWA (main app)
│   │   └── src/app/
│   │       ├── core/           (auth, http, version)
│   │       ├── layout/         (shell, top nav)
│   │       ├── pages/          (login, dashboard, forbidden)
│   │       └── modules/        (trading, accounting, etc — coming)
│   │
│   └── admin/            ← Angular 19 PWA (Anjaninex super-admin) — Week 12
│
├── db/
│   ├── init/             (auto-run on first PG start)
│   └── seed/             (demo data scripts)
│
├── deploy/
│   ├── docker/
│   ├── nginx/
│   └── scripts/
│
├── docker-compose.yml    ← Local dev stack (12 services)
└── README.md             ← This file
```

## What's Working Right Now (Week 1)

✅ Multi-tenant database with Row-Level Security
✅ Subscription plans (Starter / Pro / Enterprise) seeded
✅ 6 system roles + ~40 permissions seeded
✅ Demo firm (Namokara Agencies) with 4 users, 3 branches, 4 contacts
✅ JWT authentication (login/refresh/logout/me)
✅ RBAC with `[HasPermission("...")]` attribute
✅ Wallet service with debit/recharge/history
✅ Version + Changelog endpoints
✅ Angular login page with Namokara branding + "Powered by Anjaninex"
✅ Top nav shell with branch switcher, wallet, notifications
✅ PWA service worker config + manifest
✅ Auto-update banner
✅ Docker Compose with 12 services

## What's Coming Next

| Week | Module | Status |
|---|---|---|
| 2 | RBAC matrix UI + Branch/User management screens | Next |
| 3 | Cmd+K command palette + Right drawer + Notifications | |
| 4 | Contacts Hub + Settings | |
| 5-6 | **Accounting module** (Chart of Accounts → Vouchers → Reports) | |
| 7-8 | **Trading module** (Party → Order → Bill → Payment → GR) | |
| 9 | Reports module (12 broker reports + financial) | |
| 10 | HR module + AI activation phase 1 | |
| 11 | Suppliers module + WhatsApp + AI activation phase 2 | |
| 12 | Anjaninex Admin Portal + Production launch | |

## Documentation

- 📄 `BLUEPRINT.md` (in parent folder) — Complete 4,500-line architectural blueprint
- 📁 `blueprint-code/` (in parent folder) — 12 production-ready code samples

## Support

- **Anjaninex Support:** support@anjaninex.com
- **Bug reports:** GitHub Issues (private repo)
- **Architecture questions:** Reference `BLUEPRINT.md`

## License

Proprietary — All rights reserved by Anjaninex.

---

*Powered by Anjaninex · Building world-class B2B software*
