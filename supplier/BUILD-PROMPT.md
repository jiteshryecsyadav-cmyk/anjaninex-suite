# Vyapaar Setu — Manufacturer App + Trade Chain · Build Prompt

> Claude Code ke liye. Isme wo sab hai jo prototype
> (`supplier/prototype/supplier-app.html`) me ban chuka hai, aur wo dhaancha
> jo Vyapaar Setu me pehle se chal raha hai.
>
> **Niyam:** naya kuch mat gadho. Jo tareeka agency app me chal raha hai,
> wahi yahan bhi. Alag sirf wahan jahan kaam sach me alag hai.

---

## 1. Asli maqsad — poora chain, ek minute me

Aaj ek maal ka bill chaar haathon se guzarta hai, aur **har haath par dobara
likha jata hai**:

```
Manufacturer bill banata hai → WhatsApp photo → Transport ko phone
→ Agency dobara type karti hai → Buyer ko phir se WhatsApp
```

Chaar jagah dobara likhai. Har jagah galti. Milaan ka jhagda.

Jo banana hai:

```
Manufacturer ne bill banaya      ─┐
Transport ne LR + gaadi laga di   ├─  EK hi document,
Agency ne "maal mil gaya" dabaya  │   chaaron ko apni nazar se dikhta hai
Buyer ne apna hissa dekh liya    ─┘
```

**Ek document, chaar nazar — copy nahi.** Koi dobara nahi likhta.

| Kaun | Kya dikhta hai | Kya dabata hai |
|---|---|---|
| **Manufacturer** | apni bikri, kitna paisa aana hai | bill banaya · maal bheja |
| **Transport** | kitne bundle, kahan se kahan | uthaya · pahunchaya (LR, gaadi) |
| **Agency** | apni khareed, kitna dena hai | maal mila · ginti sahi/kam |
| **Buyer** | apna order, kab aayega | mil gaya |

> ⚠️ **Transport ko rate KABHI nahi dikhega.** Usko sirf ginti, pata aur
> gaadi ki jankari. Bill ki rakam nahi. Ye kanoon nahi, vyapaar ki baat hai.

---

## 2. Chaar app, ek engine

```
apps/api/            ← EK API, chaaron ke liye
apps/web/            ← Agency        (jaisa abhi hai)
apps/manufacturer/   ← Manufacturer  (NAYA)
apps/transport/      ← Transport     (NAYA — chhota)
apps/buyer/          ← Buyer         (NAYA — chhota)
```

Har app **alag** hai: alag URL, alag build, alag PWA/APK, alag sidebar,
alag daam. User ko kabhi pata nahi chalega ki peeche ek hi engine hai.

### Ek DB kyun — do wajah

**1. Chain.** "Ek minute me hand-to-hand" tabhi hoga jab document **ek** ho.
Alag DB me har haath par copy banegi, har copy ka apna sach, aur wahi
milaan ka jhagda jo aaj WhatsApp par hai.

**2. Credil.** `db/init/70-credil.sql` me saaf likha hai — *"network dataset,
platform-managed"*, isiliye uspar RLS jaan-boojh kar nahi lagayi. Score GST
par bandha hai, firm par nahi. Aur `credil.refresh_scores()` ek **SQL function**
hai jo `trading.bills`, `trading.goods_returns`, `core.contacts` par seedha
JOIN maarti hai. **Postgres me ek DB se doosri par JOIN nahi lagta** — alag DB
me manufacturer Credil me dikhega hi nahi. Aur wahi aadha network sabse kaam ka
hai: agency mill ko kaise paisa deti hai, manufacturer agency se kaise uthata hai.

### Ek DB ka khatra — aur ilaaj

| Khatra | Ilaaj |
|---|---|
| **RLS policy likhna bhool gaye → data leak.** `hr.location_trails` par ye ho chuka hai | Har migration ke aakhir me **guard query** — bina policy wali table mile to migration wahin rok do (neeche §5.1) |
| Ek DB baithi to sab baitha | Aaj bhi aisa hi hai — 11 module ek hi DB par |
| Bhaari report se doosra app dheema | pgbouncer pool alag + `statement_timeout` |
| Ek galat migration dono ko lagti hai | Har migration idempotent, aur dev par pehle |

**Kab alag karna padega:** DB 500 GB paar kare · manufacturer ke entry se
agency dheemi pade · koi bada client likhkar maange. Tab `mfg` schema alag
nikalna mumkin hai — isiliye aaj se hi alag schema me rakh rahe hain.

---

## 3. Stack — bilkul wahi

| Layer | Tech |
|---|---|
| Frontend | Angular 19 standalone + signals, Tailwind 3.4, PWA, TypeScript 5.5 |
| Backend | .NET 8 modular monolith, EF Core 8, SignalR, Serilog |
| Database | PostgreSQL 16 + Row-Level Security, pgbouncer |
| Cache | Redis (prod) / in-memory (dev) |
| Storage | MinIO (S3-compatible) |
| AI | Gemini 2.5 Flash (bill scan), Sarvam AI (Hindi TTS) |
| Deploy | Hostinger VPS — systemd + nginx (`deploy-kit/`) |

Namespace `Namokara.Api.*` hi rahega — rename mat karna.

---

## 4. Folder

```
apps/api/
  Common/                    auth attributes, middleware, FriendlyError, NameCase
  Infrastructure/            AppDbContext, interceptors (tenant + audit), MinIO
  Modules/Manufacturer/      ← NAYA
    Controllers/ Entities/ Services/
  Modules/Trade/             ← NAYA — saanjha document + chain
apps/manufacturer/src/app/
  core/ layout/shell/ modules/<name>/ shared/
apps/transport/  apps/buyer/    ← chhote app, wahi dhaancha
db/init/                     115 se aage
```

> ⚠️ `db/init/` me abhi **114** tak hain aur kai number do baar
> (18, 19, 20, 48-52, 73-77). Naya **115 se aage**.

---

## 5. Paanch niyam — ye tode to app tootega

### 5.1 RLS — tenant isolation DB me hai, code me nahi

```sql
ALTER TABLE mfg.job_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfg.job_slips FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS job_slips_firm_iso ON mfg.job_slips;
CREATE POLICY job_slips_firm_iso ON mfg.job_slips
    USING      (firm_id = core.current_firm_id())
    WITH CHECK (firm_id = core.current_firm_id());
```

Bina policy ke table **sab firms ko dikh jayegi**. `FORCE` isliye ki table ka
maalik bhi bypass na kar sake.

**Har migration ke aakhir me ye guard lagao:**

```sql
DO $$
DECLARE bad TEXT;
BEGIN
  SELECT string_agg(t.schemaname||'.'||t.tablename, ', ')
    INTO bad
    FROM pg_tables t
   WHERE t.schemaname IN ('mfg','trade')
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                     WHERE p.schemaname = t.schemaname
                       AND p.tablename  = t.tablename);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'RLS policy nahi hai in tables par: %', bad;
  END IF;
END $$;
```

Query me `WHERE firm_id = ...` mat likho — DB khud filter karti hai.
`_db.Database.GetDbConnection()` se raw ADO theek hai, par `OpenAsync()`
mat karna — connection pehle se khula hai.

### 5.2 Document number — hamesha `ReserveCounterAsync`

```csharp
var no = await ReserveCounterAsync(firmId, godownId, "JOBSLIP", fyYear);
```

`MAX(number) + 1` **kabhi mat likhna** — do aadmi ek saath banayenge to
duplicate ban jayega.

**Chain me:** manufacturer ka `INV-123` agency me `PUR-441` banega. Dono
taraf apna counter. Saamne wale ka number sirf **dikhane** ke liye —
usse apna number kabhi mat banao.

### 5.3 Error Hinglish me

`FriendlyError.From(ex)` SQLSTATE aur constraint name padh kar Hinglish
message deta hai. Naya unique constraint jodo to uska message wahan bhi jodo.

> Global handler abhi **har** exception ko HTTP 400 karta hai. Debugging me
> Seq (`http://localhost:5341`) dekhna, status code par mat jaana.

### 5.4 Permission har endpoint par

```csharp
[HasPermission("production.jobslip.create.place")]
```

`module.entity.action.scope` — scope `self` / `place` / `firm` / `platform`.
Frontend par wahi string `requirePermission('...')` route guard me.
Naya permission `db/init/SEED-permissions.sql` me bhi.

### 5.5 Migration raw SQL, idempotent

`db/init/NN-kaam-ka-naam.sql` — `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`.
EF migrations nahi.

---

## 6. 🔗 Saanjha document — chain ka dil

Ye is project ka **sabse naya hissa** hai. Copy nahi banti — ek row, kai
firm ko dikhti hai.

```sql
CREATE SCHEMA IF NOT EXISTS trade;

CREATE TABLE trade.documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_type        TEXT NOT NULL
                    CHECK (doc_type IN ('order','challan','invoice','return')),

    -- Bhejne wala (hamesha platform par)
    from_firm_id    UUID NOT NULL REFERENCES platform.firms(id),
    from_doc_no     TEXT NOT NULL,

    -- Paane wala: platform par hai to firm, warna sirf party record
    to_firm_id      UUID REFERENCES platform.firms(id),
    to_party_id     UUID,
    to_doc_no       TEXT,              -- uske yahan ka apna number

    -- Dhone wala
    transporter_firm_id UUID REFERENCES platform.firms(id),

    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','picked','in_transit',
                                      'delivered','received','disputed','cancelled')),
    total_qty       NUMERIC(14,3),
    bundles         INT,               -- transport ko yahi chahiye
    total_amount    NUMERIC(14,2),     -- transport ko NAHI dikhega
    doc_date        DATE NOT NULL DEFAULT current_date,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (from_firm_id, doc_type, from_doc_no)
);
```

**RLS — teen taraf se dikhega:**

```sql
CREATE POLICY documents_chain_iso ON trade.documents
    USING (from_firm_id         = core.current_firm_id()
        OR to_firm_id           = core.current_firm_id()
        OR transporter_firm_id  = core.current_firm_id())
    WITH CHECK (from_firm_id    = core.current_firm_id());
```

> `WITH CHECK` sirf `from_firm_id` par — **banane ka haq sirf bhejne wale ka**.
> Paane wala aur transporter sirf padh sakte hain aur apna status daal sakte
> hain (alag endpoint se). Warna koi bhi kisi ke naam se document bana deta.

### Transport ka leg

```sql
CREATE TABLE trade.transport_legs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id   UUID NOT NULL REFERENCES trade.documents(id) ON DELETE CASCADE,
    transporter_firm_id UUID REFERENCES platform.firms(id),
    transporter_name    TEXT,          -- platform par nahi hai to sirf naam
    lr_no         TEXT,
    vehicle_no    TEXT,
    driver_name   TEXT,
    driver_phone  TEXT,
    from_city     TEXT,
    to_city       TEXT,
    bundles       INT,
    picked_at     TIMESTAMPTZ,
    delivered_at  TIMESTAMPTZ,
    freight       NUMERIC(12,2),
    freight_by    TEXT CHECK (freight_by IN ('sender','receiver','paid'))
);
```

### Timeline — jhagda hua to poora rasta saamne

```sql
CREATE TABLE trade.document_events (
    id            BIGSERIAL PRIMARY KEY,
    document_id   UUID NOT NULL REFERENCES trade.documents(id) ON DELETE CASCADE,
    actor_firm_id UUID NOT NULL,
    actor_user_id UUID,
    event         TEXT NOT NULL,   -- created | sent | picked | in_transit
                                   -- | delivered | received | short | damaged
                                   -- | disputed | resolved
    qty           NUMERIC(14,3),   -- 'short' me kitna kam nikla
    note          TEXT,
    photo_url     TEXT,            -- kam/kharab maal ki photo
    happened_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Transport ko rate na dikhe — view se

```sql
CREATE OR REPLACE VIEW trade.v_transport_documents AS
SELECT d.id, d.doc_type, d.from_doc_no, d.status,
       d.total_qty, d.bundles, d.doc_date,
       f.name AS from_name, t.name AS to_name
       -- total_amount jaan-boojh kar NAHI
  FROM trade.documents d
  JOIN platform.firms f ON f.id = d.from_firm_id
  LEFT JOIN platform.firms t ON t.id = d.to_firm_id
 WHERE d.transporter_firm_id = core.current_firm_id();
```

Transport app **sirf isi view** se padhega. Controller me bhi
`[HasPermission("trade.document.view.transport")]`.

### Jodne ka tareeka (connection)

Koi bhi kisi ko document nahi bhej sakta — pehle judna padta hai.

```sql
CREATE TABLE trade.connections (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_firm_id UUID NOT NULL REFERENCES platform.firms(id),
    to_firm_id   UUID NOT NULL REFERENCES platform.firms(id),
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','active','paused','rejected')),
    -- Kya-kya dikhega — supplier apna stock sabko nahi dikhana chahta
    share_catalog BOOLEAN NOT NULL DEFAULT TRUE,
    share_stock   BOOLEAN NOT NULL DEFAULT FALSE,
    share_rate    BOOLEAN NOT NULL DEFAULT TRUE,
    price_list_id UUID,          -- is party ka apna rate
    created_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE (from_firm_id, to_firm_id)
);
```

### Pakke niyam

1. **Aaya hua document seedha pakka nahi hota.** Wo `sent` me dikhta hai;
   paane wala **"maal mila"** dabaye tabhi uske yahan asli purchase document
   bane. Warna koi bhi aapke khate me maal chadha dega.
2. **Ginti kam nikli to `short` event** — photo ke saath. Document band nahi
   hota, `disputed` me jata hai.
3. **Number apna hi.** Dono taraf `ReserveCounterAsync`.
4. **Rate connection ka** (`price_list_id`) — catalogue kabhi "aam rate" mat bhejo.
5. **Stock chhupana default** — `share_stock` chalu kiye bina sirf design dikhega.
6. **SignalR se turant khabar** — polling par mat chhodo. Yahi "1 minute" deta hai.
7. **Transport ko rakam nahi** — sirf `v_transport_documents`.

---

## 7. Manufacturer app ke module

Prototype ke sidebar se — 6 group:

**🧾 Sales & Delivery** — Sales Order · Delivery Challan · Tax Invoice · Sales Return (Credit Note)
**🛒 Purchase & Inwards** — Purchase Order · Purchase Inward · Purchase Return (Debit Note)
**🏭 Manage Production** — Job Slip · Karigar Khata Book · Track Jobslip Lots
**📦 Manage Stock** — Design/Material · Opening Stock · Pack Design · Stock Transfer
**👥 Masters** — Customers · Suppliers · Karigars · Agents · Offices/Godowns · Team · Role & Permission
**📋 Meri list** — har dastavez ki list + print

---

## 8. Database — `mfg` schema

`core`, `platform`, `trading`, `accounting` me jo hai use **dobara mat banao**.

### 8.1 Firm ka type

```sql
ALTER TABLE platform.firms
  ADD COLUMN IF NOT EXISTS firm_type TEXT NOT NULL DEFAULT 'agency';
-- CHECK alag se, warna dobara chalane par girta hai
-- agency | manufacturer | transport | buyer | both
```

### 8.2 Design aur Material — `trading.items` hi badhao

Nayi table **mat** banao. `trading.items` par order/challan/invoice ki har
line tikti hai; parallel table banate to har jagah do rasta rakhna padta.

```sql
ALTER TABLE trading.items
  ADD COLUMN IF NOT EXISTS item_kind      TEXT NOT NULL DEFAULT 'design',
     -- design | material | other
  ADD COLUMN IF NOT EXISTS photo_url      TEXT,
  ADD COLUMN IF NOT EXISTS min_stock_qty  NUMERIC(14,3),  -- apni chetavni
  ADD COLUMN IF NOT EXISTS min_order_qty  NUMERIC(14,3),  -- buyer ki rok
  ADD COLUMN IF NOT EXISTS set_pieces     SMALLINT,
  ADD COLUMN IF NOT EXISTS sample_price   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS sample_source  TEXT;
```

### 8.3 Recipe — hisse ke hisab se

Ek suit ke teen hisse (Top, Bottom, Dupatta) aur teeno ka kapda alag,
majoori alag. Isliye recipe **hisse** par bandhi hai, ek lambi list nahi.

```sql
CREATE TABLE mfg.design_recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL, design_id UUID NOT NULL,
    part TEXT NOT NULL,                       -- Top / Bottom / Dupatta …
    job_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
    rate_unit TEXT NOT NULL DEFAULT 'Pcs',
    UNIQUE (design_id, part)
);
CREATE TABLE mfg.design_recipe_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL,
    recipe_id UUID NOT NULL REFERENCES mfg.design_recipes(id) ON DELETE CASCADE,
    material_id UUID NOT NULL,
    -- EK PIECE me kitna. 156 × 2.25 = 351 mtr. Ye hisab kaagaz par hota tha.
    avg_qty NUMERIC(12,3) NOT NULL CHECK (avg_qty > 0),
    unit TEXT NOT NULL DEFAULT 'Meter'
);
```

### 8.4 Job Slip

`job_slips` · `job_slip_materials` (kya diya) · `job_slip_programs` (kya banana)
· `job_slip_ratios` (S:M:L = 1:1:2 → 160 piece = 40/40/80) ·
`job_slip_program_sizes` · `job_slip_receipts` (kitna wapas aaya, kitna kharab)

**Karigar khata** alag table nahi — `job_slips` + `receipts` +
`accounting.vouchers` se banta hai.

### 8.5 Taka — ek hi table, chaar jagah

Taka challan, job slip, inward aur PO — chaaron me aata hai.

```sql
CREATE TABLE mfg.takas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL,
    owner_type TEXT NOT NULL CHECK (owner_type IN
      ('challan_line','jobslip_material','inward_line','po_material')),
    owner_id UUID NOT NULL,
    seq INT NOT NULL CHECK (seq > 0),
    meters NUMERIC(10,2) NOT NULL CHECK (meters > 0),
    UNIQUE (owner_type, owner_id, seq)
);
```

### 8.6 Stock — hamesha ledger se

Stock ko kabhi ek column me mat rakhna. Ek column rakhte to *"stock 40 dikha
raha hai par godown me 12 hai"* wali haalat aati aur wajah kabhi nahi milti.

```sql
CREATE TABLE mfg.stock_ledger (
    id BIGSERIAL PRIMARY KEY,
    firm_id UUID NOT NULL, godown_id UUID NOT NULL, item_id UUID NOT NULL,
    item_kind TEXT NOT NULL CHECK (item_kind IN ('design','material')),
    colour TEXT, size TEXT,
    qty_in  NUMERIC(14,3) NOT NULL DEFAULT 0,
    qty_out NUMERIC(14,3) NOT NULL DEFAULT 0,
    ref_type TEXT NOT NULL, ref_id UUID NOT NULL,
    happened_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE VIEW mfg.v_stock_on_hand AS
SELECT firm_id, godown_id, item_id, item_kind, colour, size,
       SUM(qty_in) - SUM(qty_out) AS on_hand
  FROM mfg.stock_ledger GROUP BY 1,2,3,4,5,6;
```

### 8.7 Masters

```sql
mfg.karigars   -- UNIQUE (firm_id, mobile)
               -- Iske bina "Chintan" aur "Chintan Bhai" do aadmi ban jaate
               -- the aur majoori ka khata do jagah bat jata tha
mfg.agents     -- is_karigar_agent BOOLEAN
               -- TRUE = karigar dilwane wala → job slip me dikhe
               -- FALSE = grahak laane wala   → order/challan me dikhe
               -- Mila diye to galat aadmi par commission chadhta tha
mfg.godowns    -- UNIQUE (firm_id, lower(name))
               -- is_main: partial unique index se sirf EK
mfg.design_tags + mfg.item_tags
```

`trading.parties` par jodna: `discount_pct`, `bill_due_days`,
`transport_name`, `transport_detail`, `apply_tcs`, `visibility`,
`udyam_type`, `udyam_no`.

> **Udyam kyun:** MSME supplier ko kanoonan **45 din** me paisa dena hai,
> warna byaj. Form par chetavni isi se dikhegi.

---

## 9. Permission — 84

`module.resource.action.scope`

| Module | Resource |
|---|---|
| `sales` | order · challan · invoice · sreturn |
| `purchase` | po · inward · preturn |
| `production` | jobslip · khata |
| `stock` | design · material · rate |
| `masters` | customer · supplier · karigar · agent · office · team |
| `reports` | sales · stock · outstanding |

Action: `view` · `create` · `edit` · `delete` → 21 × 4 = **84**
Scope: `self` (sirf apna) · `place` (apne godown ka) · `firm` (poori firm)

### System role (`is_system = TRUE`, lock)

| Role | Ijazat | Scope |
|---|---|---|
| Malik | 84 | firm |
| Manager | 38 | place |
| Munim | 25 | firm |
| Salesman | 12 | **self** |
| Godown wala | 9 | place |
| Sirf dekhne wala | 21 (view) | place |

**Naya role hamesha "sirf dekhna" se shuru** — khaali nahi. Ijazat dena
aasaan hai, wapas lena mushkil.

Aadmi ko seedha permission mat do — **role do**.

---

## 10. Frontend

- Standalone components, koi NgModule nahi
- Signals (`signal()`, `computed()`), `@if` / `@for`
- **Inline template** component file ke andar
- Lazy routes: `loadComponent` / `loadChildren`
- Tailwind + `btn-primary`, `input`, `page-top-bar`
- Purple `#5c1a8b` (heading), `#6b3fa0` (halka text)
- **Sab text Hinglish me**

### Pehle se hain — dobara mat banana

`back-button`, `paginator`, `toast.service`, `invoice-preview`, `calculator`,
`party-quick-add`, `transporter-quick-add`, `wa-send`, `in-date.pipe`,
`uppercase.directive`, `amount-in-words.util`, `india-states` /
`india-pincode.service`, `feature.service`, `anji-help`, `upgrade-nudge`,
`wallet-icon`

### Naye shared component (prototype me ban chuke)

`taka-detail` · `colour-picker` · `size-picker` · `design-picker` ·
`note-box` · `ratio-table` · `permission-grid`

---

## 11. Prototype se khaas baatein

**Sales Order** — party chunte hi shartein aayein (`10% chhoot · 45 din
udhaar · transport: Gati · bakaya ₹1,24,500`), transport khud bhare · maal se
zyada order par card **laal** · print ke **teen format** (photo · table · size-matrix)

**Delivery Challan** — bina order ke bhi ("Without Order") · bale number
switch · har item ke upar kis order ka hai

**Job Slip** — ratio se batwara (160, 1:1:2 → 40/40/80) · AVG se material
(156 × 2.25 = 351 mtr) · **part chunte hi recipe khud bhare**

**Design + Recipe** — hisse ke hisab se · **ek piece ki lagat** aur bachat ·
lagat zyada to laal

**Purchase Inward** — `0/450` · baki se zyada aaye to laal · challan ki photo

---

## 12. Kaam ka kram

| Phase | Kya | Kyun |
|---|---|---|
| **1** | `firm_type`, `mfg` schema, Masters (7), permission seed | Inke bina koi document nahi banta |
| **2** | Design + Material + Recipe + stock ledger | Order/job slip inhi par tikte hain |
| **3** | Sales Order → Challan → Invoice + print | Paisa isi se aata hai |
| **4** | PO → Inward → Purchase Return | Kachcha maal |
| **5** | Job Slip + Karigar khata + lot tracking | Manufacturer ka asli kaam |
| **6** | **`trade` schema — saanjha document + timeline** | Chain ka dil |
| **7** | Transport app + Buyer app | Chain poora |
| **8** | Reports, Opening Stock, Pack Design, Stock Transfer | Baaki |

Har phase ke baad: **RLS guard query**, permission seed, aur FriendlyError me
naye constraint ka message.

---

## 13. Dhyan rakhne wali baatein

- `appsettings.json` me sirf `${ENV_VAR}` — asli secret `NAMOKARA_` env var se.
  **Kabhi asli key commit mat karna**
- Rate limit: logged-in 1200/min (per-user, per-IP nahi — ek office = ek NAT IP),
  anonymous 600/min per IP, `/api/auth` 20/min, `/api/ai` 30/min per firm
- `EnableRetryOnFailure()` jaan-boojh kar hataya gaya — manual transaction se
  conflict karta tha. **Dobara mat lagana**
- README.md purana hai ("Week 1") — code dekhna
- Deploy: **pehle commit, phir `npm run build`** (prebuild `gen-version.js`;
  seedha `npx ng build` version stamp chhod deta hai)
- **`rsync --delete` prod par kabhi mat chalana** — ek baar config aur uploads
  wipe ho chuke hain

---

## 14. Commit message

Hinglish, **user ki dikkat ke hisab se** — technical change ka naam nahi.
`<Screen/Feature>: <kya galat tha / ab kya hota hai>`

```
Job slip: part chunte hi recipe nahi bharti thi — har baar material haath se likhna padta tha
Karigar master par mobile ki rok — "Chintan" aur "Chintan Bhai" do khate ban jate the
Chain: maal mila dabaye bina bhi khate me chadh jata tha — ab paane wale ki manzoori zaroori
```
