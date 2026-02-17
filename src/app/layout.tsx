import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MFL Scout',
  description: 'Track MFL player stats and progressions.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body>{children}</body>
    </html>
  );
}
