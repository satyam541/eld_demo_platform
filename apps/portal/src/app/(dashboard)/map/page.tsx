import { auth } from '@/auth';
import { prisma } from '@eld/db';
import LiveMap from './LiveMap';

export default async function MapPage() {
    const session = await auth();
    const fleetId = (session?.user as { fleetId?: string })?.fleetId;
    if (!fleetId) return <div className="p-6">No fleet associated.</div>;

    // Latest known location per device (for initial markers)
    const devices = await prisma.device.findMany({
        where: { fleetId },
        include: { vehicle: true },
    });

    const latest = await Promise.all(
        devices.map(async (d) => {
            const loc = await prisma.location.findFirst({
                where: { deviceId: d.id },
                orderBy: { ts: 'desc' },
            });
            return loc
                ? {
                    deviceSerial: d.serialNumber,
                    vehicleId: d.vehicleId,
                    vehicleLabel: d.vehicle?.name ?? d.serialNumber,
                    lat: loc.lat,
                    lon: loc.lon,
                    speedMph: loc.speedMph,
                    heading: loc.heading,
                    ignition: loc.ignition,
                    ts: loc.ts.toISOString(),
                }
                : null;
        })
    );

    return (
        <LiveMap
            fleetId={fleetId}
            initial={latest.filter((x): x is NonNullable<typeof x> => x !== null)}
            pusherKey={process.env.NEXT_PUBLIC_SOKETI_KEY ?? 'dev_key'}
            pusherHost={process.env.NEXT_PUBLIC_SOKETI_HOST ?? 'localhost'}
            pusherPort={Number(process.env.NEXT_PUBLIC_SOKETI_PORT ?? 6001)}
            mapTilerKey={process.env.NEXT_PUBLIC_MAPTILER_KEY ?? ''}
        />
    );
}
