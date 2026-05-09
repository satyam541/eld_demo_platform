'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

function LoginForm() {
    const router = useRouter();
    const sp = useSearchParams();
    const next = sp.get('next') ?? '/map';
    const [email, setEmail] = useState('admin@pacificeld.com');
    const [password, setPassword] = useState('');
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const res = await signIn('credentials', { email, password, redirect: false });
        setBusy(false);
        if (res?.error) { setErr('Invalid email or password'); return; }
        router.push(next);
        router.refresh();
    };

    return (
        <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl bg-white shadow-md p-6 space-y-4">
            <h1 className="text-xl font-semibold">Pacific ELD — Sign in</h1>
            <label className="block text-sm">
                <span>Email</span>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <label className="block text-sm">
                <span>Password</span>
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button disabled={busy} className="w-full rounded bg-brand-600 hover:bg-brand-700 text-white py-2 disabled:opacity-50">
                {busy ? 'Signing in…' : 'Sign in'}
            </button>
        </form>
    );
}

export default function LoginPage() {
    return (
        <div className="min-h-screen grid place-items-center p-6">
            <Suspense><LoginForm /></Suspense>
        </div>
    );
}
