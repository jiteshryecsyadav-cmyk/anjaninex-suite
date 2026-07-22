#!/usr/bin/env bash
# 05 — backup script install + cron (roz raat 2:00 baje)
# Run (server par): sudo bash /var/www/anjaninex/deploy-kit/05-backup-setup.sh
set -euo pipefail

KIT_DIR="$(cd "$(dirname "$0")" && pwd)"

install -m 755 "$KIT_DIR/backup-anjaninex.sh" /usr/local/bin/backup-anjaninex.sh

cat > /etc/cron.d/anjaninex-backup <<'CRON'
# Anjaninex DB backup — roz raat 2:00 (GFS retention: 14d/8w/24m/8y)
0 2 * * * root /usr/local/bin/backup-anjaninex.sh >> /var/log/anjaninex-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/anjaninex-backup

echo "==> Installed. Pehla test run:"
/usr/local/bin/backup-anjaninex.sh
echo ""
echo "==> Backups yahan: /var/backups/anjaninex/  · log: /var/log/anjaninex-backup.log"
ls -lh /var/backups/anjaninex/daily/ | tail -3
echo ""
echo "Google Drive (optional, EK baar):"
echo "  1. apt install -y rclone     (na ho to)"
echo "  2. rclone config             → naya remote, naam EXACT 'gdrive', type Google Drive"
echo "  3. openssl rand -base64 32 > /root/.backup-pass && chmod 600 /root/.backup-pass"
echo "  4. cat /root/.backup-pass    → iska PRINT tijori me rakho (kho gaya = Drive backup bekar)"
