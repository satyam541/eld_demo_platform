# Deploy to Hostinger VPS — `eld-reboot.satyamsuri.com`

This is the step-by-step playbook. Total time ≈ 45 minutes if DNS is fast.

## 0. Buy the VPS

In hPanel → **VPS** → buy **KVM 2** (2 vCPU / 8 GB RAM / 100 GB SSD).
- OS template: **Ubuntu 24.04 with Docker** (Hostinger has this pre-baked — pick it, it saves 5 min)
- Set a strong root password.
- After provisioning, note the public **IPv4** address.

## 1. Point the subdomain at the VPS

In hPanel → **Domains** → `satyamsuri.com` → **DNS / Nameservers**:

| Type | Name         | Points to        | TTL  |
|------|--------------|------------------|------|
| A    | `eld-reboot` | `<your VPS IPv4>`| 3600 |

DNS usually propagates within 5–15 minutes on Hostinger.

Test from your laptop:
```powershell
nslookup eld-reboot.satyamsuri.com
```
You should see your VPS IP.

## 2. SSH in and prep the server

```bash
ssh root@<your VPS IPv4>

# Hostinger's Docker image already has docker + compose plugin.
# If you used a plain Ubuntu image instead, run:
#   apt update && apt install -y docker.io docker-compose-plugin git ufw

# Firewall: SSH, HTTP, HTTPS, and Geometris TCP ingest port
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw allow 2404
ufw --force enable
```

## 3. Clone and configure

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/<you>/<repo>.git eld
cd eld/eld_platform

cp .env.prod.example .env
nano .env
```

Fill these (use `openssl rand -base64 32` for each secret):

```ini
POSTGRES_PASSWORD=<rand>
REDIS_PASSWORD=<rand>
SOKETI_APP_ID=eld
SOKETI_APP_KEY=<rand-pubkey>
SOKETI_APP_SECRET=<rand-secret>
PUBLIC_SOKETI_HOST=eld-reboot.satyamsuri.com
PUBLIC_SOKETI_PORT=443
NEXTAUTH_SECRET=<rand>
NEXTAUTH_URL=https://eld-reboot.satyamsuri.com
MAPTILER_API_KEY=<get free key from maptiler.com>
INGEST_ALLOWED_SOURCES=
```

## 4. Add Caddy as the auto-HTTPS reverse proxy

Create `/opt/eld/eld_platform/Caddyfile`:

```caddy
eld-reboot.satyamsuri.com {
    encode zstd gzip

    # Soketi websocket endpoints (Pusher protocol)
    @ws {
        path /app/* /apps/*
    }
    handle @ws {
        reverse_proxy soketi:6001
    }

    # Everything else → Next.js portal
    reverse_proxy portal:3000
}
```

Append a `caddy` service to `docker-compose.prod.yml`:

```bash
nano docker-compose.prod.yml
```
Add at the bottom (under `services:`, before `networks:`):

```yaml
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./data/caddy:/data
      - ./data/caddy-config:/config
    networks: [eld]
    depends_on: [portal, soketi]
```

Also **remove** the `ports:` block from the `portal` and `soketi` services
(Caddy now fronts them; they only need to be reachable inside the Docker
network).

## 5. First-run database setup

```bash
docker compose -f docker-compose.prod.yml up -d postgres
sleep 15

# Generate Prisma client + run migrations + install Timescale + seed
docker compose -f docker-compose.prod.yml run --rm \
  -e SEED_ADMIN_PASSWORD='YourPickedAdminPassword!' \
  portal sh -lc "
    cd /repo &&
    pnpm --filter @eld/db db:deploy &&
    pnpm --filter @eld/db db:timescale &&
    pnpm --filter @eld/db db:seed
  "
```

## 6. Bring it all up

```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f --tail=50 ingest-worker portal caddy
```

Caddy will fetch a Let's Encrypt cert for `eld-reboot.satyamsuri.com` on
first request — give it ~30 s, then open
**https://eld-reboot.satyamsuri.com** and log in:

- Email: `admin@pacificeld.com`
- Password: whatever you set as `SEED_ADMIN_PASSWORD`

## 7. Smoke-test the TCP ingest from your laptop

```powershell
$line = "F001,88X150380033,IGN_ON,$([int][double]::Parse((Get-Date -UFormat %s))),29.85,-95.64,77,0,1,60,35,90,32376.1,7,,35198,10449,,,,32372.0T,1N4AL3AP3GN360245,,0:0,,,,"
$line | & 'C:\Program Files\Git\usr\bin\nc.exe' eld-reboot.satyamsuri.com 2404
```

Refresh `/map` — a green dot should appear within 1–2 seconds.

## 8. Tell Geometris where to send packets

Through Geometris support (or their portal):

> Please set parameter 4 (PRIMARY_SERVER) on device SN **88X150380033** to
> `eld-reboot.satyamsuri.com:2404`.

Once they push that, the device will start sending real packets on its
own schedule (every IGN_ON, IGN_OFF, periodic GPS, etc.).

## 9. Sideload the APK onto your Android phone

On your dev machine:

```powershell
cd eld_flutter_demo_app
.\build-apk.ps1
```

This produces `build\app\outputs\flutter-apk\app-arm64-v8a-release.apk`
(~25 MB) configured to talk to `https://eld-reboot.satyamsuri.com`.

Transfer to your phone (USB cable, Telegram saved-messages, Google Drive,
or `adb install`), then tap to install. You'll be asked to allow
"Install unknown apps" once.

## Daily ops

```bash
# Tail logs
docker compose -f docker-compose.prod.yml logs -f --tail=100 ingest-worker

# Backup DB (cron at 03:00)
0 3 * * * docker exec eld-postgres-1 pg_dump -U eld eld | gzip > /opt/eld/backups/eld-$(date +\%F).sql.gz

# Update after a git pull
cd /opt/eld && git pull
cd eld_platform
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```
