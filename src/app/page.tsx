'use client';

import { useState, useEffect } from 'react';
import PlayerTable from '@/components/PlayerTable';

function LastUpdate() {
  const [lastSnapshot, setLastSnapshot] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then((data) => setLastSnapshot(data.lastSnapshot))
      .catch(() => {});
  }, []);

  if (!lastSnapshot) return <span className="text-xs text-zinc-600">Données mises à jour 2x/jour</span>;

  const date = new Date(lastSnapshot);
  const formatted = date.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="text-right">
      <div className="text-[10px] text-zinc-600 uppercase tracking-wider">Dernière MAJ</div>
      <div className="text-xs text-zinc-400">{formatted}</div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="border-b border-orange-500/30 bg-black/50 backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              MFL <span className="text-orange-500">Scout</span>
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">Tableau de progression des joueurs</p>
          </div>
          <LastUpdate />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[1400px] mx-auto px-6 py-6">
        <PlayerTable />
      </main>
    </div>
  );
}
