import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MFL SCOUT - Player Dashboard',
  description: 'Track MFL player stats, progressions, and discover talent with real-time data.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
      </head>
      <body style={{ backgroundColor: '#000000', margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
