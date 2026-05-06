# Local Setup Guide — Run the Portal on Your Windows PC

**Goal:** Get `http://localhost:3000` working on your laptop so you can develop, test, and demo without needing a server.
**Stack on your PC:** Docker Desktop + Node.js 22 + pnpm + Postgres/Redis/Soketi (in containers)
**Time:** ~30–45 minutes (mostly downloads on the first run)

> If anything fails, jump to **[Step 13 — Troubleshooting](#step-13--troubleshooting)** at the bottom.

---

## Table of contents

1. [Install Node.js 22](#step-1--install-nodejs-22)
2. [Enable pnpm via Corepack](#step-2--enable-pnpm-via-corepack)
3. [Install Docker Desktop](#step-3--install-docker-desktop)
4. [Install Git + open the project](#step-4--install-git--open-the-project)
5. [Install all dependencies](#step-5--install-all-project-dependencies)
6. [Create the local `.env`](#step-6--create-the-local-env-file)
7. [Start Postgres, Redis, Soketi](#step-7--start-the-infra-containers)
8. [Initialize the database](#step-8--initialize-the-database)
9. [Start the ingest worker](#step-9--start-the-ingest-worker)
10. [Start the portal](#step-10--start-the-portal)
11. [Log in and verify](#step-11--log-in-and-verify)
12. [Replay sample data to see the map move](#step-12--replay-sample-data)
13. [Troubleshooting](#step-13--troubleshooting)
14. [Daily workflow cheatsheet](#step-14--daily-workflow-cheatsheet)

---

## Step 1 — Install Node.js 22

1. Go to https://nodejs.org/en/download → pick **Windows Installer (.msi)** for **LTS 22.x** (64-bit).
2. Run the installer with all defaults. Make sure **"Add to PATH"** is checked (it is by default).
3. Open a **new** PowerShell window and verify:
   ```powershell
   node --version
   npm --version
   ```
   You should see `v22.x.x` and `10.x.x` (or higher).

> If `node` is not recognized, close PowerShell and open a new one — PATH only refreshes for new shells.

---

## Step 2 — Enable pnpm via Corepack

`pnpm` is the package manager this project uses. Node 22 ships with Corepack which installs pnpm automatically.

In PowerShell **as Administrator** (right-click PowerShell → Run as administrator):

```powershell
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm --version
```

Expected output: `9.12.0`.

> If `corepack enable` errors out with "EPERM", you didn't run PowerShell as admin. Close and reopen as admin.

---

## Step 3 — Install Docker Desktop

We use Docker only for the **infra** (Postgres + Redis + Soketi). Node code runs natively on Windows for fast hot-reload.

1. Download Docker Desktop for Windows: https://www.docker.com/products/docker-desktop
2. Run the installer. Defaults are fine. It will ask to enable **WSL 2** — accept.
3. Reboot when prompted.
4. After reboot, launch **Docker Desktop**. Wait for the whale icon in the system tray to stop animating (first launch takes 1–2 minutes).
5. Verify in PowerShell:
   ```powershell
   docker --version
   docker compose version
   ```
   Both should print versions.

> If Docker says "WSL 2 installation is incomplete", run `wsl --update` in PowerShell as admin, then reboot.

---

## Step 4 — Install Git + open the project

If you already cloned the repo, skip to step 4.3.

### 4.1 Install Git
- Download: https://git-scm.com/download/win
- Run installer with all defaults. Reopen PowerShell.
- Verify: `git --version`

### 4.2 Clone the repo (only if you haven't)
```powershell
cd "d:\wamp64\www\projects\sam"
git clone https://github.com/<your-user>/eld-platform.git "ELD PROJECT REBOOT"
```

### 4.3 Move into the platform folder
```powershell
cd "d:\wamp64\www\projects\sam\ELD PROJECT REBOOT\eld_platform"
```

**Every step from here on assumes you are in `eld_platform/`** unless I say otherwise.

---

## Step 5 — Install all project dependencies

This is a pnpm monorepo, so one install handles everything (portal, ingest-worker, shared packages).

```powershell
pnpm install
```

What happens:
- Downloads ~1.2 GB of packages into `node_modules` (first time only)
- Builds the shared package
- Runs Prisma's `postinstall` to generate the database client

**Takes 2–5 minutes** depending on internet speed. You'll see lots of progress lines. The success line at the end looks like:
```
Done in 3m 42s
```

If you see warnings about peer dependencies — ignore them, that's normal in a monorepo.

---

## Step 6 — Create the local `.env` file

The repo ships an example. Copy it:

```powershell
Copy-Item .env.example .env
```

Open it in VS Code:
```powershell
code .env
```

For local dev the **defaults already work** — every value is preset to talk to the local Docker containers. The only thing worth changing is:

```ini
# Make these random-ish for muscle memory; not actually secret on localhost
NEXTAUTH_SECRET=any-long-random-string-for-local-dev-min-32-chars
NEXTAUTH_URL=http://localhost:3000

# Optional — get a free key from https://www.maptiler.com/cloud (skip if you don't care about pretty map tiles)
MAPTILER_API_KEY=
```

Save. Don't worry about the Soketi/Postgres values; they match what Docker Compose will spin up in the next step.

---

## Step 7 — Start the infra containers

In PowerShell, still inside `eld_platform/`:

```powershell
docker compose up -d postgres redis soketi
```

What it does:
- Pulls 3 Docker images (~500 MB total, first time only)
- Starts Postgres on `localhost:5432`
- Starts Redis on `localhost:6379`
- Starts Soketi (websockets) on `localhost:6001`
- Stores their data in a Docker volume so it survives reboots

Verify they're running:
```powershell
docker compose ps
```

You want to see `Up` next to all three. If Postgres says `(healthy)` even better — that means the database accepts connections.

> First run: Postgres takes ~10 seconds to initialize. If your next step fails with "connection refused", wait 15 seconds and retry.

---

## Step 8 — Initialize the database

Three sub-steps, run in order. **Don't skip any.**

### 8.1 Generate the Prisma client
```powershell
pnpm --filter @eld/db db:generate
```
This creates `node_modules/@prisma/client` from `schema.prisma`.

### 8.2 Run migrations (creates all the tables)
```powershell
pnpm --filter @eld/db db:migrate
```
You'll see:
```
✔ Applied migration ...
The following migration(s) have been applied:
  └─ migrations/.../migration.sql
```
First run, Prisma will ask you to **name the migration** — type `init` and press Enter.

### 8.3 Convert `Location` to a Timescale hypertable
```powershell
pnpm --filter @eld/db db:timescale
```
This runs `sql/001_init_timescale.sql` — adds the time-series superpowers (1-day chunks, compression, retention).

### 8.4 Seed demo data
```powershell
$env:SEED_ADMIN_PASSWORD = "DevAdmin123!"
pnpm --filter @eld/db db:seed
```

Creates:
- Fleet **`pacific-eld`**
- User **`admin@pacificeld.com`** / password = `DevAdmin123!`
- Vehicle **`demo-vehicle-1`**
- Device **`88X150380033`** (your real one — linked to the demo vehicle)
- Driver **`demo-driver-1`**

> **Remember the password** `DevAdmin123!` — that's how you log in.

---

## Step 9 — Start the ingest worker

Open a **new PowerShell window** (keep the original open for the portal).

```powershell
cd "d:\wamp64\www\projects\sam\ELD PROJECT REBOOT\eld_platform"
pnpm --filter ingest-worker dev
```

You should see colorful log output ending with:
```
[INFO] Geometris CSV ingest listening on TCP   port=2404
[INFO] health endpoint listening on HTTP       port=9090
```

**Leave this terminal running.** Closing it stops the worker.

> If it errors with "EADDRINUSE port 2404", something else is using that port. See [Troubleshooting](#step-13--troubleshooting).

---

## Step 10 — Start the portal

Open a **third PowerShell window** (so you have one for infra, one for worker, one for portal).

```powershell
cd "d:\wamp64\www\projects\sam\ELD PROJECT REBOOT\eld_platform"
pnpm --filter portal dev
```

First start takes ~30 seconds (Next.js compiles everything). You'll see:
```
   ▲ Next.js 15.0.3
   - Local:        http://localhost:3000
   - Environments: .env

 ✓ Ready in 12.3s
```

**Leave this running too.** Hot-reload kicks in when you edit code.

---

## Step 11 — Log in and verify

1. Open **http://localhost:3000** in your browser.
2. You should see the login page.
3. Sign in:
   - **Email:** `admin@pacificeld.com`
   - **Password:** `DevAdmin123!` (whatever you set in step 8.4)
4. You land on **Live Map** — empty for now (no packets in DB yet).
5. Click **Devices** → you should see `88X150380033`, status `ACTIVE`, last-seen `never`.
6. Click **Vehicles** → see `demo-vehicle-1`. Try adding a new one through the form.
7. Click **Drivers** → see `demo-driver-1`. Try adding a new driver.

Everything you click should work. If a page errors, check the portal terminal — Next.js prints stack traces there.

---

## Step 12 — Replay sample data

Time to make the map come alive. The ingest worker has a built-in replay tool that simulates a 30-minute drive through Houston.

In a **fourth PowerShell window**:

```powershell
cd "d:\wamp64\www\projects\sam\ELD PROJECT REBOOT\eld_platform"
pnpm --filter ingest-worker exec tsx src/replay.ts
```

What it does:
- Generates 30 fake packets along a Houston route
- Sends each one through parser → DB → Soketi
- Sleeps 0.5s between packets (so you can watch them appear)

While it runs:
- Switch to the browser tab on `/map`
- A green dot should appear in Houston and **move** every half-second
- Click **Devices → 88X150380033 → Details** — recent events list will fill up

When the script finishes (after ~15 seconds), the last position stays on the map. You can re-run the replay any time.

> **Pro tip:** Hit `Ctrl+R` in the browser if the dot doesn't show up — the initial map markers come from the database; live updates come via Soketi.

🎉 **You now have a fully functional local ELD platform.**

---

## Step 13 — Troubleshooting

### `pnpm install` fails with "ERR_PNPM_PEER_DEP_ISSUES" or "ENOENT"
Delete `node_modules` and lockfile, retry:
```powershell
Remove-Item -Recurse -Force node_modules, pnpm-lock.yaml -ErrorAction SilentlyContinue
pnpm install
```

### `docker compose up` says "Cannot connect to the Docker daemon"
Docker Desktop isn't running. Open Docker Desktop from Start menu, wait for the whale icon to stop animating, retry.

### Postgres container keeps restarting
Port 5432 is already used (you probably have a local Postgres install from another project).
- Either stop the local one: `Stop-Service postgresql-x64-16` (as admin)
- Or change the port in `docker-compose.yml` from `"5432:5432"` to `"5433:5432"` and update `DATABASE_URL` in `.env` to use port `5433`.

### `pnpm --filter @eld/db db:migrate` fails with "P1001: Can't reach database"
Postgres isn't ready yet. Wait 15 seconds and retry. If still failing:
```powershell
docker compose logs postgres --tail=50
```
Look for `database system is ready to accept connections`.

### Portal shows "Internal Server Error"
Check the portal terminal — it will print the exact error. 90% of the time it's:
- Database not migrated → re-run step 8
- `.env` missing a value → re-check step 6
- Prisma client out of date → `pnpm --filter @eld/db db:generate`

### Ingest worker says "EADDRINUSE :::2404"
Another process is on port 2404. Find and kill it:
```powershell
Get-NetTCPConnection -LocalPort 2404 | Select-Object OwningProcess
Stop-Process -Id <pid-from-above> -Force
```
Or change `INGEST_TCP_PORT` in `.env` to something free like `2405`.

### "Login failed" with the seeded password
You probably set `SEED_ADMIN_PASSWORD` differently than you remember. Reset:
```powershell
$env:SEED_ADMIN_PASSWORD = "DevAdmin123!"
pnpm --filter @eld/db db:seed
```
The seed is idempotent — it'll just update the existing admin's password hash.

### Map shows no tiles (just gray)
You skipped `MAPTILER_API_KEY`. The map falls back to MapLibre's free demo tiles, which sometimes rate-limit. Either:
- Get a free key at https://www.maptiler.com/cloud and add it to `.env`, then restart the portal
- Or ignore — map markers still work fine

### Live updates don't appear (replay runs but no dot moves)
Soketi container may have crashed:
```powershell
docker compose ps
docker compose logs soketi --tail=30
docker compose restart soketi
```

### Want to wipe all local data and start fresh
```powershell
docker compose down -v       # ⚠ deletes the Postgres volume
# then redo step 7 onward
```

### Hot reload stops working after a while
Stop the portal (Ctrl+C in its terminal) and restart with `pnpm --filter portal dev`. Next.js dev server occasionally gets confused after big file changes.

---

## Step 14 — Daily workflow cheatsheet

Once you've done the setup, your daily routine is just:

```powershell
# Terminal 1 (infra — start once a day, leave running)
cd "d:\wamp64\www\projects\sam\ELD PROJECT REBOOT\eld_platform"
docker compose up -d postgres redis soketi

# Terminal 2 (ingest worker)
pnpm --filter ingest-worker dev

# Terminal 3 (portal)
pnpm --filter portal dev

# Open http://localhost:3000 — log in
```

To stop everything at end of day:
```powershell
# Ctrl+C in terminals 2 and 3
docker compose stop      # in terminal 1 — pauses containers, keeps data
```

To resume next day: just `docker compose start` instead of `up -d`.

### Useful one-liners

| Task | Command |
|---|---|
| Open Prisma Studio (visual DB browser) | `pnpm --filter @eld/db exec prisma studio` |
| Replay sample drive | `pnpm --filter ingest-worker exec tsx src/replay.ts` |
| Tail Postgres logs | `docker compose logs -f postgres` |
| Reset DB | `pnpm --filter @eld/db exec prisma migrate reset` |
| Check what's listening | `Get-NetTCPConnection -State Listen \| Where-Object LocalPort -in 3000,2404,5432,6001,6379` |
| Run unit tests (parser) | `pnpm --filter ingest-worker test` |
| Type-check everything | `pnpm -r typecheck` |

### When to restart what

| You changed... | Restart this |
|---|---|
| `.env` | Both portal and ingest-worker terminals |
| `prisma/schema.prisma` | Run `db:migrate`, then portal restarts itself |
| `apps/portal/src/**` | Nothing — Next.js hot-reloads |
| `apps/ingest-worker/src/**` | Nothing — `tsx watch` hot-reloads |
| `packages/shared/src/**` | Both portal and ingest-worker terminals |
| `docker-compose.yml` | `docker compose up -d` again |

---

## What about the Flutter driver app?

That's a separate setup (Android Studio + Flutter SDK) — see **[deployment-upgrade.md § Step 16](deployment-upgrade.md#step-16--build-the-android-apk-on-your-pc)**.

For local testing of the BLE → portal flow without a real device, the **replay** script in step 12 is enough — it simulates packets coming through the same code path.

---

**You're set.** Browser at `http://localhost:3000`, edits hot-reload, replay anytime. When you push code to GitHub and deploy via the [deployment-upgrade.md](deployment-upgrade.md) playbook, the production VPS runs the exact same stack.
