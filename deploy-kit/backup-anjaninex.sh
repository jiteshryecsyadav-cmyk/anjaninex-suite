#!/usr/bin/env bash
# ============================================================================
# ANJANINEX BACKUP — roz raat 2 baje cron se chalta hai (05-backup-setup.sh se install)
#
# Seedhi (GFS retention):
#   daily/    har raat            → 14 din rakhte hain
#   weekly/   har RAVIWAR         → 8 hafte
#   monthly/  har mahine ki 1     → 24 mahine
#   yearly/   har 1 APRIL (FY close) → 8 SAAL  ← GST Section 36 (6 saal) + margin
#
# Off-site (optional, rclone setup ke baad):
#   /root/.backup-pass file ho to dump AES-256 se encrypt hokar Google Drive
#   par chadhta hai. Bina pass-file ke upload NAHI hota (7 firms ka poora
#   hisaab bina tale Drive par nahi bhejna).
#
# Restore:
#   gunzip -c namokara-YYYY-MM-DD.sql.gz | sudo -u postgres psql -d namokara
#   (encrypted: pehle `openssl enc -d -aes-256-cbc -pbkdf2 -pass file:/root/.backup-pass -in file.enc | gunzip ...`)
# ============================================================================
set -euo pipefail

DB="namokara"
BASE="/var/backups/anjaninex"
LOG_PREFIX="[anjaninex-backup $(date '+%F %T')]"

STAMP=$(date +%F)
DOW=$(date +%u)      # 1=Somwar ... 7=Raviwar
DOM=$(date +%d)
MMDD=$(date +%m-%d)

mkdir -p "$BASE"/{daily,weekly,monthly,yearly}

# ---------- 1. Dump ----------
FILE="$BASE/daily/namokara-$STAMP.sql.gz"
sudo -u postgres pg_dump "$DB" | gzip > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"

# Khaali dump = kuch galat hai — aage mat badho, chillao.
SIZE=$(stat -c%s "$FILE")
if [ "$SIZE" -lt 100000 ]; then
    echo "$LOG_PREFIX ERROR: dump sirf $SIZE bytes ka hai — backup FAIL. DB check karo!" >&2
    exit 1
fi
echo "$LOG_PREFIX daily OK ($(numfmt --to=iec $SIZE))"

# ---------- 2. GFS copies ----------
[ "$DOW" = "7" ]      && cp "$FILE" "$BASE/weekly/"  && echo "$LOG_PREFIX weekly copy"
[ "$DOM" = "01" ]     && cp "$FILE" "$BASE/monthly/" && echo "$LOG_PREFIX monthly copy"
# 1 April = FY closing — yahi wo backup hai jo GST/CA ke liye 8 saal rahega
[ "$MMDD" = "04-01" ] && cp "$FILE" "$BASE/yearly/namokara-FY-$STAMP.sql.gz" \
                      && echo "$LOG_PREFIX YEARLY (FY closing) copy"

# ---------- 3. Purane hatao ----------
find "$BASE/daily"   -name '*.gz' -mtime +14   -delete
find "$BASE/weekly"  -name '*.gz' -mtime +56   -delete
find "$BASE/monthly" -name '*.gz' -mtime +730  -delete
find "$BASE/yearly"  -name '*.gz' -mtime +2920 -delete   # 8 saal

# ---------- 4. Off-site (Google Drive via rclone) ----------
# Setup (EK baar, interactive): rclone config  → naya remote "gdrive" (Google Drive)
# Pass-file:                    openssl rand -base64 32 > /root/.backup-pass && chmod 600 /root/.backup-pass
# ⚠️ .backup-pass ka PRINT nikaal kar tijori me rakho — ye kho gaya to Drive
#    wale backups kabhi nahi khulenge.
if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -q '^gdrive:'; then
    if [ -f /root/.backup-pass ]; then
        ENC="$FILE.enc"
        openssl enc -aes-256-cbc -pbkdf2 -pass file:/root/.backup-pass -in "$FILE" -out "$ENC"
        rclone copy "$ENC" gdrive:anjaninex-backups/daily/
        rm -f "$ENC"
        # yearly bhi (chhote hain, poora folder sync)
        for Y in "$BASE"/yearly/*.gz; do
            [ -e "$Y" ] || continue
            YENC="/tmp/$(basename "$Y").enc"
            [ -z "$(rclone lsf "gdrive:anjaninex-backups/yearly/$(basename "$Y").enc" 2>/dev/null)" ] || continue
            openssl enc -aes-256-cbc -pbkdf2 -pass file:/root/.backup-pass -in "$Y" -out "$YENC"
            rclone copy "$YENC" gdrive:anjaninex-backups/yearly/
            rm -f "$YENC"
        done
        # Drive par daily 90 din rakhte hain
        rclone delete gdrive:anjaninex-backups/daily/ --min-age 90d 2>/dev/null || true
        echo "$LOG_PREFIX Drive upload OK"
    else
        echo "$LOG_PREFIX Drive skip — /root/.backup-pass nahi hai (bina encryption upload nahi karte)"
    fi
else
    echo "$LOG_PREFIX Drive skip — rclone 'gdrive' remote setup nahi hai"
fi

echo "$LOG_PREFIX done."
