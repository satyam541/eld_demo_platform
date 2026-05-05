/* eslint-disable no-console */
/**
 * Replay CLI — pipes the documented sample packet (and any extras) through
 * the parser → DB → Soketi exactly as the live TCP listener would, so we
 * can develop without the device.
 *
 * Usage:
 *   pnpm --filter ingest-worker replay
 *   pnpm --filter ingest-worker replay -- ./samples/my-capture.csv
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCsvPacket } from './parser.js';
import { persistPacket } from './persistence.js';
import { publishLiveLocation } from './realtime.js';
import { GeometrisCsvPacketSchema } from '@eld/shared/schemas';
import { logger } from './logger.js';

const SAMPLE_PACKET =
  'F001,88X150380033,IGN_OFF,1714694400,29.85657,-95.64319,77,0,0,114,0,0,32376.1,7,,35198,10449,,,,32372.0T,1N4AL3AP3GN360245,,0:0,,,,';

async function main() {
  const fileArg = process.argv[2];
  let lines: string[];
  if (fileArg) {
    const path = resolve(fileArg);
    if (!existsSync(path)) {
      console.error(`File not found: ${path}`);
      process.exit(1);
    }
    lines = readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim() !== '');
  } else {
    // Generate a synthetic drive: 30 packets along a Houston route.
    lines = synthDrive(30);
  }

  for (const [i, line] of lines.entries()) {
    try {
      const parsed = parseCsvPacket(line);
      const v = GeometrisCsvPacketSchema.safeParse(parsed);
      if (!v.success) {
        logger.warn({ issues: v.error.issues }, 'validation failed');
        continue;
      }
      const meta = await persistPacket(v.data);
      if (v.data.latitude !== null && v.data.longitude !== null) {
        await publishLiveLocation(meta.fleetId, {
          deviceSerial: v.data.serialNumber,
          vehicleId: meta.vehicleId,
          lat: v.data.latitude,
          lon: v.data.longitude,
          speedMph: v.data.speedMph,
          heading: v.data.heading,
          ignition: v.data.ignition,
          reason: v.data.reasonText,
          ts: new Date(v.data.eventUnixTime * 1000).toISOString(),
        });
      }
      logger.info(
        { i, sn: v.data.serialNumber, reason: v.data.reasonText },
        'replayed'
      );
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      logger.error({ e, line }, 'replay error');
    }
  }
  logger.info('replay complete');
  process.exit(0);
}

function synthDrive(n: number): string[] {
  const out: string[] = [];
  const startTs = Math.floor(Date.now() / 1000) - n * 60;
  // Move ~0.001 deg per step ≈ 100m
  for (let i = 0; i < n; i++) {
    const ts = startTs + i * 60;
    const lat = (29.85 + i * 0.001).toFixed(5);
    const lon = (-95.64 + i * 0.001).toFixed(5);
    const speed = i === 0 || i === n - 1 ? 0 : 35 + (i % 10);
    const ign = i === 0 ? 0 : i === n - 1 ? 0 : 1;
    const reason =
      i === 0 ? 'IGN_ON' : i === n - 1 ? 'IGN_OFF' : 'GPS_PERIODIC';
    const odo = (32376.1 + i * 0.05).toFixed(1);
    out.push(
      [
        'F001', // 65 FORMAT_CRC
        '88X150380033', // 28 SERIAL
        reason, // 9 REASON_TEXT
        ts, // 36 EVENT_UNIX_TIME
        lat, // 3 LAT
        lon, // 4 LON
        77 + i, // 7 UNIQUE_ID
        0, // 8 LOCATION_AGE
        ign, // 11 IGNITION
        60, // 12 DURATION
        speed, // 14 SPEED_MPH
        90, // 17 HEADING
        odo, // 24 ODOMETER
        7, // 50 NUM_SATS
        '', // 56 FENCE_ID
        35198 + i * 60, // 51 IGN_ON_DUR
        10449, // 55 TOTAL_IDLE
        '',
        '',
        '',
        odo + 'T',
        '1N4AL3AP3GN360245',
        '',
        '0:0',
        '',
        '',
        '',
        '',
      ].join(',')
    );
  }
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
