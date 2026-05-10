import type { ReactNode } from 'react';
import { getLocale } from 'next-intl/server';
import './globals.css';

export const metadata = {
  title: 'Amazon Radar',
  description: 'Niche-agnostic Amazon product radar',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
