# Load Test — 500 concurrent users (k6)

500 users ek saath app use karein to kya hoga? Ye test login + real read/write
endpoints par 500 virtual users daalkar **response time, error rate, throughput**
aur **server ke breaking-point** dikhata hai.

> ⚠️ **Production (trade.anjaninex.com) par reads+writes MAT chalao.** Ek hi VPS hai
> — live users slow/crash ho sakte hain aur junk data banega. Niche bataye tarike se
> ek **alag TEST instance** (alag DB + API doosre port par) bana ke wahan chalao.

---

## 1. Test instance banao (production safe rakhne ke liye)

VPS par, production se **alag** ek test DB + test API:

```bash
# (a) Test database (production 'namokara' ka structure copy — fresh schema)
sudo -u postgres psql -c "CREATE DATABASE namokara_loadtest OWNER namokara_app;"
# saare init migrations test DB me daalo (db/init/*.sql kram se):
for f in /var/www/anjaninex/db/init/*.sql; do
  echo "== $f"; sudo -u postgres psql -d namokara_loadtest -f "$f";
done
# (Note: ek seed firm + ek login user chahiye hoga — production se ek firm/user
#  ka data copy karo ya app se signup/seed script chalao. Bina user ke login fail hoga.)

# (b) Test API doosre port (5099) par, test DB ko point karta hua:
cd /var/www/anjaninex/apps/api
ConnectionStrings__Default="Host=localhost;Database=namokara_loadtest;Username=namokara_app;Password=<DB_PASS>" \
ASPNETCORE_URLS="http://127.0.0.1:5099" \
dotnet /var/www/anjaninex/api-out/Namokara.Api.dll
# (ye terminal me chalta rahega — doosre terminal/tab me k6 chalao)
```

Sirf ek quick **read-only** reality-check chahiye (writes nahi) to test instance
skip karke production par `-e WRITE=0` se chala sakte ho (data safe rahega), par
phir bhi live load aayega — off-hours me karo.

---

## 2. k6 install

VPS (Ubuntu):
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6 -y
```
(PC par: `winget install k6` ya https://k6.io/docs/get-started/installation/)

---

## 3. Branch ID nikaalo (X-Branch-Id ke liye)

```bash
sudo -u postgres psql -d namokara_loadtest -c \
"SELECT id, name FROM core.branches LIMIT 5;"
```
Ek branch ka `id` (guid) copy karo.

---

## 4. Test chalao

```bash
cd /var/www/anjaninex/loadtest
k6 run -e BASE_URL=http://127.0.0.1:5099 \
       -e USER=<login-username> -e PASS=<password> \
       -e BRANCH_ID=<branch-guid> \
       -e PEAK=500 \
       k6-loadtest.js
```
- Sirf reads (production-safe): `-e WRITE=0`
- Chhota trial pehle: `-e PEAK=50` (sab theek to 500 pe jao)

Test ~9 min chalega (ramp 0→500, hold, ramp down).

---

## 5. Result kaise padhein

k6 ke output me dekho:

| Metric | Kya matlab | Achha |
|---|---|---|
| `http_req_duration p(95)` | 95% requests itne ms me complete | < 1500 ms |
| `http_req_failed` | fail % | < 2% |
| `http_reqs` (per sec) | throughput (req/s) | jitna zyada utna achha |
| `vus` | peak concurrent users | 500 |
| `read_ms` / `write_ms` | reads/writes alag timing | — |

`thresholds` red (✗) ho to wahi limit hai. Green (✓) = us load tak theek.

---

## 6. Likely bottlenecks + tuning (jab fail ho)

500 users par aksar yahan atakta hai:

1. **Postgres connections** — default `max_connections=100`. 500 users → pool exhaust.
   - `postgresql.conf`: `max_connections = 300` (RAM allow kare to), restart.
   - Connection string me `Maximum Pool Size=100` set (Npgsql default 100 hai).
   - Behtar: **PgBouncer** (transaction pooling) laga do — sabse bada fayda.
2. **VPS CPU / RAM** — `htop` se dekho. Single small VPS 500 concurrent ke liye chhota
   pad sakta hai. CPU 100% → vertical scale (zyada cores) ya horizontal (2 API + nginx LB).
3. **Rate limiter** — app me per-IP/firm rate limit ho to load test 429 dega. Test ke
   liye temporarily relax karo (sirf test env me).
4. **Kestrel / thread pool** — usually theek; logs me errors dekho:
   `sudo journalctl -u anjaninex-api -n 200 --no-pager`
5. **Slow queries** — bills/orders/ledgers par index. `EXPLAIN ANALYZE` se slow query
   pakdo; `firm_id`, `bill_date` par index zaroori.

---

## 7. Test data cleanup (writes ke baad)

Sab test parties prefix `LOADTEST_` se bante hain. Test DB use kiya to poori DB drop
kar do; agar production par (WRITE) galti se chala to:

```bash
# Pehle gin lo kitne bane:
sudo -u postgres psql -d namokara -c \
"SELECT count(*) FROM core.contacts WHERE display_name LIKE 'LOADTEST\_%';"
# (Cleanup soch-samajh ke — party_profiles + ledgers + contacts cascade dhyan se.
#  Production par galti se bane to mujhe batao, safe cleanup script de dunga.)
```

---

## Note — 500 ALAG real users chahiye (advanced)

Upar wala test ek user ka token share karke **server throughput** test karta hai
(load ke liye kaafi). Agar RLS/contention ke saath 500 **alag** users chahiye, to ek
test-users pool (CSV) banao aur har VU apna user login kare —
[k6 SharedArray + CSV docs](https://k6.io/docs/examples/data-parameterization/).
Bolo to wo version bhi bana dunga.
