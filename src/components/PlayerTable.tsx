'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpDown, ArrowUp, ArrowDown,
  Search, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Minus, Loader2,
  ExternalLink, RotateCcw,
} from 'lucide-react';
import type { PlayerRow, MflProgression, ProgressionInterval } from '@/types/mfl';

/* ════════════════════════════════════════════════════
   OVR WEIGHTS – EN + FR aliases
   ════════════════════════════════════════════════════ */

type OvrWeights = { pas: number; sho: number; def: number; dri: number; pac: number; phy: number };

const OVR_WEIGHTS: Record<string, OvrWeights> = {
  // Strikers
  ST:  { pas: 0.10, sho: 0.46, def: 0.00, dri: 0.29, pac: 0.10, phy: 0.05 },
  BU:  { pas: 0.10, sho: 0.46, def: 0.00, dri: 0.29, pac: 0.10, phy: 0.05 },
  // Centre Forward / Wingers
  CF:  { pas: 0.24, sho: 0.23, def: 0.00, dri: 0.40, pac: 0.13, phy: 0.00 },
  LW:  { pas: 0.24, sho: 0.23, def: 0.00, dri: 0.40, pac: 0.13, phy: 0.00 },
  RW:  { pas: 0.24, sho: 0.23, def: 0.00, dri: 0.40, pac: 0.13, phy: 0.00 },
  AG:  { pas: 0.24, sho: 0.23, def: 0.00, dri: 0.40, pac: 0.13, phy: 0.00 },
  AD:  { pas: 0.24, sho: 0.23, def: 0.00, dri: 0.40, pac: 0.13, phy: 0.00 },
  // Attacking Midfielders
  CAM: { pas: 0.34, sho: 0.21, def: 0.00, dri: 0.38, pac: 0.07, phy: 0.00 },
  AT:  { pas: 0.34, sho: 0.21, def: 0.00, dri: 0.38, pac: 0.07, phy: 0.00 },
  MOC: { pas: 0.34, sho: 0.21, def: 0.00, dri: 0.38, pac: 0.07, phy: 0.00 },
  // Central Midfielders
  CM:  { pas: 0.43, sho: 0.12, def: 0.10, dri: 0.29, pac: 0.00, phy: 0.06 },
  MC:  { pas: 0.43, sho: 0.12, def: 0.10, dri: 0.29, pac: 0.00, phy: 0.06 },
  // Wide Midfielders
  LM:  { pas: 0.43, sho: 0.12, def: 0.10, dri: 0.29, pac: 0.00, phy: 0.06 },
  RM:  { pas: 0.43, sho: 0.12, def: 0.10, dri: 0.29, pac: 0.00, phy: 0.06 },
  MG:  { pas: 0.43, sho: 0.12, def: 0.10, dri: 0.29, pac: 0.00, phy: 0.06 },
  MD:  { pas: 0.43, sho: 0.12, def: 0.10, dri: 0.29, pac: 0.00, phy: 0.06 },
  // Defensive Midfielders
  CDM: { pas: 0.28, sho: 0.00, def: 0.40, dri: 0.17, pac: 0.00, phy: 0.15 },
  MDC: { pas: 0.28, sho: 0.00, def: 0.40, dri: 0.17, pac: 0.00, phy: 0.15 },
  // Full Backs
  LB:  { pas: 0.19, sho: 0.00, def: 0.44, dri: 0.17, pac: 0.10, phy: 0.10 },
  RB:  { pas: 0.19, sho: 0.00, def: 0.44, dri: 0.17, pac: 0.10, phy: 0.10 },
  DG:  { pas: 0.19, sho: 0.00, def: 0.44, dri: 0.17, pac: 0.10, phy: 0.10 },
  DD:  { pas: 0.19, sho: 0.00, def: 0.44, dri: 0.17, pac: 0.10, phy: 0.10 },
  // Wing Backs
  LWB: { pas: 0.19, sho: 0.00, def: 0.44, dri: 0.17, pac: 0.10, phy: 0.10 },
  RWB: { pas: 0.19, sho: 0.00, def: 0.44, dri: 0.17, pac: 0.10, phy: 0.10 },
  DLG: { pas: 0.19, sho: 0.00, def: 0.44, dri: 0.17, pac: 0.10, phy: 0.10 },
  DLD: { pas: 0.19, sho: 0.00, def: 0.44, dri: 0.17, pac: 0.10, phy: 0.10 },
  // Centre Backs
  CB:  { pas: 0.05, sho: 0.00, def: 0.64, dri: 0.09, pac: 0.02, phy: 0.20 },
  DC:  { pas: 0.05, sho: 0.00, def: 0.64, dri: 0.09, pac: 0.02, phy: 0.20 },
  // Goalkeepers (100% GK attr – can't calc without goalkeeping stat)
  GK:  { pas: 0.00, sho: 0.00, def: 0.00, dri: 0.00, pac: 0.00, phy: 0.00 },
  G:   { pas: 0.00, sho: 0.00, def: 0.00, dri: 0.00, pac: 0.00, phy: 0.00 },
};

const GK_POSITIONS = new Set(['GK', 'G']);

function calcPositionOvr(
  pos: string,
  stats: { pace: number; shooting: number; passing: number; dribbling: number; defense: number; physical: number },
  penalty: number,
): number | null {
  if (GK_POSITIONS.has(pos)) return null; // Can't calculate without goalkeeping attribute
  const w = OVR_WEIGHTS[pos];
  if (!w) return null;
  return Math.round(
    (stats.passing - penalty) * w.pas +
    (stats.shooting - penalty) * w.sho +
    (stats.defense - penalty) * w.def +
    (stats.dribbling - penalty) * w.dri +
    (stats.pace - penalty) * w.pac +
    (stats.physical - penalty) * w.phy
  );
}

/* ════════════════════════════════════════════════════
   ALL MFL POSITIONS (EN + FR aliases)
   ════════════════════════════════════════════════════ */

const ALL_POSITIONS = [
  { group: 'GK',  items: ['GK', 'G'] },
  { group: 'DEF', items: ['CB', 'DC', 'RB', 'DD', 'LB', 'DG', 'RWB', 'DLD', 'LWB', 'DLG'] },
  { group: 'MID', items: ['CDM', 'MDC', 'CM', 'MC', 'CAM', 'AT', 'MOC', 'RM', 'MD', 'LM', 'MG'] },
  { group: 'ATT', items: ['RW', 'AD', 'LW', 'AG', 'CF', 'ST', 'BU'] },
];

/* ════════════════════════════════════════════════════
   SUB-COMPONENTS
   ════════════════════════════════════════════════════ */

interface ApiResponse {
  data: PlayerRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/* ── Emoji flag from ISO 3166-1 alpha-2 code ── */
function toFlagEmoji(code: string): string {
  if (!code || code.length !== 2) return '';
  return String.fromCodePoint(
    ...code.toUpperCase().split('').map(c => c.charCodeAt(0) + 127397)
  );
}

function CountryFlag({ code }: { code: string }) {
  if (!code) return null;
  const emoji = toFlagEmoji(code);
  if (!emoji) return <span className="text-[10px] text-zinc-500">{code}</span>;
  return <span className="text-base leading-none" title={code}>{emoji}</span>;
}

function ProgressionBadge({ value }: { value: number }) {
  if (value > 0) return (
    <span className="inline-flex items-center gap-0.5 text-emerald-400 text-[11px] font-semibold">
      <TrendingUp size={11} />+{value}
    </span>
  );
  if (value < 0) return (
    <span className="inline-flex items-center gap-0.5 text-red-400 text-[11px] font-semibold">
      <TrendingDown size={11} />{value}
    </span>
  );
  return (
    <span className="inline-flex items-center text-zinc-600 text-[11px]">
      <Minus size={11} />
    </span>
  );
}

const POS_COLORS: Record<string, string> = {
  // GK
  GK: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  G:  'bg-purple-500/20 text-purple-300 border-purple-500/30',
  // CB
  CB: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  DC: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  // RB / LB
  RB: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  DD: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  LB: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  DG: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  // Wing Backs
  RWB: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  DLD: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  LWB: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  DLG: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  // CDM
  CDM: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  MDC: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  // CM
  CM: 'bg-green-500/20 text-green-300 border-green-500/30',
  MC: 'bg-green-500/20 text-green-300 border-green-500/30',
  // CAM
  CAM: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  AT:  'bg-amber-500/20 text-amber-300 border-amber-500/30',
  MOC: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  // RM / LM
  RM: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  MD: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  LM: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  MG: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  // RW / LW
  RW: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  AD: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  LW: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  AG: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  // CF / ST
  CF: 'bg-red-500/20 text-red-300 border-red-500/30',
  ST: 'bg-red-500/20 text-red-300 border-red-500/30',
  BU: 'bg-red-500/20 text-red-300 border-red-500/30',
};

function PositionWithOvr({
  position, ovr, isPrimary,
}: {
  position: string; ovr: number | null; isPrimary: boolean;
}) {
  const colors = POS_COLORS[position] || 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${colors} ${!isPrimary ? 'opacity-75' : ''}`}>
      {position}
      {ovr !== null && (
        <span className={`${isPrimary ? 'text-white' : 'text-zinc-400'} font-normal text-[9px]`}>
          {ovr}
        </span>
      )}
    </span>
  );
}

function OverallBadge({ value }: { value: number }) {
  let color = 'text-zinc-400';
  if (value >= 85) color = 'text-amber-400';
  else if (value >= 80) color = 'text-orange-400';
  else if (value >= 70) color = 'text-emerald-400';
  else if (value >= 60) color = 'text-blue-400';
  else if (value >= 50) color = 'text-zinc-300';
  return <span className={`font-bold text-base ${color}`}>{value}</span>;
}

/* ════════════════════════════════════════════════════
   PROGRESSION KEYS
   ════════════════════════════════════════════════════ */

const PROG_KEYS: { label: string; key: keyof MflProgression }[] = [
  { label: 'OVR', key: 'overall' },
  { label: 'PAC', key: 'pace' },
  { label: 'SHO', key: 'shooting' },
  { label: 'PAS', key: 'passing' },
  { label: 'DRI', key: 'dribbling' },
  { label: 'DEF', key: 'defense' },
  { label: 'PHY', key: 'physical' },
];

/* ════════════════════════════════════════════════════
   TABLE COLUMNS
   ════════════════════════════════════════════════════ */

const columnHelper = createColumnHelper<PlayerRow>();

const columns = [
  columnHelper.accessor('id', {
    header: 'ID',
    cell: (info) => (
      <span className="text-zinc-500 text-xs font-mono">{info.getValue()}</span>
    ),
  }),

  columnHelper.accessor((row) => `${row.firstName} ${row.lastName}`, {
    id: 'name',
    header: 'Player',
    cell: (info) => {
      const row = info.row.original;
      const hasStats = row.pace != null;

      const posOvrs = row.positions.map((pos, i) => {
        if (i === 0) return { pos, ovr: row.overall, isPrimary: true };
        if (!hasStats) return { pos, ovr: null as number | null, isPrimary: false };
        const calculated = calcPositionOvr(pos, {
          pace: row.pace!, shooting: row.shooting!, passing: row.passing!,
          dribbling: row.dribbling!, defense: row.defense!, physical: row.physical!,
        }, 1);
        return { pos, ovr: calculated, isPrimary: false };
      });

      return (
        <div className="min-w-[180px]">
          <a
            href={`https://app.playmfl.com/fr/players/${row.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-white hover:text-orange-400 transition-colors inline-flex items-center gap-1 group"
          >
            {row.firstName} {row.lastName}
            <ExternalLink size={11} className="opacity-0 group-hover:opacity-60 transition-opacity" />
          </a>
          <div className="flex flex-wrap gap-1 mt-1">
            {posOvrs.map(({ pos, ovr, isPrimary }) => (
              <PositionWithOvr key={pos} position={pos} ovr={ovr} isPrimary={isPrimary} />
            ))}
          </div>
        </div>
      );
    },
  }),

  columnHelper.accessor('overall', {
    header: 'OVR',
    cell: (info) => <OverallBadge value={info.getValue()} />,
  }),

  columnHelper.accessor('age', {
    header: 'Age',
    cell: (info) => <span className="text-zinc-300">{info.getValue()}</span>,
  }),

  columnHelper.accessor('nationalities', {
    header: 'Nat',
    cell: (info) => {
      const nats = info.getValue();
      if (!nats || nats.length === 0) return <span className="text-zinc-600">-</span>;
      return (
        <div className="flex items-center gap-1">
          {nats.map((code) => <CountryFlag key={code} code={code} />)}
        </div>
      );
    },
    enableSorting: false,
  }),

  columnHelper.accessor('ownerName', {
    header: 'Owner',
    cell: (info) => (
      <span className="text-zinc-400 text-sm truncate max-w-[140px] block">
        {info.getValue() || <span className="text-zinc-600 italic">Free Agent</span>}
      </span>
    ),
    enableSorting: false,
  }),

  columnHelper.accessor('progression', {
    header: 'Progression',
    cell: (info) => {
      const prog = info.getValue();
      if (!prog) return <span className="text-zinc-600 text-xs">N/A</span>;
      return (
        <div className="flex items-center gap-2.5">
          {PROG_KEYS.map(({ label, key }) => (
            <div key={key} className="flex flex-col items-center min-w-[28px]">
              <span className="text-[8px] text-zinc-600 uppercase leading-none mb-0.5">{label}</span>
              <ProgressionBadge value={prog[key]} />
            </div>
          ))}
        </div>
      );
    },
    enableSorting: false,
  }),
];

/* ════════════════════════════════════════════════════
   INTERVALS
   ════════════════════════════════════════════════════ */

const INTERVALS: { label: string; value: ProgressionInterval }[] = [
  { label: '24H', value: '24H' },
  { label: 'Week', value: 'WEEK' },
  { label: 'Month', value: 'MONTH' },
  { label: 'Season', value: 'CURRENT_SEASON' },
  { label: 'All Time', value: 'ALL' },
];

/* ════════════════════════════════════════════════════
   SMALL FILTER INPUT
   ════════════════════════════════════════════════════ */

function FilterInput({
  value, onChange, placeholder, className = '',
}: {
  value: string; onChange: (v: string) => void; placeholder: string; className?: string;
}) {
  return (
    <input
      type="number"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-16 bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500/50 transition-colors ${className}`}
    />
  );
}

/* ════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════ */

export default function PlayerTable() {
  const [data, setData] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [position, setPosition] = useState('');
  const [interval, setInterval] = useState<ProgressionInterval>('ALL');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [ovrMin, setOvrMin] = useState('');
  const [ovrMax, setOvrMax] = useState('');
  const [progMin, setProgMin] = useState('');
  const [progMax, setProgMax] = useState('');

  const [sorting, setSorting] = useState<SortingState>([{ id: 'overall', desc: true }]);

  const hasFilters = search || position || ageMin || ageMax || ovrMin || ovrMax || progMin || progMax;

  const resetFilters = () => {
    setSearch('');
    setPosition('');
    setAgeMin('');
    setAgeMax('');
    setOvrMin('');
    setOvrMax('');
    setProgMin('');
    setProgMax('');
    setSorting([{ id: 'overall', desc: true }]);
  };

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sortBy = sorting[0]?.id || 'overall';
      const sortOrder = sorting[0]?.desc ? 'desc' : 'asc';
      const params = new URLSearchParams({
        page: String(page), limit: '50', sortBy, sortOrder, interval,
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (position) params.set('position', position);
      if (ageMin) params.set('ageMin', ageMin);
      if (ageMax) params.set('ageMax', ageMax);
      if (ovrMin) params.set('ovrMin', ovrMin);
      if (ovrMax) params.set('ovrMax', ovrMax);
      if (progMin) params.set('progMin', progMin);
      if (progMax) params.set('progMax', progMax);

      const res = await fetch(`/api/players?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResponse = await res.json();
      setData(json.data);
      setTotalPages(json.pagination.totalPages);
      setTotal(json.pagination.total);
    } catch (err) {
      console.error('Failed to fetch players:', err);
    } finally {
      setLoading(false);
    }
  }, [page, sorting, debouncedSearch, position, interval, ageMin, ageMax, ovrMin, ovrMax, progMin, progMax]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, position, interval, ageMin, ageMax, ovrMin, ovrMax, progMin, progMax]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  });

  return (
    <div className="space-y-4">
      {/* ── FILTERS ── */}
      <div className="glass-card p-4 space-y-3">
        {/* Row 1: Search + Position + Interval */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input
              type="text"
              placeholder="Search players..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/25 transition-colors"
            />
          </div>

          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50 transition-colors [&>option]:bg-zinc-900 [&>optgroup]:bg-zinc-900"
          >
            <option value="">All Positions</option>
            {ALL_POSITIONS.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.items.map((pos) => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </optgroup>
            ))}
          </select>

          <div className="flex gap-0.5 bg-white/5 rounded-lg p-1 border border-white/10">
            {INTERVALS.map((int) => (
              <button
                key={int.value}
                onClick={() => setInterval(int.value)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  interval === int.value
                    ? 'bg-orange-500/25 text-orange-300 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {int.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Range filters + Reset + Count */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Age range */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Age</span>
            <FilterInput value={ageMin} onChange={setAgeMin} placeholder="Min" />
            <span className="text-zinc-600 text-xs">-</span>
            <FilterInput value={ageMax} onChange={setAgeMax} placeholder="Max" />
          </div>

          <div className="w-px h-5 bg-white/10" />

          {/* OVR range */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">OVR</span>
            <FilterInput value={ovrMin} onChange={setOvrMin} placeholder="Min" />
            <span className="text-zinc-600 text-xs">-</span>
            <FilterInput value={ovrMax} onChange={setOvrMax} placeholder="Max" />
          </div>

          <div className="w-px h-5 bg-white/10" />

          {/* Progression range */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Prog OVR</span>
            <FilterInput value={progMin} onChange={setProgMin} placeholder="Min" />
            <span className="text-zinc-600 text-xs">-</span>
            <FilterInput value={progMax} onChange={setProgMax} placeholder="Max" />
          </div>

          <div className="w-px h-5 bg-white/10" />

          {/* Reset */}
          {hasFilters && (
            <button
              onClick={resetFilters}
              className="glass-button px-2.5 py-1.5 text-[11px] text-zinc-400 hover:text-orange-400 inline-flex items-center gap-1"
            >
              <RotateCcw size={12} />
              Reset
            </button>
          )}

          {/* Total */}
          <div className="ml-auto text-zinc-500 text-sm">
            <span className="text-orange-400 font-semibold">{total.toLocaleString()}</span> players
          </div>
        </div>
      </div>

      {/* ── TABLE ── */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-white/10 bg-white/[0.02]">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={`flex items-center gap-1 ${
                            header.column.getCanSort()
                              ? 'cursor-pointer select-none hover:text-zinc-300 transition-colors'
                              : ''
                          }`}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            header.column.getIsSorted() === 'asc'
                              ? <ArrowUp size={13} className="text-orange-400" />
                              : header.column.getIsSorted() === 'desc'
                              ? <ArrowDown size={13} className="text-orange-400" />
                              : <ArrowUpDown size={13} className="text-zinc-700" />
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {loading ? (
                  <motion.tr key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td colSpan={columns.length} className="text-center py-20 text-zinc-500">
                      <Loader2 className="animate-spin mx-auto mb-2 text-orange-500" size={24} />
                      <span className="text-sm">Loading players...</span>
                    </td>
                  </motion.tr>
                ) : data.length === 0 ? (
                  <motion.tr key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td colSpan={columns.length} className="text-center py-20 text-zinc-500 text-sm">
                      No players found.
                    </td>
                  </motion.tr>
                ) : (
                  table.getRowModel().rows.map((row, index) => (
                    <motion.tr
                      key={row.original.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: index * 0.015, duration: 0.2 }}
                      className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-2.5">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── PAGINATION ── */}
      <div className="flex items-center justify-between px-1">
        <div className="text-sm text-zinc-500">
          Page <span className="text-orange-400 font-medium">{page}</span> / {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="glass-button p-2 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="glass-button p-2 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
