import type { GeometrisCsvPacket } from '@eld/shared/schemas';

/**
 * Geometris CSV packet parser.
 *
 * The device transmits one CSV record per cellular event. Field order is
 * controlled by parameter 12 on the device. The default layout is:
 *
 *   65.28.9.36.3.4.7.8.11.12.14.17.24.50.56.51.55.70.71.72.73.74.75.76.77.80.81.82
 *
 * Source-of-truth: docs/vendor/geometris-packet-format.md
 *
 * If a fleet customizes parameter 12, the layout array must be passed
 * explicitly. The first 4 items are MANDATORY for Geometris-SIM
 * customers and must be one of:
 *   - 65.28.9.36   (FORMAT_CRC, SERIAL, REASON_TEXT, EVENT_UNIX_TIME)
 *   - 65.28.10.36  (FORMAT_CRC, SERIAL, REASON_CODE, EVENT_UNIX_TIME)
 */

export const DEFAULT_PARAM_12: number[] = [
  65, 28, 9, 36, 3, 4, 7, 8, 11, 12, 14, 17, 24, 50, 56, 51, 55, 70,
  71, 72, 73, 74, 75, 76, 77, 80, 81, 82,
];

export class PacketParseError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message);
    this.name = 'PacketParseError';
  }
}

const num = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const t = v.trim();
  if (t === '') return null;
  // strip Geometris "T"/"E" suffix on ECU odometer (T = trusted, E = estimated)
  const cleaned = t.replace(/[TE]$/i, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const int = (v: string | undefined): number | null => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};

const str = (v: string | undefined): string | null => {
  if (v === undefined) return null;
  const t = v.trim();
  return t === '' ? null : t;
};

const bool = (v: string | undefined): boolean | null => {
  const n = int(v);
  if (n === null) return null;
  return n !== 0;
};

/** Parse a single CSV line per the supplied param-12 layout. */
export function parseCsvPacket(
  line: string,
  layout: number[] = DEFAULT_PARAM_12
): GeometrisCsvPacket {
  const raw = line.trim();
  if (raw === '') throw new PacketParseError('Empty line', raw);

  // Geometris does not quote fields — naive split is correct.
  const parts = raw.split(',');

  if (parts.length < 4) {
    throw new PacketParseError(
      `Too few fields: got ${parts.length}, expected at least 4`,
      raw
    );
  }

  // Build a Map<itemNumber, rawValue>.
  const byItem = new Map<number, string>();
  for (let i = 0; i < layout.length && i < parts.length; i++) {
    byItem.set(layout[i]!, parts[i]!);
  }

  const formatCrc = str(byItem.get(65));
  const serialNumber = str(byItem.get(28));
  const eventUnixTime =
    int(byItem.get(36)) ?? int(byItem.get(2)); // item 2 is alternate

  if (!formatCrc) {
    throw new PacketParseError('Missing FORMAT_CRC (item 65)', raw);
  }
  if (!serialNumber) {
    throw new PacketParseError('Missing SERIAL_NUMBER (item 28)', raw);
  }
  if (eventUnixTime === null) {
    throw new PacketParseError('Missing EVENT_UNIX_TIME (item 36/2)', raw);
  }

  return {
    formatCrc,
    serialNumber,
    reasonText: str(byItem.get(9)),
    reasonCode: int(byItem.get(10)),
    eventUnixTime,
    latitude: num(byItem.get(3)),
    longitude: num(byItem.get(4)),
    uniqueId: int(byItem.get(7)),
    locationAge: int(byItem.get(8)),
    ignition: bool(byItem.get(11)),
    duration: int(byItem.get(12)),
    speedMph: num(byItem.get(14)),
    heading: num(byItem.get(17)),
    odometerMiles: num(byItem.get(24)),
    numSatellites: int(byItem.get(50)),
    ignitionOnDuration: int(byItem.get(51)),
    totalIdleDuration: int(byItem.get(55)),
    fenceId: int(byItem.get(56)),
    ecuRpm: int(byItem.get(70)),
    ecuCoolantTemp: int(byItem.get(71)),
    ecuSpeedMiles: num(byItem.get(72)),
    ecuOdometerMiles: num(byItem.get(73)),
    ecuVin: str(byItem.get(74)),
    ecuFuelLevel: num(byItem.get(75)),
    dtc: str(byItem.get(76)),
    ecuThrottle: num(byItem.get(77)),
    ecuMpg: num(byItem.get(80)),
    obdTripMpg: num(byItem.get(81)),
    obdInstantMpg: num(byItem.get(82)),
    raw,
  };
}

/**
 * Stream-friendly framing. The device often sends multiple packets in
 * one TCP segment. We accumulate bytes and emit complete CSV lines on
 * `\n` or `\r\n` boundaries.
 */
export class CsvLineFramer {
  private buf = '';
  private readonly maxLineBytes = 8192;

  feed(chunk: Buffer): string[] {
    this.buf += chunk.toString('utf8');
    if (this.buf.length > this.maxLineBytes * 4) {
      // Avoid unbounded growth from a misbehaving peer.
      const tail = this.buf.lastIndexOf('\n');
      this.buf = tail >= 0 ? this.buf.slice(tail + 1) : '';
    }
    const lines: string[] = [];
    let idx: number;
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx).replace(/\r$/, '');
      this.buf = this.buf.slice(idx + 1);
      if (line.length > 0) lines.push(line);
    }
    return lines;
  }
}
