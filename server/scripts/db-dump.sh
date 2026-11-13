#!/bin/sh
# Dump the lots database to exports/carfranko-YYYYMMDD-HHMM.sql.gz (for moving to the real host).
# Restore on the host:  gunzip -c FILE.sql.gz | psql "$DATABASE_URL"
set -e
cd "$(dirname "$0")/.."
mkdir -p exports
OUT="exports/carfranko-$(date +%Y%m%d-%H%M).sql.gz"
docker compose exec -T db pg_dump -U carfranko --no-owner --no-privileges --clean --if-exists carfranko | gzip > "$OUT"
echo "$OUT ($(du -h "$OUT" | cut -f1))"
