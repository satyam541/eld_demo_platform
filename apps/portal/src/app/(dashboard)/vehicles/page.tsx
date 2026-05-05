import { prisma } from '@eld/db';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';

async function createVehicle(formData: FormData) {
    'use server';
    const session = await auth();
    const fleetId = (session?.user as { fleetId?: string })?.fleetId;
    if (!fleetId) return;
    const label = String(formData.get('label') ?? '').trim();
    const vin = String(formData.get('vin') ?? '').trim() || null;
    const plate = String(formData.get('plate') ?? '').trim() || null;
    if (!label) return;
    await prisma.vehicle.create({ data: { fleetId, label, vin, plate } });
    revalidatePath('/vehicles');
}

export default async function VehiclesPage() {
    const session = await auth();
    const fleetId = (session?.user as { fleetId?: string })?.fleetId;
    if (!fleetId) return null;
    const vehicles = await prisma.vehicle.findMany({
        where: { fleetId },
        include: { device: true },
    });

    return (
        <div className="p-6 space-y-6">
            <h1 className="text-2xl font-semibold">Vehicles</h1>

            <form
                action={createVehicle}
                className="rounded-lg bg-white shadow p-4 grid grid-cols-1 md:grid-cols-4 gap-3"
            >
                <input
                    name="label"
                    required
                    placeholder="Label *"
                    className="rounded border px-3 py-2"
                />
                <input
                    name="vin"
                    placeholder="VIN"
                    className="rounded border px-3 py-2"
                />
                <input
                    name="plate"
                    placeholder="Plate"
                    className="rounded border px-3 py-2"
                />
                <button className="rounded bg-brand-600 hover:bg-brand-700 text-white px-4 py-2">
                    Add vehicle
                </button>
            </form>

            <div className="overflow-x-auto rounded-lg bg-white shadow">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 text-left">
                        <tr>
                            <th className="px-4 py-2">Label</th>
                            <th className="px-4 py-2">VIN</th>
                            <th className="px-4 py-2">Plate</th>
                            <th className="px-4 py-2">Device</th>
                        </tr>
                    </thead>
                    <tbody>
                        {vehicles.map((v) => (
                            <tr key={v.id} className="border-t">
                                <td className="px-4 py-2">{v.label}</td>
                                <td className="px-4 py-2 font-mono">{v.vin ?? ''}</td>
                                <td className="px-4 py-2">{v.plate ?? ''}</td>
                                <td className="px-4 py-2 font-mono">
                                    {v.device?.serialNumber ?? '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
