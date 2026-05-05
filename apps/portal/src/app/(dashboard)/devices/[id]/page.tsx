import { prisma } from '@eld/db';
import { auth } from '@/auth';
import { notFound } from 'next/navigation';

export default async function DeviceDetail({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const session = await auth();
    const fleetId = (session?.user as { fleetId?: string })?.fleetId;
    const device = await prisma.device.findFirst({
        where: { id, fleetId },
        include: { vehicle: true, fleet: true },
    });
    if (!device) notFound();

    const events = await prisma.event.findMany({
        where: { deviceId: device.id },
        orderBy: { ts: 'desc' },
        take: 50,
    });
    const lastLoc = await prisma.location.findFirst({
        where: { deviceId: device.id },
        orderBy: { ts: 'desc' },
    });

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-semibold">
                    Device <span className="font-mono">{device.serialNumber}</span>
                </h1>
                <p className="text-gray-600">
                    {device.model} · {device.status} · vehicle:{' '}
                    {device.vehicle?.label ?? '—'}
                </p>
            </div>

            {lastLoc && (
                <section className="rounded-lg bg-white shadow p-4">
                    <h2 className="font-semibold mb-2">Last known location</h2>
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                        <dt>Time</dt>
                        <dd>{new Date(lastLoc.ts).toLocaleString()}</dd>
                        <dt>Coords</dt>
                        <dd>
                            {lastLoc.lat.toFixed(5)}, {lastLoc.lon.toFixed(5)}
                        </dd>
                        <dt>Speed</dt>
                        <dd>{lastLoc.speedMph ?? 0} mph</dd>
                        <dt>Ignition</dt>
                        <dd>{lastLoc.ignition ? 'ON' : 'OFF'}</dd>
                    </dl>
                </section>
            )}

            <section className="rounded-lg bg-white shadow">
                <h2 className="px-4 py-3 font-semibold border-b">Recent events</h2>
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left">
                        <tr>
                            <th className="px-4 py-2">Time</th>
                            <th className="px-4 py-2">Reason</th>
                            <th className="px-4 py-2">Format CRC</th>
                        </tr>
                    </thead>
                    <tbody>
                        {events.map((e) => (
                            <tr key={e.id} className="border-t">
                                <td className="px-4 py-2">
                                    {new Date(e.ts).toLocaleString()}
                                </td>
                                <td className="px-4 py-2">
                                    {e.reasonText ?? `code:${e.reasonCode ?? '?'}`}
                                </td>
                                <td className="px-4 py-2 font-mono">{e.formatCrc ?? ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
