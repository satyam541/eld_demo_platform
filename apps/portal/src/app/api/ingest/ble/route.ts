import { NextResponse } from 'next/server';
import { prisma } from '@eld/db';
import { GeometrisBlePacketSchema, channels } from '@eld/shared/schemas';
import Pusher from 'pusher';

const pusher = (() => {
  const host = process.env.SOKETI_HOST ?? 'http://localhost:6001';
  const u = new URL(host);
  return new Pusher({
    appId: process.env.SOKETI_APP_ID ?? 'eld',
    key: process.env.SOKETI_APP_KEY ?? 'dev_key',
    secret: process.env.SOKETI_APP_SECRET ?? 'dev_secret',
    host: u.hostname,
    port: u.port || (u.protocol === 'https:' ? '443' : '80'),
    useTLS: u.protocol === 'https:',
  });
})();

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = GeometrisBlePacketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 400 });
  }
  const pkt = parsed.data;

  let device = await prisma.device.findUnique({ where: { serialNumber: pkt.serialNumber } });
  if (!device) {
    const fleet = (await prisma.fleet.findFirst({ orderBy: { createdAt: 'asc' } })) ??
      (await prisma.fleet.create({ data: { id: 'pacific-eld', name: 'Pacific ELD' } }));
    device = await prisma.device.create({
      data: { fleetId: fleet.id, serialNumber: pkt.serialNumber, model: 'whereQube', status: 'ACTIVE' },
    });
  }

  const ts = pkt.locTime ? new Date(pkt.locTime * 1000) : new Date(pkt.receivedAt);
  const speedMph = pkt.speedKph != null ? pkt.speedKph * 0.621371 : null;

  await prisma.event.create({
    data: { deviceId: device.id, ts, reasonText: 'BLE_PACKET', rawCsv: JSON.stringify(pkt), formatCrc: 'BLE', payload: pkt as unknown as object },
  });

  if (pkt.latitude !== null && pkt.longitude !== null) {
    await prisma.location.create({
      data: { ts, deviceId: device.id, lat: pkt.latitude, lon: pkt.longitude, speedMph,
        odometerMi: pkt.odometerKm != null ? pkt.odometerKm * 0.621371 : null },
    });
    await pusher.trigger(channels.fleetLocations(device.fleetId), 'location', {
      deviceSerial: pkt.serialNumber, vehicleId: device.vehicleId,
      lat: pkt.latitude, lon: pkt.longitude, speedMph, heading: null, ignition: null,
      reason: 'BLE_PACKET', ts: ts.toISOString(),
    });
  }

  await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: ts } });
  return NextResponse.json({ ok: true });
}
