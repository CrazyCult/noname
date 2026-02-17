import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MFL Scout - Player Dashboard',
  description:
    'Track MFL player stats, progressions, and discover talent with real-time data.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
