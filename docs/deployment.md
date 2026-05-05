# Deployment — Pacific ELD MVP

This stack is designed to deploy in one shot on a small VPS (Hetzner CPX21
or larger). It runs four containers behind a reverse proxy:

- **postgres** — TimescaleDB (PG 16)
- **soketi** — Pusher-protocol websocket server
- **ingest-worker** — TCP CSV listener for Geometris whereQube on **port 2404**
- **portal** — Next.js dashboard on port 3000

## 0. DNS & Cloudflare

Point an A record (e.g. `eld.example.com`) at your server IP. In Cloudflare,
turn the proxy **off** (gray cloud) — we terminate TLS at Caddy / Coolify.

The TCP listener port (2404) is **not** behind Cloudflare; the device opens
a raw TCP connection to `eld.example.com:2404`. Make sure UFW / Hetzner
firewall allows TCP 2404 inbound.

## 1. Bootstrap the server

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git ufw
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw allow 2404
sudo ufw enable

git clone <your repo> /opt/eld && cd /opt/eld/eld_platform
cp .env.prod.example .env
# Edit .env: fill POSTGRES_PASSWORD, REDIS_PASSWORD, SOKETI_APP_SECRET,
# NEXTAUTH_SECRET (use `openssl rand -base64 32`), NEXTAUTH_URL,
# MAPTILER_API_KEY, PUBLIC_SOKETI_HOST.
```

## 2. First-run database setup

```bash
docker compose -f docker-compose.prod.yml up -d postgres
# wait ~10s for healthcheck
docker compose -f docker-compose.prod.yml run --rm portal sh -c \
    "pnpm --filter @eld/db db:deploy && pnpm --filter @eld/db db:timescale && pnpm --filter @eld/db db:seed"
```

The `db:timescale` step converts the `Location` table to a hypertable and
installs the 7-day compression / 365-day retention policies.

The seed creates the default fleet (`pacific-eld`), an admin user
(`admin@pacificeld.com`, password = `SEED_ADMIN_PASSWORD` env var), the
demo vehicle, and links your physical device by serial `88X150380033`.

```bash
SEED_ADMIN_PASSWORD='YourStrongAdminPwd!' docker compose ... db:seed
```

## 3. Start everything

```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f ingest-worker
```

## 4. Reverse proxy (Caddy example)

```caddy
eld.example.com {
    encode zstd gzip
    @ws path /app/* /apps/*  # Soketi WS endpoints
    handle @ws {
        reverse_proxy soketi:6001
    }
    reverse_proxy portal:3000
}
```

If you use **Coolify**: add the repo as a Docker Compose application,
point it at `docker-compose.prod.yml`, paste the env vars, and let Coolify
provision a Caddy/Traefik proxy with auto-HTTPS.

## 5. Tell Geometris where to send packets

Once the listener is up, set the device's **parameter 4 (PRIMARY_SERVER)** to:

```
eld.example.com:2404
```

You do this through the Geometris portal (Devices → SN 88X150380033 →
Configure → Parameter 4) or by asking Geometris support to push it.

## 6. Verify

```bash
# From your workstation:
echo "F001,88X150380033,IGN_ON,$(date +%s),29.85,-95.64,77,0,1,60,35,90,32376.1,7,,35198,10449,,,,32372.0T,1N4AL3AP3GN360245,,0:0,,,," \
  | nc eld.example.com 2404
```

Then refresh `https://eld.example.com/map` — a green dot should appear.

## 7. Backups

```bash
# Cron daily at 03:00:
0 3 * * * docker exec eld-postgres-1 pg_dump -U eld eld | gzip > /opt/eld/backups/eld-$(date +\%F).sql.gz
```

Keep at least 14 days of backups offsite (Backblaze B2 or S3).
