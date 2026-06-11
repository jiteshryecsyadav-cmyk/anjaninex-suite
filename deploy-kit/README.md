# Anjaninex — Deploy Kit (Hostinger VPS)

**Subdomain:** `trade.anjaninex.com` · Angular (static) + .NET 8 API + PostgreSQL + nginx + SSL · Fresh DB

> Edit karne wale: `STRONG_DB_PASS`, `STRONG_JWT_SECRET`, `VPS_IP`. Subdomain pehle se `trade.anjaninex.com` set hai.

---

## STEP 0 — DNS (sabse pehle)
Anjaninex domain ke DNS me **ek A-record**:
```
A   trade   VPS_IP
```
(www ki zaroorat nahi — subdomain hai.) Propagate hone do (10 min–2 ghante).
Check: `ping trade.anjaninex.com` → VPS_IP aana chahiye.

## STEP 1 — Code VPS pe
```bash
mkdir -p /var/www && cd /var/www
git clone <REPO_URL> anjaninex        # ya local se scp
# deploy-kit bhi VPS pe le aao:
cd /var/www/anjaninex/deploy-kit
chmod +x *.sh
```

## STEP 2 — Server setup
```bash
sudo ./01-server-setup.sh
```

## STEP 3 — Database
```bash
nano 02-db-setup.sh      # DB_PASS set karo
sudo ./02-db-setup.sh
```

## STEP 4 — Migrations (fresh)
```bash
nano 03-run-migrations.sh   # DB_PASS + INIT_DIR
./03-run-migrations.sh
```

## STEP 5 — API config + deploy
```bash
# template bhar ke api-out me rakho:
cp appsettings.Production.template.json /var/www/anjaninex/api-out/appsettings.Production.json
nano /var/www/anjaninex/api-out/appsettings.Production.json   # DB pass + JWT
sudo ./04-api-deploy.sh
```
(SDK server pe nahi to: local pe `dotnet publish -c Release -o api-out` → `api-out/` ko VPS `/var/www/anjaninex/api-out/` me scp → phir 04 chalao.)

## STEP 6 — Frontend (local pe build, recommend)
```bash
cd apps/web
# environment.prod.ts me: apiUrl = 'https://trade.anjaninex.com'
npm ci
npx ng build --configuration production
ls dist/                                   # folder naam dekho
scp -r dist/*/browser/* root@VPS_IP:/var/www/anjaninex-web/
```

## STEP 7 — nginx
```bash
sudo cp nginx-anjaninex.conf /etc/nginx/sites-available/anjaninex
sudo ln -sf /etc/nginx/sites-available/anjaninex /etc/nginx/sites-enabled/anjaninex
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```
Ab `http://trade.anjaninex.com` chalega.

## STEP 8 — SSL
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d trade.anjaninex.com
```
Ab `https://trade.anjaninex.com` 🔒

## STEP 9 — Verify
- [ ] https://trade.anjaninex.com → login
- [ ] super-admin login → password change
- [ ] firm bana ke test
- [ ] `systemctl status anjaninex-api` running
- [ ] DB `namokara_app` (non-superuser) se connect

---

## Files in this kit
| File | Kaam |
|---|---|
| 01-server-setup.sh | nginx, postgres, .NET 8 runtime, firewall |
| 02-db-setup.sh | DB + non-superuser app role |
| 03-run-migrations.sh | saari migrations (demo skip) |
| 04-api-deploy.sh | API publish + systemd start |
| anjaninex-api.service | systemd unit |
| nginx-anjaninex.conf | static + /api proxy (trade.anjaninex.com) |
| appsettings.Production.template.json | DB + JWT config |

## Future update
```bash
cd /var/www/anjaninex && git pull
cd apps/api && dotnet publish -c Release -o /var/www/anjaninex/api-out && sudo systemctl restart anjaninex-api
# frontend: local ng build → dist scp → done
```
