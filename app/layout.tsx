import type { Metadata } from 'next';
import { Inter, Outfit } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const outfit = Outfit({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-outfit' });

export const metadata: Metadata = {
  title: 'AnnaSetu — Procurement & Queue Management',
  description:
    'Book your procurement slot, skip the physical queue, and track your token in real time.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body className="font-body min-h-screen antialiased">{children}</body>
    </html>
  );
}
