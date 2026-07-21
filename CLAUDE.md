# CLAUDE.md — Anjaninex Suite (Vyapaar Setu)

Multi-tenant B2B SaaS for Indian trading firms. Anjaninex platform banata hai; har client ek
"firm" hai. Pehla client: Namokara Agencies.

> Namespace `Namokara.Api.*` hai (purana naam) — code me `Namokara` dikhe to wahi hai, rename mat karna.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Angular 19 standalone components + signals, Tailwind 3.4, PWA, TypeScript 5.5 |
| Backend | .NET 8 modular monolith, EF Core 8, SignalR, Serilog |
| Database | PostgreSQL 16 + Row-Level Security, pgbouncer |
| Cache | Redis (prod) / in-memory (dev) |
| Storage | MinIO (S3-compatible) |
| AI | Google Gemini 2.5 Flash (bill scan, Anji assistant), Sarvam AI (Hindi TTS) |
| Deploy | Hostinger VPS — systemd + nginx (`deploy-kit/`) |

## Layout

```
apps/api/            .NET 8 API
  Common/            auth attributes, middleware, FriendlyError, NameCase
  Infrastructure/    AppDbContext, interceptors (tenant + audit), MinIO storage
  Modules/<Name>/    Controllers/ Entities/ Services/   ← module boundary
apps/web/src/app/
  core/              auth guard/service/interceptors, version+update
  layout/shell/      top nav, branch switcher, wallet
  modules/<name>/    pages/ services/ components/ + <name>.routes.ts
  shared/            reusable components, pipes, utils (niche dekho)
db/init/             raw SQL migrations, number-prefixed
bot/                 WhatsApp bot (Node.js) — same Postgres se baat karta hai
voice-bridge/        Python voice bridge (Sarvam / OpenAI realtime)
deploy-kit/          VPS setup + deploy shell scripts
public-site/         marketing site (static HTML)
```

Modules: **Platform** (firms, subscription, wallet, Razorpay, agents/resellers, feature flags,
audit, complaints, party-chat hub) · **Core** (auth, users, RBAC, branches, transporters) ·
**Trading** (parties, items, orders, bills, payments, GR, commission, cheque) · **Accounting**
(CoA, vouchers, TB/P&L/BS) · **Suppliers** (directory, buyers, catalog, appointments, match) ·
**HR** (staff, attendance, leave, payroll) · **AI** · **Reports** · **Credil** (credit score) ·
**Dukan** (online storefront) · **Migration** (Tally/Busy/Marg import)

## Ye 5 rule tod diye to app tootega

### 1. RLS — tenant isolation DB me hai, code me nahi

Har table par Row-Level Security hai jo `app.current_firm_id` setting padhti hai. Ye har
authenticated request par [Program.cs](apps/api/Program.cs) ke middleware me set hota hai, aur
poori request tak connection khula rehta hai.

- Query me manually `WHERE firm_id = ...` lagane ki zarurat nahi — DB khud filter karti hai.
- **Nayi table banao to uspar RLS policy zaroor likho**, warna wo table sab firms ko dikhegi.
- `_db.Database.GetDbConnection()` se raw ADO use karna theek hai (counters isi tarah kaam
  karte hain), par usko `OpenAsync()` mat karna — connection pehle se khula hai.
- Super admin bypass hota hai (`app.is_platform_admin`).

### 2. Document numbers — hamesha `ReserveCounterAsync`

Bill/order/voucher/payment/commission numbers gap-free aur per-firm+branch+FY hone chahiye.
Har service ka apna `ReserveCounterAsync(firmId, branchId, counterKey, fyYear)` hai jo row lock
leta hai. `MAX(number) + 1` **kabhi mat likhna** — concurrent users par duplicate banega.

### 3. Errors — Hinglish me, user ki bhasha me

[`FriendlyError.From(ex)`](apps/api/Common/Errors/FriendlyError.cs) Postgres SQLSTATE aur
constraint name padhkar simple Hinglish message deta hai. Global middleware har uncaught
exception par yahi lagata hai. Naya unique constraint jodo to uska friendly message
`FriendlyError` me bhi jodo — warna user ko `23505: duplicate key...` dikhega.

> Note: global handler abhi **har** exception ko HTTP 400 karta hai. Isliye asli 500-level
> crash bhi 400 dikhta hai — debugging me Seq logs (`http://localhost:5341`) dekhna, status code par mat jaana.

### 4. Permissions — har endpoint par attribute

```csharp
[HasPermission("trading.party.create.firm")]
```
Format: `module.entity.action.scope` — scope `self` / `branch` / `firm` / `platform`.
Frontend par same string `requirePermission('...')` route guard me. Naya permission SQL seed
(`db/init/SEED-permissions.sql`) me bhi add karna padta hai.
Module-level access ke liye `[ModuleAccess("...")]` — firm ne wo module khareeda hai ya nahi.

### 5. Migrations — raw SQL, EF migrations nahi

Nayi file `db/init/NN-kaam-ka-naam.sql`. Idempotent likho (`IF NOT EXISTS`, `ON CONFLICT DO
NOTHING`) — scripts dobara chal sakti hain.

> ⚠️ Abhi kai numbers repeat hain (18, 19, 20, 48, 49, 50, 51, 52, 73-77 do-do baar).
> Naya banao to **sabse bada number dekh kar aage se** lo, repeat mat karo.

## Frontend conventions

- **Standalone components**, koi NgModule nahi. Har page apne `imports: []` khud deta hai.
- **Signals** state ke liye (`signal()`, `computed()`), `@if` / `@for` control flow.
- **Inline template** component file ke andar — alag `.html` file nahi banate.
- Routes lazy hain: `loadComponent` / `loadChildren` har module ke `<name>.routes.ts` se.
- Tailwind utility classes + kuch custom classes (`btn-primary`, `input`, `page-top-bar`).
- Brand colors: purple `#5c1a8b` (headings), `#6b3fa0` (muted text).
- Sab UI text **Hinglish** me — user Indian trader hai, angrezi jargon nahi.

`shared/` me pehle se maujood hai (dobara mat banana): `back-button`, `paginator`, `toast.service`,
`invoice-preview`, `calculator`, `party-quick-add`, `transporter-quick-add`, `wa-send`,
`in-date.pipe`, `uppercase.directive`, `amount-in-words.util`, `india-states` / `india-pincode.service`,
`feature.service`, `anji-help`, `upgrade-nudge`, `wallet-icon`.

## Firm lifecycle

Status: `trial` → `active` → `grace_period` → `suspended` → `cancelled`.
Suspended firm ka JWT check 402 deta hai, par `/api/auth`, `/api/wallet`, `/api/subscription`,
`/api/notifications` khule rehte hain taaki wo renew kar sake. Ye logic
[Program.cs](apps/api/Program.cs) ke `OnTokenValidated` me hai.

## Shell ke bahar wale entry points

Ye teen jagah **login-less / alag-login** hain — inhe `authGuard` ke andar mat daalna:
- `/dukan/shop/:firmId` — buyer storefront (buyer ka apna token)
- `/pchat/:firmId` — party chat, mobile + OTP
- `/agent` — reseller dashboard (`agent_id` claim, koi firm nahi)

## Local dev

```bash
docker compose up -d                      # postgres, pgbouncer, redis, minio, seq, pgadmin, mailhog, jaeger
cd apps/api && dotnet run                 # http://localhost:5000/swagger
cd apps/web && npm start                  # http://localhost:4200
```

Demo login: `rajesh` / `Demo@123` (Firm Owner) · `anjaninex` / `Demo@123` (Super Admin).
Swagger sirf Development me on hota hai.

## Commit messages

Hinglish, aur **user ki dikkat ke hisaab se** likhe jaate hain — technical change ka naam nahi.
Pattern: `<Screen/Feature>: <kya galat tha / ab kya hota hai>`

```
Receipt edit: kat-kut dikhti thi par NET AMT purana — Balance Pending galat aata tha
Payment number par DB-level rok — duplicate receipt dobara na bane
Commission: jis bill ka commission ban chuka wo dobara nahi aayega (duplicate invoice band)
```

## Dhyan rakhne wali baatein

- `appsettings.json` me sirf `${ENV_VAR}` placeholders hain — asli secrets `NAMOKARA_` prefix
  wale env vars se aate hain. Kabhi asli key commit mat karna.
- Rate limit: logged-in user 1200/min (per-user, per-IP nahi — ek office = ek NAT IP),
  anonymous 600/min per IP, `/api/auth` 20/min, `/api/ai` 30/min per firm.
- `EnableRetryOnFailure()` jaan-boojh kar hataya gaya hai — manual transactions se conflict karta tha.
- README.md purana hai (abhi bhi "Week 1" bolta hai). Uspar bharosa mat karna, code dekhna.
