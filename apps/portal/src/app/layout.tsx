import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'ELD Portal — Pacific ELD',
    description: 'Fleet management portal for Geometris ELD devices.',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
