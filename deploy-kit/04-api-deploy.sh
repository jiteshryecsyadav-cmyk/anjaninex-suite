#!/usr/bin/env bash
# 04 — .NET API publish + systemd service start
# Pre: appsettings.Production.json bhar ke api-out me rakho (template se).
# Run: sudo ./04-api-deploy.sh
set -e

CODE_DIR="/var/www/anjaninex"          # repo root
API_PROJ="$CODE_DIR/apps/api"
OUT_DIR="$CODE_DIR/api-out"
KIT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Build sirf tab jab server par SDK ho. Warna local pe publish karke api-out upload karo.
if command -v dotnet >/dev/null && dotnet --list-sdks | grep -q "8."; then
  echo "==> dotnet publish"
  dotnet publish "$API_PROJ" -c Release -o "$OUT_DIR"
else
  echo "==> SDK nahi mila — maan rahe ho api-out pehle se upload hai: $OUT_DIR"
fi

# appsettings.Production.json present hai?
if [ ! -f "$OUT_DIR/appsettings.Production.json" ]; then
  echo "!! $OUT_DIR/appsettings.Production.json missing — template bhar ke yahan rakho."
  exit 1
fi

echo "==> systemd service install"
cp "$KIT_DIR/anjaninex-api.service" /etc/systemd/system/anjaninex-api.service
chown -R www-data:www-data "$CODE_DIR"
systemctl daemon-reload
systemctl enable --now anjaninex-api
sleep 2
systemctl status anjaninex-api --no-pager | head -8
echo "==> Test:"
curl -s http://127.0.0.1:5000/api/version || echo "(version endpoint na ho to koi GET try karo)"
