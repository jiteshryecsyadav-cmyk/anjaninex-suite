# Anjaninex Suite — Hostinger VPS Deploy Guide

**Stack:** Angular 19 (static) + .NET 8 API (Kestrel) + PostgreSQL + nginx + Let's Encrypt SSL
**Config:** Domain + HTTPS · Sirf main app (bot baad me) · Fresh DB (demo data nahi)

> Placeholders badal lena:
> - `yourdomain.com` → aapka domain
> - `VPS_IP` → Hostinger VPS ka IP
> - `STRONG_DB_PASS` → ek naya strong DB password (dev wala mat use karna)
> - `STRONG_JWT_SECRET` → 32+ char random string

---

## 0. Domain DNS (pehle kar lo, propagate hone me time lagta hai)
Apne domain provider me 2 A-records banao:
```
A   @     VPS_IP
A   www   VPS_IP
```
(Agar domain Hostinger pe hi hai to hPanel → DNS Zone me.)

---

## 1. VPS me login + base setup
```bash
ssh root@VPS_IP

apt update && apt upgrade -y
apt install -y nginx postgresql postgresql-contrib ufw git curl

# Firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

---

## 2. .NET 8 runtime install (API ke liye)
```bash
# Microsoft repo
wget https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O /tmp/ms.deb
dpkg -i /tmp/ms.deb
apt update
# Sirf runtime chahiye (build local/CI pe karenge). Agar server pe hi build karna ho to aspnetcore-sdk-8.0 install karo.
apt install -y aspnetcore-runtime-8.0
dotnet --info   # verify
```

---

## 3. PostgreSQL — DB + app user (NON-superuser, RLS ke liye zaroori)
```bash
sudo -u postgres psql
```
psql ke andar:
```sql
CREATE DATABASE namokara;
CREATE USER namokara_app WITH PASSWORD 'STRONG_DB_PASS';
GRANT ALL PRIVILEGES ON DATABASE namokara TO namokara_app;
\c namokara
GRANT ALL ON SCHEMA public TO namokara_app;
ALTER DATABASE namokara OWNER TO namokara_app;
\q
```
> ⚠️ App ko **namokara_app** se connect karna — `postgres` (superuser) se NAHI, warna Row-Level Security bypass ho jata hai (cross-firm data leak).

---

## 4. Code VPS pe laao
Do tarike — koi ek:

**(a) Git se (recommended):**
```bash
mkdir -p /var/www && cd /var/www
git clone <YOUR_REPO_URL> anjaninex
cd anjaninex
```

**(b) Local se upload (agar git nahi):** local machine pe:
```bash
# Windows PowerShell — scp se folder bhejo (node_modules/bin/obj chhod do)
scp -r "G:\Indian B2B SaaS platform" root@VPS_IP:/var/www/anjaninex
```

Aage `/var/www/anjaninex` ko project root maan ke chalenge.

---

## 5. Database migrations chalao (fresh, demo ke bina)
Numbered init files **order me** chalao. Demo/cleanup/reset wali files SKIP karo.
```bash
cd /var/www/anjaninex/db/init
export PGPASSWORD='STRONG_DB_PASS'

# Saari NUMBERED migrations (01..39) order me + SEED-permissions, skip demo/cleanup/reset
for f in $(ls [0-9]*.sql | sort -V); do
  echo "==> $f"
  psql -h localhost -U namokara_app -d namokara -f "$f" || { echo "FAILED: $f"; break; }
done

# Permissions seed (zaroori — login/roles ke liye)
psql -h localhost -U namokara_app -d namokara -f SEED-permissions.sql
```
> NA chalाo: `99-demo-data.sql`, `DEMO-*.sql`, `CLEANUP-*.sql`, `RESET-*.sql`, `RUN-*.sql`, `IMPORT-*.sql`, `UPDATE-*.sql` (ye demo/dev ke liye hain).
>
> Super-admin login: project ke seed me jo super_admin hai (e.g. `anjaninex` / `Demo@123`) — **pehli login ke baad password turant change karo**.

---

## 6. Backend (.NET API) build + deploy

### Build (server pe SDK hai to yahin, warna local pe publish karke upload)
```bash
cd /var/www/anjaninex/apps/api
dotnet publish -c Release -o /var/www/anjaninex/api-out
```

### Production config — `appsettings.Production.json`
`/var/www/anjaninex/api-out/appsettings.Production.json` banao (apne existing `appsettings.json`/Development ke key naam se match karke):
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=namokara;Username=namokara_app;Password=STRONG_DB_PASS"
  },
  "Jwt": { "Secret": "STRONG_JWT_SECRET" }
}
```
> Connection string ka key naam wahi rakho jo aapke `appsettings.Development.json` me hai. JWT key bhi wahi structure.

### systemd service (auto-start + restart)
```bash
nano /etc/systemd/system/anjaninex-api.service
```
```ini
[Unit]
Description=Anjaninex .NET API
After=network.target postgresql.service

[Service]
WorkingDirectory=/var/www/anjaninex/api-out
ExecStart=/usr/bin/dotnet /var/www/anjaninex/api-out/Namokara.Api.dll
Restart=always
RestartSec=5
User=www-data
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://127.0.0.1:5000

[Install]
WantedBy=multi-user.target
```
> `Namokara.Api.dll` — agar dll ka naam alag ho to `ls /var/www/anjaninex/api-out/*.dll` se check karo.
```bash
chown -R www-data:www-data /var/www/anjaninex
systemctl daemon-reload
systemctl enable --now anjaninex-api
systemctl status anjaninex-api   # green/running hona chahiye
curl http://127.0.0.1:5000/api/version   # ya koi health endpoint
```

---

## 7. Frontend (Angular) build

### Production API URL set karo
`apps/web/src/environments/environment.prod.ts` me:
```ts
export const environment = {
  production: true,
  apiUrl: 'https://yourdomain.com',   // nginx isi domain pe /api proxy karega
  // ...baaki keys jaise hain
};
```

### Build (Node chahiye — server pe ya local pe build karke dist upload)
Local/CI pe build behtar hai (server RAM bachega):
```bash
cd apps/web
npm ci
npx ng build --configuration production
ls dist/        # output folder ka naam dekho (e.g. dist/web/browser)
```
`dist/<name>/browser/*` files ko VPS pe rakho:
```bash
mkdir -p /var/www/anjaninex-web
# local se:
scp -r dist/web/browser/* root@VPS_IP:/var/www/anjaninex-web/
```

---

## 8. nginx — Angular serve + /api reverse proxy
```bash
nano /etc/nginx/sites-available/anjaninex
```
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    root /var/www/anjaninex-web;
    index index.html;

    # API → .NET (Kestrel 5000)
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 25m;   # bill-scan / photo upload ke liye
    }

    # uploads (agar API static uploads serve karti hai to ye bhi /api me hi jata hai)

    # Angular SPA routing — sab kuch index.html pe
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
```bash
ln -s /etc/nginx/sites-available/anjaninex /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```
Ab `http://yourdomain.com` chalna chahiye.

---

## 9. SSL / HTTPS (free, Let's Encrypt)
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
# email + agree, "redirect HTTP→HTTPS" → Yes
```
Auto-renew already setup hota hai. Test:
```bash
certbot renew --dry-run
```
Ab `https://yourdomain.com` 🔒 chalega.

---

## 10. Final checks
- [ ] `https://yourdomain.com` khulta hai, login page aata hai
- [ ] Super-admin login → password turant change
- [ ] Ek firm bana ke firm-admin se login → trading/bill/order test
- [ ] `systemctl status anjaninex-api` running
- [ ] DB `namokara_app` se connect ho raha (postgres superuser nahi)

---

## 11. Update kaise karenge (future)
```bash
cd /var/www/anjaninex && git pull              # ya naya code upload
# Backend:
cd apps/api && dotnet publish -c Release -o /var/www/anjaninex/api-out
systemctl restart anjaninex-api
# Frontend: local pe ng build → dist upload → done (nginx static, restart ki zaroorat nahi)
# Nayi DB migration aaye to: psql -U namokara_app -d namokara -f db/init/<new>.sql
```

---

## ⚠️ Production se pehle (security)
1. **`postgres` superuser se app connect mat karo** — sirf `namokara_app` (RLS ke liye).
2. Super-admin + demo passwords **change** karo.
3. JWT secret strong + secret rakho (config file permissions 600).
4. Pending audit fixes (RLS gaps wagairah) confirm kar lo — pehle bataye the.
5. Regular DB backup: `pg_dump -U namokara_app namokara > backup_$(date +%F).sql` (cron me daal do).

---
*Koi step pe atko to error ka output bhej dena — exact fix bata dunga.*
