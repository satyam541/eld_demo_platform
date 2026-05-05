import { prisma } from '@eld/db';
import { auth } from '@/auth';

export default async function TripsPage() {
    const session = await auth();
    const fleetId = (session?.user as { fleetId?: string })?.fleetId;
    if (!fleetId) return null;
    const trips = await prisma.trip.findMany({
        where: { device: { fleetId } },
        include: { device: true, driver: true },
        orderBy: { startedAt: 'desc' },
        take: 100,
    });

    return (
        <div className="p-6">
            <h1 className="text-2xl font-semibold mb-4">Trips</h1>
            <div className="overflow-x-auto rounded-lg bg-white shadow">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 text-left">
                        <tr>
                            <th className="px-4 py-2">Start</th>
                            <th className="px-4 py-2">End</th>
                            <th className="px-4 py-2">Device</th>
                            <th className="px-4 py-2">Driver</th>
                            <th className="px-4 py-2">Distance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {trips.map((t) => (
                            <tr key={t.id} className="border-t">
                                <td className="px-4 py-2">
                                    {new Date(t.startedAt).toLocaleString()}
                                </td>
                                <td className="px-4 py-2">
                                    {t.endedAt ? new Date(t.endedAt).toLocaleString() : '—'}
                                </td>
                                <td className="px-4 py-2 font-mono">{t.device.serialNumber}</td>
                                <td className="px-4 py-2">{t.driver?.name ?? '—'}</td>
                                <td className="px-4 py-2">{t.distanceMi.toFixed(1)} mi</td>
                            </tr>
                        ))}
                        {trips.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                                    No trips computed yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
