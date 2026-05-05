// Shared Zod schemas used by the ingest worker, portal API, and Flutter
// BLE bridge handshake. All telemetry that crosses a process boundary
// MUST validate against one of these schemas.
//
// Source-of-truth wire format: docs/vendor/geometris-packet-format.md

import { z } from 'zod';

/**
 * Raw decoded CSV packet from the device, after splitting and field
 * mapping per parameter 12. All numeric fields are kept as numbers
 * (or null when the device emitted an empty value).
 */
export const GeometrisCsvPacketSchema = z.object({
  formatCrc: z.string().min(1),
  serialNumber: z.string().min(1),
  reasonText: z.string().nullable(),
  reasonCode: z.number().int().nullable(),
  eventUnixTime: z.number().int().nonnegative(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  uniqueId: z.number().int().nullable(),
  locationAge: z.number().int().nullable(),
  ignition: z.boolean().nullable(),
  duration: z.number().int().nullable(),
  speedMph: z.number().nullable(),
  heading: z.number().nullable(),
  odometerMiles: z.number().nullable(),
  numSatellites: z.number().int().nullable(),
  ignitionOnDuration: z.number().int().nullable(),
  totalIdleDuration: z.number().int().nullable(),
  fenceId: z.number().int().nullable(),
  ecuRpm: z.number().int().nullable(),
  ecuCoolantTemp: z.number().int().nullable(),
  ecuSpeedMiles: z.number().nullable(),
  ecuOdometerMiles: z.number().nullable(),
  ecuVin: z.string().nullable(),
  ecuFuelLevel: z.number().nullable(),
  dtc: z.string().nullable(),
  ecuThrottle: z.number().nullable(),
  ecuMpg: z.number().nullable(),
  obdTripMpg: z.number().nullable(),
  obdInstantMpg: z.number().nullable(),
  raw: z.string(),
});

export type GeometrisCsvPacket = z.infer<typeof GeometrisCsvPacketSchema>;

/**
 * BLE-decoded packet posted from the Flutter app to the portal API.
 * Source-of-truth: docs/vendor/geometris-ble-protocol.md
 */
export const GeometrisBlePacketSchema = z.object({
  serialNumber: z.string().min(1),
  receivedAt: z.string().datetime(),
  vin: z.string().nullable(),
  odometerKm: z.number().nullable(),
  rpm: z.number().int().nullable(),
  speedKph: z.number().nullable(),
  engineHours: z.number().nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  locTime: z.number().int().nullable(),
  udrvCount: z.number().int().nullable(),
  udrvReason: z.number().int().nullable(),
  rawHex: z.string(),
});

export type GeometrisBlePacket = z.infer<typeof GeometrisBlePacketSchema>;

export const channels = {
  fleetLocations: (fleetId: string) => `fleet.${fleetId}.locations`,
  fleetEvents: (fleetId: string) => `fleet.${fleetId}.events`,
  deviceTelemetry: (serialNumber: string) =>
    `private-device.${serialNumber}`,
};

export const LiveLocationEventSchema = z.object({
  deviceSerial: z.string(),
  vehicleId: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  speedMph: z.number().nullable(),
  heading: z.number().nullable(),
  ignition: z.boolean().nullable(),
  reason: z.string().nullable(),
  ts: z.string().datetime(),
});

export type LiveLocationEvent = z.infer<typeof LiveLocationEventSchema>;
