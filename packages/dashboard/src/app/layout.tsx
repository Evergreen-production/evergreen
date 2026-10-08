import './globals.css';
import React from 'react';

export const metadata = {
  title: 'Evergreen | Soroban TTL Monitoring & Keeper Dashboard',
  description: 'Automated state-archival and TTL extension keeper service for Soroban smart contracts',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-950 text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
