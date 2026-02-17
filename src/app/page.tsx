import { Activity } from 'lucide-react';
import PlayerTable from '@/components/PlayerTable';

export default function Home() {
  return (
    <div className="min-h-screen glow-accent">
      {/* Header */}
      <header className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
              <Activity size={18} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">
                MFL Scout
              </h1>
              <p className="text-[11px] text-zinc-500 -mt-0.5">
                Player Progression Dashboard
              </p>
            </div>
          </div>
          <div className="text-xs text-zinc-600">
            Powered by MFL API
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6 relative z-10">
        <PlayerTable />
      </main>
    </div>
  );
}
