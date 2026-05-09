import { auth } from '@/auth';
import { prisma } from '@eld/db';
import Link from 'next/link';

export default async function DevicesPage() {
    const session = await auth();
    const fleetId = (session?.user as { fleetId?: string })?.fleetId;
    if (!fleetId) return null;

    const devices = await prisma.device.findMany({
        where: { fleetId },
        include: { vehicle: true },
        orderBy: { lastSeenAt: 'desc' },
    });

    return (
        <div className="p-6">
            <h1 className="text-2xl font-semibold mb-4">Devices</h1>
            <div className="overflow-x-auto rounded-lg bg-white shadow">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 text-left">
                        <tr>
                            <th className="px-4 py-2">Serial</th>
                            <th className="px-4 py-2">Model</th>
                            <th className="px-4 py-2">Vehicle</th>
                            <th className="px-4 py-2">Status</th>
                            <th className="px-4 py-2">Last seen</th>
                            <th className="px-4 py-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {devices.map((d) => (
                            <tr key={d.id} className="border-t">
                                <td className="px-4 py-2 font-mono">{d.serialNumber}</td>
                                <td className="px-4 py-2">{d.model}</td>
                                <td className="px-4 py-2">{d.vehicle?.name ?? '—'}</td>
                                <td className="px-4 py-2">{d.status}</td>
                                <td className="px-4 py-2">
                                    {d.lastSeenAt
                                        ? new Date(d.lastSeenAt).toLocaleString()
                                        : 'never'}
                                </td>
                                <td className="px-4 py-2">
                                    <Link
                                        className="text-brand-600 hover:underline"
                                        href={`/devices/${d.id}`}
                                    >
                                        Details
                                    </Link>
                                </td>
                            </tr>
                        ))}
                        {devices.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                                    No devices yet — connect your whereQube to see it here.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
