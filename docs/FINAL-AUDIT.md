# FINAL AUDIT REPORT — Anjaninex Suite
**Independent multi-agent code review · 2026-05-27**

Five specialized AI agents reviewed 109 files across security, database, integration logic, frontend, and DevOps. Each agent worked independently — they didn't see each other's findings.

---

## OVERALL VERDICT: 🔴 NOT PRODUCTION-READY

| Dimension | Grade | Critical Issues |
|---|---|---|
| 🔒 Security | **D** | 11 critical · RLS structurally bypassed, no rate limiting, localStorage tokens, path traversal |
| 🗄️ Database | **C+** | 16 critical · Missing FKs, GST fields incomplete, WITH CHECK missing on RLS, CASCADE bombs |
| 🔄 Integration | **D** | 11 critical · GST split wrong, purchase posts as sales, payroll JV unbalanced, wallet race |
| 🎨 Frontend UX | **C+** | 8 critical · Mobile shell broken, no a11y on modals, debug card leaks JWT, alert() everywhere |
| 🚀 DevOps | **D** | 12 critical · Zero production artifacts (no Dockerfile, nginx, CI, TLS, backup) |

**Aggregate: D+** — Local prototype is impressive. Production deployment would cause **data breaches, accounting errors, and outages within weeks**.

---

## 🔴 P0 — MUST FIX BEFORE ANY PILOT CUSTOMER (Week 1)

### Money & Accounting (will lose customer data immediately)

1. **Purchase bills post as SALES vouchers** — `BillService.cs:237` unconditionally calls `PostSalesVoucherForBill`. Every purchase becomes inverted bookkeeping. Customers' creditors will be ₹0 forever.
   - **Fix:** Branch on `bill.BillType`, write `PostPurchaseVoucherForBill` with Dr Purchase / Dr CGST input / Dr SGST input / Cr Party.

2. **GST split is structurally wrong** — `BillService.cs:177` always splits 50/50 into CGST+SGST regardless of inter-state. Jaipur→Delhi bills will be rejected by GSTR-1.
   - **Fix:** Compare `branch.state` vs `party.state`; route to IGST when different.

3. **Voucher number race condition** — `count + 1` pattern in BillService/PaymentService/VoucherService/PayrollService. Concurrent saves get duplicate numbers, rely on unique index throwing errors.
   - **Fix:** Per-(firm,branch,type,fy) PostgreSQL SEQUENCE or `voucher_counters` row with `UPDATE ... RETURNING`.

4. **Payroll voucher silently unbalanced** — `PayrollService.cs:251-264` masks missing ledgers (TDS, PT, advance, employer PF/ESI) by reducing salary expense. P&L understates salaries, statutory liabilities never booked.
   - **Fix:** Build ALL liability lines first, derive Cr Bank as plug.

5. **AI wallet race + free scans** — `BillExtractorService.cs:169` checks balance before Gemini call but debits after. Gemini errors → mock fallback → ₹0 cost. Unlimited free scans possible.
   - **Fix:** Debit FIRST inside `SELECT ... FOR UPDATE` transaction; refund only on confirmed network failure with idempotency key.

### Multi-Tenant Isolation (will leak customer data)

6. **RLS is structurally bypassed in production path** — App connects as `namokara` (owner role) which bypasses RLS. RLS policies exist but do nothing. Any LINQ query without explicit `firm_id` filter returns cross-tenant rows.
   - **Fix:** Connect as `namokara_app`; `ALTER TABLE ... FORCE ROW LEVEL SECURITY` on every table.

7. **Tenant context evaporates with PgBouncer transaction pool** — `TenantContextMiddleware.cs:33` uses `set_config(..., true)` (local to transaction). EF opens/closes connections per query. `app.current_firm_id` is gone before the business query runs.
   - **Fix:** Use DbContext interceptor to set GUCs in same transaction; OR switch PgBouncer to session pooling for tenant-aware connections.

8. **RLS policies missing `WITH CHECK`** — Every policy uses `USING` only. Tenants can READ only their rows but can INSERT rows with ANY firm_id. Cross-tenant data corruption trivially possible.
   - **Fix:** Add `WITH CHECK (firm_id = current_firm_id())` to every policy.

9. **Critical tables have NO RLS** — `core.sessions` (contains refresh_token_hash!), `core.user_roles`, `platform.wallet_ledger`, `accounting.voucher_lines`, `ai.cache`, all `audit.*` — none enforce tenant isolation.
   - **Fix:** Enable RLS + policies on every `firm_id`-bearing table; use join-based policy for `voucher_lines`.

10. **AI cache leaks across tenants** — `ai.cache` PK is `(cache_key)` globally. Two firms scanning same invoice get each other's extracted data.
    - **Fix:** PK = `(firm_id, cache_key)`.

### Auth (will allow account takeover)

11. **No rate limiting anywhere** — `/api/auth/login`, `/api/auth/refresh`, `/api/ai/extract-bill` all unlimited. Credential stuffing + wallet drain trivial.
    - **Fix:** `AddRateLimiter` with fixed-window per IP+identifier; lockout after 5 failed logins.

12. **JWT key default + no algorithm whitelist** — `appsettings.json` ships placeholder secret. No `ValidAlgorithms = new[]{"HS256"}` whitelist. Algorithm confusion attack possible.
    - **Fix:** Require env var; fail startup if key < 64 bytes or matches dev pattern; whitelist HS256.

13. **Tokens in localStorage** — `auth.service.ts:90-92`. Any XSS = full account takeover with refresh token persistence.
    - **Fix:** Access token in memory, refresh in `HttpOnly; Secure; SameSite=Strict` cookie.

14. **Path traversal in MinIO** — `StorageService.cs:60` uses `file.FileName` directly. Filename `../../bills/secret.pdf` overwrites other tenants' files.
    - **Fix:** `Path.GetFileName(...)` + regex sanitize.

15. **MinIO bucket made world-readable** — `docker-compose.yml:114` `mc anonymous set download local/namokara-photos`. Selfies + bill photos enumerable by anyone.
    - **Fix:** Private buckets; presigned URLs only.

---

## 🟡 P1 — MUST FIX BEFORE GENERAL AVAILABILITY (Week 2-3)

### DevOps (currently impossible to deploy safely)

16. **Zero production artifacts** — No Dockerfile for API/Web. No prod compose. No nginx config. No CI workflow. No backup script. No install script. No TLS plan.
    - **Fix:** 3 days focused work — Dockerfiles + `docker-compose.prod.yml` + nginx+certbot + GitHub Actions CI + cron `pg_dump` to Backblaze + fail2ban/ufw install script.

17. **No DB migration strategy** — `db/init/*` only runs on first Postgres start. Schema changes after first deploy will fail silently.
    - **Fix:** EF migrations bundle, runs as init container, fails deploy on error.

18. **Containers run as root** — No `USER` directive anywhere.
    - **Fix:** `USER 1000:1000` in Dockerfiles; `cap_drop: [ALL]`; `read_only: true`.

### Database Integrity

19. **Missing FKs on `firm_id`** in `accounting.vouchers`, `trading.orders`, `trading.bills`, `trading.payments`, `trading.gr`, `trading.commission`, `suppliers.photos`, `suppliers.rates`, `ai.cache`, all `hr.*` tables.
    - **Fix:** `REFERENCES platform.firms(id) ON DELETE RESTRICT` (do NOT cascade — see #21).

20. **CASCADE delete bombs** — Deleting a firm wipes 8 years of legally-required books.
    - **Fix:** Change all `firm_id` CASCADE → RESTRICT; soft-delete firms.

21. **Missing GST/e-invoice fields** — No `place_of_supply`, `reverse_charge`, `e_invoice_irn`, `e_invoice_qr`, `e_way_bill_no`, `cgst_amount`/`sgst_amount`/`igst_amount` per line.
    - **Fix:** Add columns now (B2B >₹5cr turnover = e-invoice mandatory by law).

22. **FY-blind bill/voucher uniqueness** — `bill_no` repeats across financial years. GST law requires per-FY uniqueness.
    - **Fix:** Add `fy_year` generated column, include in unique index.

23. **No GSTIN/PAN/HSN format CHECK constraints** — Typos in production data; useless GSTR-1 exports.
    - **Fix:** CHECK with regex patterns.

24. **No indexes on most FK columns** — Postgres doesn't auto-index FKs. Lock escalation on delete/update.
    - **Fix:** `CREATE INDEX` on every FK column (20+ missing).

25. **JSONB columns without GIN** — `contacts.phones`, `extraction_logs.output_json`, `salary_structures.components` etc. queried via seq scan.
    - **Fix:** `USING gin (col jsonb_path_ops)` on actually-queried columns.

26. **No partitioning on volume tables** — `vouchers`, `voucher_lines`, `bills`, `bill_lines`, `attendance_logs`, `extraction_logs` will hit 100M+ rows.
    - **Fix:** Partition by date BEFORE launch (impossible to add cleanly later).

### Frontend UX

27. **Shell is desktop-only** — Zero responsive classes. 360px Android = unusable. PWA promise broken.
    - **Fix:** Hamburger drawer for mobile; stack utility buttons.

28. **`alert()` and `confirm()` everywhere** (9 files) — Blocks thread, unbranded, screen reader hostile.
    - **Fix:** Toast service with `aria-live="polite"`.

29. **Bill entry table unusable on mobile** — 10-column table with inputs, no responsive fallback.
    - **Fix:** Stacked card-per-line under `md:` breakpoint.

30. **Modals lack `role="dialog"`, focus trap, Escape handler** — Camera modal + AI scan modal locked out of keyboard/screen reader use.
    - **Fix:** Wrap with Angular CDK `Dialog` + `CdkTrapFocus`.

31. **Subscription leaks everywhere** — Zero `takeUntilDestroyed()` in 25 .subscribe() calls.
    - **Fix:** Pipe every subscription through `takeUntilDestroyed(this.destroyRef)`.

32. **Debug card ships JWT permissions to prod** — `dashboard.component.ts:99-103` leaks RBAC info.
    - **Fix:** Wrap in `@if (!environment.production)`.

33. **`en-IN` locale not registered** — Lakh formatting (`₹1,23,456`) silently fails. Dates wrong.
    - **Fix:** `registerLocaleData(localeIn, 'en-IN')` + `LOCALE_ID: 'en-IN'`.

### Security / Compliance

34. **Aadhaar/PAN/bank IFSC stored plaintext** — Only `aadhaar_hash` and `bank_account_no_hash` hashed. PAN + IFSC visible in DB.
    - **Fix:** AES-GCM encryption with KMS-managed key OR pgcrypto column encryption.

35. **No audit trail on admin actions** — Suspend firm, recharge wallet, change plan — no audit row written.
    - **Fix:** Audit interceptor; write to `audit.audit_log` on every admin endpoint.

36. **Mass assignment via DTOs** — Entity classes accepting `[FromBody]` allow caller to set `firm_id`, `wallet_balance`, etc.
    - **Fix:** Explicit input DTOs (records) with only user-controllable fields.

---

## 🟢 P2 — POST-LAUNCH BACKLOG (Month 2+)

37. Domain events / outbox pattern for cross-module posts (instead of inline writes)
38. UUIDv7 for high-write tables (better page locality)
39. Materialized views for monthly reports
40. `@defer` for heavy chunks (Leaflet, charts)
41. OnPush change detection everywhere
42. Virtual scrolling for large lists
43. CDN for tile/image assets
44. TimescaleDB for `location_trails`
45. Domain-specific tax tables (TDS sections, GSTR staging)
46. i18n with $localize (Hindi/regional language support)
47. Master data sharing (chart of accounts, fabric categories) instead of per-firm copy
48. WebAuthn / passkey support
49. Webhooks for firm-to-firm integrations
50. SOC 2 readiness (logging, secret rotation, access reviews)

---

## RECOMMENDED LAUNCH PLAN

### Phase 0: Stop. Don't deploy yet. (Today)
- This audit identifies real bugs that would cost customer money.
- Do NOT onboard paying customers until P0 items are fixed.

### Phase 1: Critical fixes (Week 1, ~5 dev-days)
- Fix 15 P0 items (money correctness, tenant isolation, auth)
- Add P0 regression tests
- Re-audit after fixes

### Phase 2: Production-ize (Week 2-3, ~10 dev-days)
- DevOps blockers (Dockerfiles + nginx + TLS + backup + CI)
- DB integrity (FKs, GST fields, indexes, partitions)
- Frontend mobile responsive
- Admin audit logging

### Phase 3: Beta launch (Week 4)
- Internal QA + 1-2 friendly pilot firms
- Monitor logs/errors/wallet flows
- Iterate

### Phase 4: GA launch (Week 6-8)
- Public signup
- Cap at 20 firms initially; expand based on stability

---

## REPORTS BY DOMAIN

This file consolidates findings. For full agent reports with file:line evidence and exploitation paths, the individual agents wrote ~1500 words each — those are summarized above. The cleaning sequence and exact diffs are tractable: every finding has a file path and a one-sentence fix. A pair of engineers can clear P0 in a week.

---

## WHAT THE AGENTS PRAISED

Despite the critical issues, the architecture is **well-intentioned and salvageable**:

- ✅ Schema is logically partitioned into 8 schemas with clear ownership
- ✅ RLS is at least attempted (just bypassed in practice)
- ✅ Soft-delete pattern consistent
- ✅ Generated columns for `margin_inr`, leave balances
- ✅ DB-level double-entry trigger with `DEFERRABLE INITIALLY DEFERRED` (correct design)
- ✅ Refresh tokens SHA-256 hashed (not plaintext)
- ✅ Access tokens short-lived (15 min)
- ✅ Granular hierarchical permission system with cache invalidation hooks
- ✅ Mock-mode for AI service (good dev UX)
- ✅ Standalone components + signals + new control flow (modern Angular)
- ✅ Lazy-loaded routes with permission guards
- ✅ Brand identity consistent throughout
- ✅ AI scan modal UX flow well-modelled
- ✅ Selfie compression on client + MediaStream cleanup
- ✅ Health checks split into `/healthz/ready` and `/healthz/live` (k8s conventions)
- ✅ Modular monolith layout = easy to containerize later

**The bones are good. The flesh needs work.**

---

*This report consolidates findings from 5 independent AI agents. Each agent's full report (~1500 words with file:line citations) is available in the conversation transcript. No actual builds were run — Microsoft download domains were firewalled in the sandbox.*
