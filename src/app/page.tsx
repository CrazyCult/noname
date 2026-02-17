import PlayerTable from '@/components/PlayerTable';

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
            <p className="text-xs text-zinc-500 mt-0.5">Player Progression Dashboard</p>
          </div>
          <div className="text-xs text-zinc-600">
            Data refreshed 2x/day
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[1400px] mx-auto px-6 py-6">
        <PlayerTable />
      </main>
    </div>
  );
}
