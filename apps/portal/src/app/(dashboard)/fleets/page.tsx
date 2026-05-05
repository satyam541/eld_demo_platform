import { prisma } from '@eld/db';
import { auth } from '@/auth';

export default async function FleetsPage() {
    const session = await auth();
    const fleetId = (session?.user as { fleetId?: string })?.fleetId;
    const fleets = await prisma.fleet.findMany({
        where: fleetId ? { id: fleetId } : {},
        include: {
            _count: { select: { devices: true, vehicles: true, drivers: true, users: true } },
        },
    });
    return (
        <div className="p-6">
            <h1 className="text-2xl font-semibold mb-4">Fleets</h1>
            <div className="overflow-x-auto rounded-lg bg-white shadow">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 text-left">
                        <tr>
                            <th className="px-4 py-2">Name</th>
                            <th className="px-4 py-2">Devices</th>
                            <th className="px-4 py-2">Vehicles</th>
                            <th className="px-4 py-2">Drivers</th>
                            <th className="px-4 py-2">Users</th>
                        </tr>
                    </thead>
                    <tbody>
                        {fleets.map((f) => (
                            <tr key={f.id} className="border-t">
                                <td className="px-4 py-2">{f.name}</td>
                                <td className="px-4 py-2">{f._count.devices}</td>
                                <td className="px-4 py-2">{f._count.vehicles}</td>
                                <td className="px-4 py-2">{f._count.drivers}</td>
                                <td className="px-4 py-2">{f._count.users}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
