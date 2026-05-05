# Deployment Guide — Pacific ELD on Hostinger VPS

**Target:** `https://eld-reboot.satyamsuri.com`
**Stack:** Hostinger VPS KVM 2 + Docker Compose + Caddy auto-HTTPS
**Time:** ~45–60 minutes end-to-end (mostly waiting on DNS + Let's Encrypt)
**Skill needed:** Copy/paste into SSH. No prior Docker knowledge required.

---

## Table of contents

1. [Buy the VPS](#step-1--buy-the-hostinger-vps)
2. [Point the subdomain](#step-2--point-eld-rebootsatyamsuricom-at-the-vps)
3. [SSH in for the first time](#step-3--ssh-into-the-vps)
4. [Install prerequisites](#step-4--install-prerequisites)
5. [Open firewall ports](#step-5--open-the-firewall)
6. [Push your code to GitHub](#step-6--push-the-code-to-github-from-your-pc)
7. [Clone the repo on the VPS](#step-7--clone-the-repo-on-the-vps)
8. [Create production secrets](#step-8--create-the-env-file-with-production-secrets)
9. [Add Caddy reverse proxy](#step-9--add-caddy-as-the-reverse-proxy)
10. [Patch docker-compose for Caddy](#step-10--patch-docker-composeprodyml-to-use-caddy)
11. [First-time database setup](#step-11--first-time-database-setup-migrate--timescale--seed)
12. [Start everything](#step-12--start-the-full-stack)
13. [Verify HTTPS + login](#step-13--verify-the-portal-is-live)
14. [Smoke-test TCP ingest](#step-14--smoke-test-the-tcp-listener)
15. [Hand DNS:port to Geometris](#step-15--hand-the-address-to-geometris)
16. [Build the Android APK](#step-16--build-the-android-apk-on-your-pc)
17. [Install APK on phone](#step-17--install-the-apk-on-your-phone)
18. [Daily ops: logs, backups, updates](#step-18--daily-ops)
19. [Troubleshooting](#step-19--troubleshooting)

---

## Step 1 — Buy the Hostinger VPS

1. Log in to **hPanel** at https://hpanel.hostinger.com.
2. Top menu → **VPS** → **Get VPS hosting** (or "Add VPS" if you already have one).
3. Choose plan: **KVM 2** — 2 vCPU, 8 GB RAM, 100 GB NVMe, ~$7–10/month.
   Why KVM 2 and not KVM 1: Postgres + Next.js + ingest worker + Soketi + Caddy = 5 processes. KVM 1 (4 GB RAM) will swap and die under load.
4. Pick a datacenter closest to **Houston, TX** (USA East = Virginia, or Brazil — your truck is in Texas, latency matters for the TCP listener).
5. **Operating System** dropdown → choose **"Ubuntu 24.04 with Docker"** template.
   - If that template isn't listed, pick plain "Ubuntu 24.04 LTS" — Step 4 will install Docker manually.
6. Set a strong root password (save it in your password manager).
7. Skip Hostinger's optional addons (you don't need their Plesk/CyberPanel — we run our own stack).
8. After provisioning (≈ 2 minutes), open the VPS detail page and copy:
   - **IPv4 address** (e.g. `38.242.xxx.xxx`) — you'll need this in step 2 and step 3
   - **Root password**

---

## Step 2 — Point `eld-reboot.satyamsuri.com` at the VPS

1. hPanel → **Domains** → click `satyamsuri.com`.
2. Left sidebar → **DNS / Nameservers** → **DNS Zone** tab.
3. Click **Add record**:
   - **Type:** `A`
   - **Name:** `eld-reboot` (just that — Hostinger appends `.satyamsuri.com` automatically)
   - **Points to:** your VPS IPv4 from Step 1
   - **TTL:** `3600` (1 hour) or `300` if it lets you (faster propagation)
4. **Save**.
5. Wait 5–15 minutes for propagation. Test from PowerShell on your PC:
   ```powershell
   nslookup eld-reboot.satyamsuri.com
   ```
   You should see:
   ```
   Name:    eld-reboot.satyamsuri.com
   Address: 38.242.xxx.xxx     ← your VPS IP
   ```
   If you still see "non-existent domain" after 30 min, double-check the A record name didn't end up as `eld-reboot.satyamsuri.com.satyamsuri.com` (a common Hostinger UI gotcha).

---

## Step 3 — SSH into the VPS

### From Windows PowerShell

```powershell
ssh root@<VPS-IPv4>
```

First time will prompt:
```
The authenticity of host '38.242.xxx.xxx' can't be established.
... Are you sure you want to continue connecting (yes/no)?
```
Type `yes`, hit Enter. Then enter the root password you set in Step 1.

If `ssh` isn't found, install **OpenSSH Client** in Windows:
- Settings → Apps → Optional features → Add a feature → "OpenSSH Client" → Install.

Once you're in, your prompt will look like:
```
root@srv-xxxxx:~#
```

> **Tip:** Keep this SSH session open for the rest of the steps. If you get disconnected, just `ssh root@<IP>` again and `cd /opt/eld/eld_platform`.

---

## Step 4 — Install prerequisites

Run these one block at a time. **Wait for each to finish before pasting the next.**

### 4.1 Update package index
```bash
apt update && apt upgrade -y
```
(Takes ~2 min. If it asks about config files during upgrade, accept the default by pressing Enter.)

### 4.2 Install Docker (skip if you used the "Ubuntu + Docker" template)

Check first:
```bash
docker --version && docker compose version
```
If both print versions, skip to 4.3. Otherwise:
```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker --version
docker compose version
```

### 4.3 Install Git, nano, and curl utilities
```bash
apt install -y git nano curl ufw netcat-openbsd
```

### 4.4 (Optional but recommended) Create swap so Postgres + Next.js can't OOM
```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h
```
You should now see 4 GB of swap.

---

## Step 5 — Open the firewall

```bash
ufw allow 22/tcp        # SSH
ufw allow 80/tcp        # HTTP (Caddy redirects to 443)
ufw allow 443/tcp       # HTTPS
ufw allow 2404/tcp      # Geometris device TCP CSV
ufw --force enable
ufw status
```

You should see all 4 ports `ALLOW`.

> **Don't open** 3000, 6001, 5432, 6379. Those are internal Docker ports — Caddy reaches them inside the Docker network. Exposing Postgres to the internet = bad day.

---

## Step 6 — Push the code to GitHub from your PC

If you haven't yet:

On your **Windows PC** in PowerShell:
```powershell
cd "d:\wamp64\www\projects\sam\ELD PROJECT REBOOT"
git init
git add .
git commit -m "Initial ELD platform"
git branch -M main
# Create the repo at https://github.com/new (private!) named e.g. "eld-platform"
git remote add origin https://github.com/<your-github-user>/eld-platform.git
git push -u origin main
```

> **Make the GitHub repo PRIVATE.** It contains references to admin passwords and seed data even though `.env` is gitignored.

---

## Step 7 — Clone the repo on the VPS

Back in your SSH session:

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/<your-github-user>/eld-platform.git eld
cd eld/eld_platform
ls -la
```

You should see `apps/`, `packages/`, `docker-compose.prod.yml`, `.env.prod.example`, etc.

> If the repo is private, GitHub will ask for credentials. Either:
> - Use a **Personal Access Token** (Settings → Developer settings → PAT → fine-grained, repo read access). Username = your GitHub user, password = the token.
> - Or set up an SSH deploy key (more advanced; skip unless you've done it before).

---

## Step 8 — Create the `.env` file with production secrets

```bash
cd /opt/eld/eld_platform
cp .env.prod.example .env
```

Generate strong random secrets (run each line, copy each output):
```bash
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)"
echo "REDIS_PASSWORD=$(openssl rand -base64 24)"
echo "SOKETI_APP_KEY=$(openssl rand -hex 16)"
echo "SOKETI_APP_SECRET=$(openssl rand -base64 32)"
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "SEED_ADMIN_PASSWORD=$(openssl rand -base64 18)"   # ← SAVE THIS, you'll log in with it
```

**Save the `SEED_ADMIN_PASSWORD` somewhere safe — that's how you'll log into the portal.**

Open the env file:
```bash
nano .env
```

Paste/edit so it looks like this (replace placeholders with what `openssl` printed):

```ini
POSTGRES_USER=eld
POSTGRES_PASSWORD=<paste-generated-1>
POSTGRES_DB=eld

REDIS_PASSWORD=<paste-generated-2>

SOKETI_APP_ID=eld
SOKETI_APP_KEY=<paste-generated-3>
SOKETI_APP_SECRET=<paste-generated-4>
PUBLIC_SOKETI_HOST=eld-reboot.satyamsuri.com
PUBLIC_SOKETI_PORT=443

NEXTAUTH_SECRET=<paste-generated-5>
NEXTAUTH_URL=https://eld-reboot.satyamsuri.com

MAPTILER_API_KEY=
INGEST_ALLOWED_SOURCES=
```

For `MAPTILER_API_KEY`:
- Sign up free at https://www.maptiler.com → Account → Keys → copy the default key.
- Free tier = 100k tile loads/month, more than enough.
- Paste it after `MAPTILER_API_KEY=`.
- If you skip it, the map will work but with a basic style.

Save and exit nano: `Ctrl+O`, Enter, `Ctrl+X`.

Lock the file so other users on the box can't read it:
```bash
chmod 600 .env
```

---

## Step 9 — Add Caddy as the reverse proxy

Caddy is a tiny web server that automatically gets free Let's Encrypt HTTPS certificates. We put it in front of Next.js and Soketi.

```bash
cd /opt/eld/eld_platform
nano Caddyfile
```

Paste exactly this:

```caddy
eld-reboot.satyamsuri.com {
    encode zstd gzip

    # Soketi websocket endpoints (Pusher protocol)
    @ws path /app/* /apps/*
    handle @ws {
        reverse_proxy soketi:6001
    }

    # Everything else → Next.js portal
    reverse_proxy portal:3000
}
```

Save (`Ctrl+O`, Enter, `Ctrl+X`).

---

## Step 10 — Patch `docker-compose.prod.yml` to use Caddy

```bash
nano docker-compose.prod.yml
```

You need to make **two** changes:

### 10.1 Remove the public port mappings from `portal` and `soketi`

Find the `portal:` service. Look for:
```yaml
    ports:
      - "3000:3000"
```
and **delete those two lines**.

Find the `soketi:` service. Look for:
```yaml
    ports:
      - "6001:6001"
```
and **delete those two lines**.

(They're now reachable internally by Caddy via the `eld` Docker network — no need to expose to the host.)

### 10.2 Add the Caddy service

Scroll to the bottom of the `services:` block (just before the `networks:` block) and paste:

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
    depends_on:
      - portal
      - soketi
```

Save (`Ctrl+O`, Enter, `Ctrl+X`).

### 10.3 Verify the YAML didn't break

```bash
docker compose -f docker-compose.prod.yml config > /dev/null && echo "YAML OK"
```
If it prints "YAML OK", you're good. If it prints errors with line numbers, re-open the file and fix the indentation (YAML is space-sensitive — always use 2 spaces, never tabs).

---

## Step 11 — First-time database setup (migrate + Timescale + seed)

This is a 3-part one-time setup. **Don't skip any sub-step.**

### 11.1 Start only Postgres
```bash
cd /opt/eld/eld_platform
docker compose -f docker-compose.prod.yml up -d postgres
```

Wait until the healthcheck passes:
```bash
docker compose -f docker-compose.prod.yml ps postgres
```
You want to see `healthy` in the STATUS column. If it says `starting`, wait 15 seconds and re-run. If after 60 seconds it says `unhealthy`, check `docker compose -f docker-compose.prod.yml logs postgres`.

### 11.2 Build the portal image (this takes 3–8 minutes — patience)
```bash
docker compose -f docker-compose.prod.yml build portal
```

You'll see lots of npm/pnpm output. The first build is slow because it pulls Node + installs all packages + runs `next build`. Subsequent builds are cached.

### 11.3 Run Prisma migrations + Timescale extension + seed

Load the admin password you saved in Step 8 into the env so seed can use it:
```bash
export SEED_ADMIN_PASSWORD='<the-one-you-saved>'
```

Now run the one-shot setup:
```bash
docker compose -f docker-compose.prod.yml run --rm \
  -e SEED_ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD" \
  portal sh -lc '
    cd /repo &&
    pnpm --filter @eld/db db:deploy &&
    pnpm --filter @eld/db db:timescale &&
    pnpm --filter @eld/db db:seed
  '
```

You should see:
- `prisma migrate deploy` finish with "All migrations have been applied"
- TimescaleDB messages about creating the hypertable on `Location`
- Seed messages: "Seeded fleet pacific-eld", "Seeded admin admin@pacificeld.com", "Seeded device 88X150380033"

If any step says "already exists" — that's fine, the script is idempotent.

---

## Step 12 — Start the full stack

```bash
docker compose -f docker-compose.prod.yml up -d
```

Watch logs:
```bash
docker compose -f docker-compose.prod.yml ps
```
All 6 services should be `running` (postgres, redis, soketi, ingest-worker, portal, caddy).

Tail recent logs:
```bash
docker compose -f docker-compose.prod.yml logs --tail=50 caddy portal ingest-worker
```

Caddy should print:
```
serving initial configuration
certificate obtained successfully  identifier=eld-reboot.satyamsuri.com
```

If Caddy says "challenge failed" — the DNS A record from Step 2 hasn't propagated yet, or port 80/443 isn't open. Wait 5 min and `docker compose ... restart caddy`.

---

## Step 13 — Verify the portal is live

1. From your laptop's browser: **https://eld-reboot.satyamsuri.com**
2. You should see the login page (no certificate warnings).
3. Log in:
   - Email: `admin@pacificeld.com`
   - Password: the `SEED_ADMIN_PASSWORD` you saved in Step 8
4. You should land on the **Live Map** page — empty for now (no packets yet).
5. Click **Devices** in the sidebar → you should see your device `88X150380033` listed with status `ACTIVE`, last-seen `never`.

---

## Step 14 — Smoke-test the TCP listener

From your PC's PowerShell:

```powershell
$ts = [int][double]::Parse((Get-Date -UFormat %s))
$line = "F001,88X150380033,IGN_ON,$ts,29.85657,-95.64319,77,0,1,60,35,90,32376.1,7,,35198,10449,,,,32372.0T,1N4AL3AP3GN360245,,0:0,,,,"
$line | & 'C:\Windows\System32\OpenSSH\ssh.exe' root@<VPS-IP> "nc -q 1 localhost 2404"
```

Or simpler — from inside the SSH session:
```bash
ts=$(date +%s)
echo "F001,88X150380033,IGN_ON,$ts,29.85657,-95.64319,77,0,1,60,35,90,32376.1,7,,35198,10449,,,,32372.0T,1N4AL3AP3GN360245,,0:0,,,," | nc -q 1 localhost 2404
```

In the SSH session, watch the worker:
```bash
docker compose -f docker-compose.prod.yml logs -f --tail=20 ingest-worker
```
You should see:
```
device connected   {"remote":"127.0.0.1:..."}
packet stored      {"sn":"88X150380033","reason":"IGN_ON","lat":29.85657,...}
device disconnected
```

Refresh `https://eld-reboot.satyamsuri.com/map` — a green dot appears in Houston. **Stack is live.**

---

## Step 15 — Hand the address to Geometris

Email Geometris support (`support@geometris.com`):

> Please configure device **SN 88X150380033** with the following parameters:
> - **Parameter 4 (PRIMARY_SERVER):** `eld-reboot.satyamsuri.com:2404`
> - **Parameter 12 (DATA_PACKET):** keep your default
> - **Parameter 65 (FORMAT_CRC):** keep your default
>
> Account: <your Geometris customer ID / SIM order #>

They typically push within 1 business day. Once pushed, the device will start sending real packets next time the truck's ignition turns on.

---

## Step 16 — Build the Android APK on your PC

### 16.1 Install Flutter (one-time, ~10 min)

1. Download from https://docs.flutter.dev/get-started/install/windows (zip).
2. Extract to `C:\src\flutter` (avoid spaces and Program Files).
3. Add `C:\src\flutter\bin` to PATH:
   - Win → "Edit environment variables" → User PATH → New → `C:\src\flutter\bin` → OK.
4. Open a **new** PowerShell, run:
   ```powershell
   flutter doctor
   ```
   It will tell you what's missing. For APK builds you need:
   - Android Studio (download, install, open it once, accept SDK license)
   - Android SDK Command-line Tools
   - Then: `flutter doctor --android-licenses` and accept everything.

### 16.2 Build the APK

```powershell
cd "d:\wamp64\www\projects\sam\ELD PROJECT REBOOT\eld_flutter_demo_app"
.\build-apk.ps1
```

If PowerShell blocks the script:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\build-apk.ps1
```

After 3–5 minutes you'll have:
```
build\app\outputs\flutter-apk\app-arm64-v8a-release.apk      ← ~25 MB ← THIS ONE
build\app\outputs\flutter-apk\app-armeabi-v7a-release.apk    ← old phones
build\app\outputs\flutter-apk\app-x86_64-release.apk         ← emulators
```

---

## Step 17 — Install the APK on your phone

Pick whichever is easiest:

### Option A — USB cable (fastest)
1. Plug phone in. Allow file transfer / MTP when phone asks.
2. Drag `app-arm64-v8a-release.apk` to phone's Downloads folder.
3. On phone: open Files → Downloads → tap the APK.
4. Android: "Your phone isn't allowed to install unknown apps from this source" → tap **Settings** → enable **Allow from this source** → back → **Install**.

### Option B — Telegram saved messages
1. Open Telegram on your PC, send the APK file to "Saved Messages" (yourself).
2. On your phone, open Telegram → Saved Messages → tap APK → Install.

### Option C — `adb install` (cleanest if Android Studio is installed)
```powershell
adb devices                  # confirm phone is detected (enable USB debugging in Developer Options first)
adb install -r build\app\outputs\flutter-apk\app-arm64-v8a-release.apk
```

### First launch
1. App icon = "ELD Reboot".
2. Open it → grant **Bluetooth** + **Location** permissions when prompted (Location is required by Android for BLE scanning, even though we don't use GPS in the app).
3. Tap **Pair** → **Scan** → your `WQ-88X150380033` should appear within 8 seconds → tap **Connect**.
4. Once connected, the home screen shows live packets streaming from the device.
5. Refresh the portal map — you'll see the dot move as the truck moves.

---

## Step 18 — Daily ops

### View logs

```bash
cd /opt/eld/eld_platform
docker compose -f docker-compose.prod.yml logs -f --tail=100 ingest-worker
docker compose -f docker-compose.prod.yml logs -f --tail=100 portal
docker compose -f docker-compose.prod.yml logs -f --tail=100 caddy
```

(Press `Ctrl+C` to stop tailing — doesn't affect the running service.)

### Restart a single service after a config change
```bash
docker compose -f docker-compose.prod.yml restart portal
```

### Apply a code update from GitHub
```bash
cd /opt/eld/eld_platform
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

If the pull included new Prisma migrations:
```bash
docker compose -f docker-compose.prod.yml run --rm portal sh -lc \
  "cd /repo && pnpm --filter @eld/db db:deploy"
```

### Backup the database (do this!)

Manual backup:
```bash
mkdir -p /opt/eld/backups
docker exec eld_platform-postgres-1 pg_dump -U eld eld | gzip > \
  /opt/eld/backups/eld-$(date +%F).sql.gz
ls -lh /opt/eld/backups/
```

Automate daily at 3 AM:
```bash
crontab -e
```
Add this line at the bottom:
```
0 3 * * * docker exec eld_platform-postgres-1 pg_dump -U eld eld | gzip > /opt/eld/backups/eld-$(date +\%F).sql.gz && find /opt/eld/backups -name "eld-*.sql.gz" -mtime +14 -delete
```
(Keeps 14 days, deletes older.)

### Restore from backup (disaster recovery)
```bash
gunzip -c /opt/eld/backups/eld-2026-05-01.sql.gz | \
  docker exec -i eld_platform-postgres-1 psql -U eld eld
```

### Disk usage check
```bash
df -h /
docker system df
```
If Docker images bloat over time:
```bash
docker system prune -af --volumes   # ⚠ keeps named volumes only — safe for our setup
```

---

## Step 19 — Troubleshooting

### "502 Bad Gateway" when opening the portal
- Portal service crashed. Check: `docker compose -f docker-compose.prod.yml logs --tail=100 portal`
- Most common cause: `DATABASE_URL` typo in `.env`. Re-check, then `docker compose ... restart portal`.

### Caddy says "challenge failed" / no HTTPS
- DNS not propagated. Run `dig eld-reboot.satyamsuri.com` on the VPS — must return your VPS IP.
- Port 80 blocked. Run `ufw status` — must show `80/tcp ALLOW`.
- Hostinger firewall (separate from `ufw`). hPanel → VPS → Firewall — make sure 80, 443, 2404 are allowed there too. Some Hostinger templates ship with their own firewall in addition to `ufw`.

### Device connects but no packets in DB
- Tail the worker: `docker compose -f docker-compose.prod.yml logs -f ingest-worker`
- If you see "parse error" — Geometris pushed a non-default `parameter 12` layout. Email them to confirm the layout, then we'll override `DEFAULT_PARAM_12` in `apps/ingest-worker/src/parser.ts`.
- If you see "device connected" but never "packet stored" — the device might be sending a heartbeat with no GPS fix. Wait until ignition is on and GPS has a sky view.

### "Cannot connect to BLE device" in the Flutter app
- The device only advertises BLE when ignition is **ON** (whereQube power-management feature).
- Phone has to be within ~3 meters of the device.
- iOS users: BLE works the same but the APK we built is Android-only. Ask if you need an iOS TestFlight build — that requires an Apple Developer account ($99/yr) plus an iCloud Mac for signing.

### "Permission denied" on `docker compose ...`
- You're not root. Either `sudo docker compose ...` every time, or `usermod -aG docker $USER && newgrp docker` once.

### Out of memory / Postgres killed
- KVM 2 should be fine, but if you went with KVM 1 (4 GB), enable swap (Step 4.4) — it'll save you.
- Long-term fix: upgrade to KVM 4.

### Need to change the admin password
```bash
docker compose -f docker-compose.prod.yml exec postgres psql -U eld eld
```
Then in `psql`:
```sql
-- Generate hash on the VPS first:
-- $ docker compose run --rm portal node -e "console.log(require('bcryptjs').hashSync('NewStrongPassword123!', 10))"
UPDATE "User"
SET "passwordHash" = '<paste-hash-here>'
WHERE email = 'admin@pacificeld.com';
\q
```

### Need to wipe everything and start over (⚠ DESTRUCTIVE)
```bash
cd /opt/eld/eld_platform
docker compose -f docker-compose.prod.yml down -v
rm -rf data/
# Then restart from Step 11.
```

---

## Quick command reference

| What | Command |
|---|---|
| SSH in | `ssh root@<VPS-IP>` |
| Go to project | `cd /opt/eld/eld_platform` |
| Status | `docker compose -f docker-compose.prod.yml ps` |
| Logs (live) | `docker compose -f docker-compose.prod.yml logs -f <service>` |
| Restart all | `docker compose -f docker-compose.prod.yml restart` |
| Stop all | `docker compose -f docker-compose.prod.yml down` |
| Start all | `docker compose -f docker-compose.prod.yml up -d` |
| Update from Git | `git pull && docker compose ... build && docker compose ... up -d` |
| Backup DB | `docker exec eld_platform-postgres-1 pg_dump -U eld eld \| gzip > backup.sql.gz` |

---

## Where each piece lives

```
VPS /opt/eld/eld_platform/
├── .env                      ← your secrets (chmod 600)
├── Caddyfile                 ← reverse proxy config
├── docker-compose.prod.yml   ← service definitions
├── data/
│   ├── pg/                   ← Postgres data (BACK THIS UP)
│   ├── redis/                ← Redis data
│   ├── caddy/                ← Caddy auto-renewed certs
│   └── caddy-config/
└── (everything else from the Git repo)
```

The 3 things you must back up: `data/pg/` (or pg_dump output), `.env`, and your GitHub repo.

---

**You're done.** When the truck drives tomorrow, packets land in Postgres, and you can watch them on the map from any browser.
