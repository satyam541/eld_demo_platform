# Local dev quick-start

```bash
# 1. Install deps
corepack enable
pnpm install

# 2. Bring up infra
cp .env.example .env
docker compose up -d postgres redis soketi

# 3. Initialize DB
pnpm --filter @eld/db db:generate
pnpm --filter @eld/db db:migrate    # creates schema
pnpm --filter @eld/db db:timescale  # makes Location a hypertable
pnpm --filter @eld/db db:seed       # seeds fleet + admin + demo vehicle

# 4. Start ingest worker
pnpm --filter ingest-worker dev
# (in another terminal) replay sample packets:
pnpm --filter ingest-worker exec tsx src/replay.ts

# 5. Start portal
pnpm --filter portal dev
# Open http://localhost:3000
# Login: admin@pacificeld.com / change_me_in_prod
```

## Flutter app (driver-side)

```bash
cd ../eld_flutter_demo_app
flutter pub get
# Android emulator (10.0.2.2 reaches the host):
flutter run --dart-define=PORTAL_URL=http://10.0.2.2:3000
# Real Android device on same Wi-Fi:
flutter run --dart-define=PORTAL_URL=http://192.168.1.X:3000
```
