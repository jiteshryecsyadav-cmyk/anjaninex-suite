#!/usr/bin/env bash
# 01 — VPS base setup: nginx, postgres, .NET 8 runtime, firewall
# Run: sudo ./01-server-setup.sh
set -e

echo "==> apt update + upgrade"
apt update && apt upgrade -y

echo "==> nginx, postgres, tools"
apt install -y nginx postgresql postgresql-contrib ufw git curl wget unzip

echo "==> .NET 8 runtime (Microsoft repo)"
wget -q https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O /tmp/ms.deb
dpkg -i /tmp/ms.deb
apt update
apt install -y aspnetcore-runtime-8.0
# Agar server par hi build karna ho to neeche wali line uncomment karo:
# apt install -y dotnet-sdk-8.0

echo "==> firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> DONE. Versions:"
dotnet --info | head -5
nginx -v
psql --version
