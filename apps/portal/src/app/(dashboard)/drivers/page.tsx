import { prisma } from '@eld/db';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';

async function createDriver(formData: FormData) {
    'use server';
    const session = await auth();
    const fleetId = (session?.user as { fleetId?: string })?.fleetId;
    if (!fleetId) return;
    const name = String(formData.get('name') ?? '').trim();
    const license = String(formData.get('license') ?? '').trim() || null;
    if (!name) return;
    await prisma.driver.create({ data: { fleetId, name, licenseNumber: license } });
    revalidatePath('/drivers');
}

export default async function DriversPage() {
    const session = await auth();
    const fleetId = (session?.user as { fleetId?: string })?.fleetId;
    if (!fleetId) return null;
    const drivers = await prisma.driver.findMany({ where: { fleetId } });

    return (
        <div className="p-6 space-y-6">
            <h1 className="text-2xl font-semibold">Drivers</h1>
            <form
                action={createDriver}
                className="rounded-lg bg-white shadow p-4 grid grid-cols-1 md:grid-cols-3 gap-3"
            >
                <input name="name" required placeholder="Name *" className="rounded border px-3 py-2" />
                <input name="license" placeholder="License #" className="rounded border px-3 py-2" />
                <button className="rounded bg-brand-600 hover:bg-brand-700 text-white px-4 py-2">
                    Add driver
                </button>
            </form>
            <div className="overflow-x-auto rounded-lg bg-white shadow">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 text-left">
                        <tr>
                            <th className="px-4 py-2">Name</th>
                            <th className="px-4 py-2">License</th>
                        </tr>
                    </thead>
                    <tbody>
                        {drivers.map((d) => (
                            <tr key={d.id} className="border-t">
                                <td className="px-4 py-2">{d.name}</td>
                                <td className="px-4 py-2">{d.licenseNumber ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
