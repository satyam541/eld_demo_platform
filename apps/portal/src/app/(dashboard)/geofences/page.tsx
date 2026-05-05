import { prisma } from '@eld/db';
import { auth } from '@/auth';

export default async function GeofencesPage() {
    const session = await auth();
    const fleetId = (session?.user as { fleetId?: string })?.fleetId;
    if (!fleetId) return null;
    const fences = await prisma.geofence.findMany({ where: { fleetId } });
    return (
        <div className="p-6">
            <h1 className="text-2xl font-semibold mb-4">Geofences</h1>
            <div className="rounded-lg bg-white shadow p-4 text-sm text-gray-600">
                {fences.length === 0
                    ? 'No geofences yet — drawing UI coming next sprint. Use the Geometris portal to push fence definitions to the device until then.'
                    : `${fences.length} fence(s)`}
            </div>
        </div>
    );
}
