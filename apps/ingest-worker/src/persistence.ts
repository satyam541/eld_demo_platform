import { prisma } from '@eld/db';
import type { GeometrisCsvPacket } from '@eld/shared/schemas';
import { logger } from './logger.js';

/**
 * Persist a parsed packet:
 *  1) upsert the device (auto-provision unknown devices for safety)
 *  2) insert an Event row with full payload
 *  3) insert a Location row (only if lat/lon present)
 *  4) update device.lastSeenAt
 */
export async function persistPacket(packet: GeometrisCsvPacket): Promise<{
  deviceId: string;
  fleetId: string;
  vehicleId: string | null;
}> {
  const ts = new Date(packet.eventUnixTime * 1000);

  // Auto-provision: if device is unseen, attach it to the first fleet.
  // Production should fail-closed instead — but for MVP we want any
  // packet that lands to be visible.
  let device = await prisma.device.findUnique({
    where: { serialNumber: packet.serialNumber },
  });

  if (!device) {
    const fleet =
      (await prisma.fleet.findFirst({ orderBy: { createdAt: 'asc' } })) ??
      (await prisma.fleet.create({
        data: { id: 'pacific-eld', name: 'Pacific ELD' },
      }));
    device = await prisma.device.create({
      data: {
        fleetId: fleet.id,
        serialNumber: packet.serialNumber,
        model: 'whereQube',
        status: 'ACTIVE',
      },
    });
    logger.warn(
      { serialNumber: packet.serialNumber, deviceId: device.id },
      'auto-provisioned unknown device'
    );
  }

  await prisma.event.create({
    data: {
      deviceId: device.id,
      ts,
      reasonText: packet.reasonText,
      reasonCode: packet.reasonCode,
      formatCrc: packet.formatCrc,
      rawCsv: packet.raw,
      payload: packet as unknown as object,
    },
  });

  if (packet.latitude !== null && packet.longitude !== null) {
    await prisma.location.create({
      data: {
        ts,
        deviceId: device.id,
        lat: packet.latitude,
        lon: packet.longitude,
        speedMph: packet.speedMph,
        heading: packet.heading,
        ignition: packet.ignition,
        odometerMi: packet.odometerMiles,
        numSats: packet.numSatellites,
        reasonText: packet.reasonText,
        reasonCode: packet.reasonCode,
      },
    });
  }

  await prisma.device.update({
    where: { id: device.id },
    data: { lastSeenAt: ts },
  });

  return {
    deviceId: device.id,
    fleetId: device.fleetId,
    vehicleId: device.vehicleId,
  };
}
