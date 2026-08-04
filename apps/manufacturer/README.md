# Anjaninex — Manufacturer App

Vyapaar Setu ka doosra app. Agency app (`apps/web`) se **alag** hai —
alag URL, alag build, alag APK, alag sidebar. Peeche API aur DB ek hi hai.

---

## Pehli baar chalane ke liye — 5 kadam

### 1. Database chalu karo

```bash
docker compose up -d postgres redis
```

### 2. Migration chalao (115 se 119)

Ye `mfg` schema, 84 permission aur 6 role banati hain.

```bash
for n in 115 116 117 118 119; do
  docker compose exec -T postgres psql -U namokara -d namokara -v ON_ERROR_STOP=1 \
    -f "/docker-entrypoint-initdb.d/$(ls db/init | grep "^$n-")"
done
```

Nahi chale to seedha:

```bash
docker compose exec -T postgres psql -U namokara -d namokara -v ON_ERROR_STOP=1 < db/init/115-rls-guard.sql
```

…aur isi tarah 116, 117, 118, 119.

**Dekhna kya hai** — aakhir me ye chhapna chahiye:

```
Manufacturer permission: 84 (84 hone chahiye)
  Malik → 84 ijazat
  Manager → 38 ijazat
  ...
```

### 3. API chalao

```bash
cd apps/api && dotnet run
```

### 4. Manufacturer firm banao

Agency app (`http://localhost:4200`) me **Super Admin** se login karo:

```
anjaninex / Demo@123
```

Phir **Firms → 🏢 Naya Firm + Admin**, aur usme:

| Khaana | Kya bharna |
|---|---|
| Firm Name | jaise `Aarohi Creation` |
| **Kaam kya karti hai** | 🏭 **Manufacturer / Supplier** |
| Admin Username | jaise `aarohi` |
| Admin Password | jo rakhna ho |

Firm banate hi uske owner ko **saari permission** mil jaati hain —
84 manufacturer wali bhi.

### 5. Manufacturer app chalao

```bash
cd apps/manufacturer && npm start
```

Kholo **http://localhost:4300** aur ussi id/password se andar aao jo
kadam 4 me banayi thi.

---

## Purani firm ka malik andar nahi aa pa raha?

Uska `firm_owner` role tab bana tha jab ye 84 permission thi hi nahi.
Migration **119** unhe khud jod deti hai — bas wo chali honi chahiye.
Check karne ke liye:

```sql
SELECT count(*) FROM core.role_permissions rp
  JOIN core.permissions p ON p.id = rp.permission_id
  JOIN core.roles r ON r.id = rp.role_id
 WHERE r.code = 'firm_owner'
   AND p.module IN ('sales','purchase','production','stock','masters','reports');
```

0 aaye to 119 dobara chalao — **superuser (postgres)** se, warna RLS rok degi.

---

## Kya kis port par

| App | Port | Kiske liye |
|---|---|---|
| Agency (`apps/web`) | 4200 | trading firm, distributor |
| **Manufacturer** | **4300** | maal banane wale |
| API | 5000 | dono ke liye ek |

Dono app ek saath chal sakte hain.

---

## Abhi kya bana hai

✅ Login (remember-me + kai firm ho to firm chunna)
✅ Shell + sidebar — 6 group, permission ke hisab se
✅ **Karigars** — list, naya, badlo, band karo
✅ No-access screen — kaunsi ijazat chahiye wo batati hai

Baaki screen sidebar me **"aage"** likhi dikhti hain.
