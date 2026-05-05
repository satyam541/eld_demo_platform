import Link from 'next/link';
import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';

const nav = [
    { href: '/map', label: 'Live Map' },
    { href: '/devices', label: 'Devices' },
    { href: '/vehicles', label: 'Vehicles' },
    { href: '/drivers', label: 'Drivers' },
    { href: '/trips', label: 'Trips' },
    { href: '/geofences', label: 'Geofences' },
    { href: '/fleets', label: 'Fleets' },
];

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    if (!session?.user) redirect('/login');

    return (
        <div className="min-h-screen flex">
            <aside className="w-56 bg-brand-900 text-white flex flex-col">
                <div className="px-4 py-5 text-lg font-semibold">Pacific ELD</div>
                <nav className="flex-1 px-2 space-y-1">
                    {nav.map((n) => (
                        <Link
                            key={n.href}
                            href={n.href}
                            className="block rounded px-3 py-2 hover:bg-brand-700"
                        >
                            {n.label}
                        </Link>
                    ))}
                </nav>
                <form
                    action={async () => {
                        'use server';
                        await signOut({ redirectTo: '/login' });
                    }}
                    className="p-3 border-t border-brand-700"
                >
                    <div className="text-xs text-brand-50/80 mb-2">
                        {session.user.email}
                    </div>
                    <button className="w-full text-left text-sm text-brand-50 hover:underline">
                        Sign out
                    </button>
                </form>
            </aside>
            <main className="flex-1 min-h-screen overflow-auto">{children}</main>
        </div>
    );
}
