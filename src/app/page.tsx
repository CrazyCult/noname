'use client';

import { useState, useEffect, useCallback } from 'react';
import PlayerTable from '@/components/PlayerTable';
import type { ProgressionInterval } from '@/types/mfl';
import { RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

// ── Types ──────────────────────────────────────────────

interface IntervalStats {
  totalPlayers: number;
  playersProgressed: number;
  lastUpdated: string | null;
}

interface CrawlLog {
  id: number;
  type: string;
  interval: ProgressionInterval | null;
  startedAt: string;
  finishedAt: string | null;
  playersProcessed: number;
  playersProgressed: number;
  status: 'success' | 'error' | 'running';
}

interface CurrentCrawl {
  type: string;
  interval: ProgressionInterval | null;
  startedAt: string;
}

interface StatusResponse {
  intervals: Partial<Record<ProgressionInterval, IntervalStats>>;
  recentCrawls: CrawlLog[];
  currentCrawl: CurrentCrawl | null;
}

// ── Utilitaires ──────────────────────────────────────────

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);
  if (diffMin < 1) return 'à l\'instant';
  if (diffMin < 60) return `${diffMin}min`;
  if (diffH < 24) return `${diffH}h`;
  return `${diffD}j`;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return '...';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return min > 0 ? `${min}m${sec}s` : `${sec}s`;
}

const INTERVAL_LABEL: Record<string, string> = {
  '24H': '24H',
  'WEEK': 'Semaine',
  'MONTH': 'Mois',
  'CURRENT_SEASON': 'Saison',
  'ALL': 'Total',
};

// ── Composant Header ──────────────────────────────────────

function StatusHeader({ status, loading }: { status: StatusResponse | null; loading: boolean }) {
  if (loading && !status) {
    return <div className="flex items-center gap-2 text-zinc-600 text-xs"><Loader2 size={12} className="animate-spin" />Chargement...</div>;
  }

  const currentCrawl = status?.currentCrawl;
  const recentCrawls = status?.recentCrawls ?? [];

  return (
    <div className="flex flex-col items-end gap-1.5">

      {/* Crawl en cours */}
      {currentCrawl && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/30">
          <Loader2 size={11} className="animate-spin text-orange-400" />
          <span className="text-[11px] text-orange-300 font-medium">
            Crawl en cours — {currentCrawl.interval ? INTERVAL_LABEL[currentCrawl.interval] : currentCrawl.type}
          </span>
          <span className="text-[10px] text-orange-500/70">démarré {formatRelative(currentCrawl.startedAt)}</span>
        </div>
      )}

      {/* 5 derniers crawls */}
      {recentCrawls.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-zinc-600 uppercase tracking-wider mr-1">Derniers crawls</span>
          {recentCrawls.map((log) => (
            <div
              key={log.id}
              title={`${log.interval ? INTERVAL_LABEL[log.interval] : log.type} — ${formatTime(log.startedAt)} — durée: ${formatDuration(log.startedAt, log.finishedAt)} — ${log.playersProgressed.toLocaleString()} progressés`}
              className="flex items-center gap-1 px-2 py-1 rounded bg-white/[0.03] border border-white/[0.06] hover:border-orange-500/20 transition-colors cursor-default"
            >
              {log.status === 'success'
                ? <CheckCircle size={9} className="text-emerald-500" />
                : <AlertCircle size={9} className="text-red-500" />
              }
              <span className="text-[10px] font-medium text-zinc-300">
                {log.interval ? INTERVAL_LABEL[log.interval] : log.type}
              </span>
              <span className="text-[9px] text-zinc-600">{formatRelative(log.startedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page principale ──────────────────────────────────────

export default function Home() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const loadStatus = useCallback(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then((data) => { setStatus(data); setLoadingStatus(false); })
      .catch(() => setLoadingStatus(false));
  }, []);

  useEffect(() => {
    loadStatus();
    const t = setInterval(loadStatus, 30_000);
    return () => clearInterval(t);
  }, [loadStatus]);

  // Compteurs OVR >= 1 par intervalle à passer au PlayerTable
  const intervalStats = status?.intervals ?? {};

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="border-b border-orange-500/30 bg-black/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between gap-6">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              MFL <span className="text-orange-500">Scout</span>
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">Tableau de progression des joueurs</p>
          </div>
          <StatusHeader status={status} loading={loadingStatus} />
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6">
        <PlayerTable intervalStats={intervalStats} />
      </main>
    </div>
  );
}
