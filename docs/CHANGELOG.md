# Changelog

All notable changes to Anjaninex Suite will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [SemVer](https://semver.org/).

---

## [1.0.0] — 2026-05-26

### 🎉 Initial Release

**Foundation (Week 1 deliverables):**

#### Added
- Multi-tenant SaaS architecture (Anjaninex serves multiple firms)
- PostgreSQL 16 database with 8 schemas: `platform`, `core`, `trading`, `accounting`, `suppliers`, `hr`, `ai`, `audit`
- Row-Level Security (RLS) on all firm-scoped tables
- 4 subscription plans: Free Trial, Starter (₹999), Pro (₹2,499), Enterprise (₹6,999)
- 6-tier role hierarchy with action-level permissions
- 40+ system permissions seeded
- Demo firm with 4 users, 3 branches, 4 contacts
- .NET Core 8 modular monolith API
- JWT authentication with refresh token rotation
- `[HasPermission("...")]` attribute for declarative authorization
- Wallet service (debit/recharge/history)
- Anjaninex revenue tracking with margin calculation
- Version + Changelog API endpoints
- Angular 19 PWA shell
- Login page with Namokara branding + "Powered by Anjaninex"
- Top nav with branch switcher, wallet, notifications, theme toggle, user menu
- Service worker for PWA install
- Auto-update banner with SwUpdate
- Docker Compose with 12 services (PG, Redis, MinIO, Seq, PgAdmin, Mailhog, Jaeger)
- Comprehensive Getting Started docs

#### Tech Stack
- Frontend: Angular 19 + Tailwind CSS + ngsw
- Backend: .NET Core 8 + EF Core 8 + Npgsql + SignalR
- Database: PostgreSQL 16 + PgBouncer
- Cache: Redis 7
- Storage: MinIO

---

## [1.7.0] — 2026-05-27

### 👥 HR Module — Complete Staff Management

#### Added
- **Database:** 10 tables in `hr` schema (attendance_policies, holidays, salary_structures, employee_profiles, attendance_logs, location_trails [partitioned by month], selfies, leave_balances, leave_requests, payroll_records)
- **Database seed:** Default attendance policy (9:30-6:30 with 15min grace), 10 Indian holidays for 2026, 3 salary structures (₹15K/₹35K/₹75K CTC), 3 demo employees from existing users, leave balances initialized
- **Backend:** 6 services — EmployeeService, AttendanceService (selfie+GPS), LocationService, LeaveService, PayrollService (with **auto-post to Accounting**), HrDashboardService
- **Backend:** StorageService for MinIO file uploads (selfies → namokara-selfies bucket)
- **Backend:** **Salary auto-calc** from attendance + structure + LOP proration + PF/ESI deductions
- **Backend:** **Payroll auto-post**: Mark Paid → Dr Salary Expense + Cr Bank + Cr PF Payable + Cr ESI Payable (auto-creates ledgers if needed)
- **Backend:** Location trails partitioned by month for high-volume GPS data (~2.4M rows/staff/year)
- **Frontend:** **HR Dashboard** — staff count, today's attendance %, leave pending, monthly payroll budget
- **Frontend:** **📸 Check-in/Check-out page** — browser camera (front-facing) + Geolocation API, captures selfie + GPS coords + accuracy, mobile-optimized
- **Frontend:** **Staff Master** — searchable list with employee codes, CTC, leaves
- **Frontend:** **Monthly Attendance Register** — grid view (rows=staff, columns=days), color-coded (P/A/L/Half)
- **Frontend:** **🗺 Live Location Map** — Leaflet + OpenStreetMap, all staff trails as colored polylines with start/end markers
- **Frontend:** **Leave Management** — balance cards, apply form, my history, pending approvals (for managers)
- **Frontend:** **Payroll** — monthly run, gross/deductions/net per employee, one-click "Mark Paid + Post" to accounting

#### Key Tech
- **No Google Maps** — Leaflet + OpenStreetMap (free, India-focused)
- **MinIO integration** for selfie storage (uses existing docker-compose service)
- **getUserMedia API** for camera, **Geolocation API** for GPS
- **Browser-based, no Flutter needed** — works via PWA on any modern phone

---

## [1.6.0] — 2026-05-27

### ⚡ Anjaninex Admin Portal — SaaS Owner Control Center

#### Added
- **Backend:** `PlatformAdminService` with 16 cross-firm aggregation methods (uses IgnoreQueryFilters to bypass RLS for super_admin)
- **Backend:** `AnjaninexAdminController` exposing 19 endpoints under `/api/admin/*` — all guarded by `platform.firm.view.platform` permission
- **Backend:** Wallet recharge by Anjaninex (bypasses normal firm wallet flow)
- **Backend:** Firm suspend/activate with status transitions
- **Backend:** Plan management — CRUD + active/inactive toggle
- **Frontend:** **Anjaninex Dashboard** with MRR, MTD revenue, total firms, today's revenue, AI usage today
- **Frontend:** 30-day revenue/margin chart (purple = gross, green = margin)
- **Frontend:** Top 5 firms by revenue (rank medals 🥇🥈🥉)
- **Frontend:** Low wallet balance alerts panel
- **Frontend:** **Tenant Firms List** — search by name/GST/email, filter by status, MTD spend per firm
- **Frontend:** **Firm Detail** — full stats (branches/users/bills/vouchers/suppliers/lifetime revenue), wallet history table, recharge modal, suspend/activate buttons
- **Frontend:** **Subscription Plans** — 4-column card grid showing pricing tiers with firm counts
- **Frontend:** **AI Cost Monitor** — per-agent calls, revenue, cost, margin, margin% with totals footer
- **Frontend:** **Changelog Publisher** — compose new releases with features/improvements/fixes lines + force-update flag
- **Frontend:** Conditional Anjaninex tab in top nav (only visible to users with `platform.firm.view.platform` permission)

#### Login as Anjaninex
- Username: `anjaninex`
- Password: `Demo@123`
- After login: top nav shows red/blue gradient "⚡ Anjaninex" tab → opens admin portal

---

## [1.5.0] — 2026-05-27

### 🤖 AI Bill Scan — Gemini-Powered Invoice OCR

#### Added
- **Database:** 2 tables in `ai` schema (`extraction_logs` for audit, `cache` for 24hr dedupe)
- **Backend:** `BillExtractorService` with full Gemini 2.5 Flash integration
- **Backend:** **Mock mode** — returns realistic Indian GST invoice data when no API key configured (no dev setup friction)
- **Backend:** **Wallet integration** — debits ₹0.15 per scan, refuses when wallet empty
- **Backend:** **SHA-256 image hash cache** — same bill scanned twice = ₹0 cost (24hr TTL)
- **Backend:** `AiController` exposing `/api/ai/extract-bill` endpoint with 10MB upload limit
- **Backend:** GST format validation (15 chars, Indian regex)
- **Backend:** Confidence adjustment based on field completeness
- **Backend:** Audit trail of all extractions in `ai.extraction_logs`
- **Frontend:** **Full-screen Bill Scan Modal** with Camera capture (getUserMedia API) + File upload
- **Frontend:** **Client-side image compression** (max 1200px, 85% quality) — reduces upload size 70%
- **Frontend:** **Live progress** indicator with rotating messages
- **Frontend:** **Confidence-coded result preview** (green >80%, yellow 50-80%, red <50%)
- **Frontend:** Quick summary cards (Supplier, Buyer, Invoice, Total) + full items table
- **Frontend:** **One-click "Use This Data"** — auto-fills Bill Entry form
- **Frontend:** Smart party matching — by GST or name from existing party list
- **Frontend:** "🤖 AI Scan Bill" gradient button on Bill Entry page
- **Frontend:** AI-fill indicator banner on filled forms

#### Configuration
- Mock mode default in dev (no API key needed)
- Production activation: just set `AI:GeminiApiKey` in appsettings
- Cost transparency: shown on every scan ("₹0.15 debited" or "⚡ cached")

#### Cost Economics
- Gemini 2.5 Flash: ~₹0.05 actual cost
- Charged to firm: ₹0.15 (200% markup)
- Anjaninex margin: ₹0.10 per scan
- At 50 bills/day = ₹150/month revenue per firm

---

## [1.4.0] — 2026-05-27

### 🚚 Suppliers Module — Visual Directory + Categories

#### Added
- **Database:** 4 new tables in `suppliers` schema (categories, supplier_profiles, photos, rates)
- **Database seed:** 27 default fabric/textile categories (Saree, Suit, Kurti, Silk, Cotton, Bandhani, Banarasi, etc.) + auto-create supplier profiles from existing is_supplier contacts
- **Backend:** `SupplierService` with full CRUD + photos + rates + category management
- **Backend:** `SuppliersController` + `SupplierCategoriesController` with permission guards
- **Frontend:** **Visual Directory** with 3-column grid of supplier cards (photo, code, categories, ratings, lead time)
- **Frontend:** Category chips for quick filtering (top 8 by supplier count)
- **Frontend:** Search by name/phone/GST with 300ms debounce
- **Frontend:** **Supplier Detail** page with header, stats (reliability/lead time/min order/photos), product photos grid with rates, rates per category table
- **Frontend:** Add/Edit Supplier form with category multi-select, address, GST/PAN, WhatsApp number, business type
- **Frontend:** Categories management page with supplier counts
- **Frontend:** WhatsApp deep link (`wa.me/...`) + tel: links on supplier cards
- **Frontend:** Auto-create Contact + mark `is_supplier=true` flag when adding new supplier

#### Notable
- Contact Hub pattern working — suppliers share `contacts` table with parties (HubSpot-style)
- Categories stored as JSONB array on supplier_profiles for fast multi-category filtering
- Auto-update `last_rate_update` timestamp when photos added

---

## [1.3.0] — 2026-05-27

### 📈 Reports Module — Cross-Module Analytics

#### Added
- **Backend:** `ReportsAggregateService` with 10 aggregation methods pulling from bills, payments, voucher_lines
- **Backend:** `CrossModuleReportsController` exposing 10 REST endpoints
- **Frontend:** **Executive Dashboard** with 4 hero KPI cards + 4 secondary metrics + 30-day sales-vs-receipts bar chart + quick links
- **Frontend:** **Sales Register** — All bills with full GST breakdown, totals footer
- **Frontend:** **Outstanding Bills** — Pending bills sorted by days overdue, color-coded aging
- **Frontend:** **Party-wise Aging** — Outstanding bucketed by 0-30/31-60/61-90/90+ days
- **Frontend:** **Top Customers** — Top 20 by sales with rank medals 🥇🥈🥉, share bars
- **Frontend:** **Top Items** — Best sellers by revenue with HSN + quantities
- **Frontend:** **GST Summary** — Per-rate breakdown for GSTR-1 filing
- **Frontend:** **Payment Mode** — Cash/UPI/Cheque/NEFT breakdown with progress bars

#### Notable
- Executive KPIs computed in real-time from voucher_lines (no caching yet)
- Cash + Bank balances computed from accounting opening balance + voucher movements
- Aging calculation respects per-party credit_days from party_profiles
- All reports respect firm_id RLS — multi-tenant safe

---

## [1.2.0] — 2026-05-27

### 🛒 Trading Module Live + Auto-Posting Magic

#### Added
- **Database:** 8 new tables in `trading` schema (party_profiles, items, orders, bills, bill_lines, payments, payment_allocations, gr, commission)
- **Database seed:** 7 sample items (Design 3030, Karina, Silk, Cotton, etc.) + auto-create party profiles from existing contacts
- **Backend:** 4 services — PartyService, ItemService, BillService, PaymentService
- **Backend:** **AUTO-POSTING**: Bill save → Sales voucher auto-created (Dr Party, Cr Sales, Cr CGST, Cr SGST)
- **Backend:** **AUTO-POSTING**: Payment save → Receipt/Payment voucher auto-created (Dr Bank, Cr Party)
- **Backend:** FY-aware bill numbering per branch (`JPR-BILL-0001`)
- **Backend:** Auto-create Sundry Debtor ledger when new party added
- **Backend:** Auto-update bill status (pending/partial/paid) when payment allocated
- **Backend:** Auto-create CGST/SGST Payable ledgers on first use
- **Frontend:** Party Master with search, full CRUD form, GST/PAN/credit fields
- **Frontend:** Items master with HSN/SAC, unit, default rate, tax rate
- **Frontend:** **Bill Entry** with multi-line items, live GST calc, autofill from item master
- **Frontend:** Bills list with status filter, type filter, totals footer
- **Frontend:** **Payment Receipt** with outstanding bills allocation, payment mode selector
- **Frontend:** Payments list (receipts in green, payments in red)
- **Frontend:** Trading tab in top nav (now active!)
- **Frontend:** Dashboard quick actions: New Bill, Payment Receipt, Party Master, Manual Voucher + report shortcuts

#### Notable
- Cross-module auto-posting is THE key feature that makes this a real ERP
- Trial Balance / P&L / Balance Sheet update instantly when bills/payments saved
- All vouchers tagged with `source_module=trading` + `source_ref_id` for traceability

---

## [1.1.0] — 2026-05-27

### ✨ Accounting Module Live

#### Added
- **Database:** 6 new tables in `accounting` schema (heads, groups, sub_groups, ledgers, vouchers, voucher_lines)
- **Database trigger:** Auto-balance check (Dr total = Cr total per voucher, deferrable)
- **Database seed:** Default chart of accounts (5 heads, 11 groups, 15 sub groups, 8 default ledgers + auto-created party/supplier ledgers)
- **Backend:** 3 services (ChartOfAccountsService, VoucherService, ReportsService)
- **Backend:** 5 controllers (Heads, Groups, SubGroups, Ledgers, Vouchers, Reports)
- **Backend:** Auto voucher numbering per branch + voucher type (e.g., JPR-V-P0001)
- **Backend:** Financial year aware (April 1 - March 31, Indian standard)
- **Frontend:** 8 new pages (Heads, Groups, SubGroups, Ledgers, Voucher Entry, Trial Balance, P&L, Balance Sheet)
- **Frontend:** Tally-style voucher entry with live balance check
- **Frontend:** Real-time current balance computation per ledger
- **Frontend:** Lazy-loaded accounting module with permission guard
- **Frontend:** Quick action buttons on dashboard linking to accounting

---

## Upcoming Versions (per blueprint)

- **1.2.0** — RBAC management UI + Branch/User screens (Week 2 of original plan)
- **1.3.0** — Cmd+K + Right drawer + Notifications (Week 3)
- **1.3.0** — Settings module + Contacts Hub (Week 4)
- **1.4.0** — Accounting module live (Weeks 5-6)
- **1.5.0** — Trading module + Auto-posting (Weeks 7-8)
- **1.6.0** — Reports module (Week 9)
- **1.7.0** — HR module + AI activation phase 1 (Week 10)
- **1.8.0** — Suppliers module + WhatsApp + AI phase 2 (Week 11)
- **1.9.0** — Anjaninex Admin Portal (Week 12)
- **2.0.0** — Production launch

---

*Powered by Anjaninex*
