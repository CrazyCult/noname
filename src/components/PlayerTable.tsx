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
import { countryToFlag } from '@/lib/country-codes';

/* ════════════════════════════════════════════════════
   POSITIONS MFL (EN — format API)
   ════════════════════════════════════════════════════ */

const ALL_POSITIONS = [
  { group: 'Gardien', items: ['GK'] },
  { group: 'Défenseurs', items: ['CB', 'RB', 'LB', 'RWB', 'LWB'] },
  { group: 'Milieux', items: ['CDM', 'CM', 'CAM', 'RM', 'LM'] },
  { group: 'Attaquants', items: ['RW', 'LW', 'CF', 'ST'] },
];

/* ════════════════════════════════════════════════════
   SOUS-COMPOSANTS
   ════════════════════════════════════════════════════ */

interface ApiResponse {
  data: PlayerRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

function CountryFlag({ name }: { name: string }) {
  const { emoji, code } = countryToFlag(name);
  if (!emoji) return <span className="text-[10px] text-zinc-500" title={name}>{name}</span>;
  return <span className="text-base leading-none" title={`${name} (${code})`}>{emoji}</span>;
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
  GK:  'bg-purple-500/20 text-purple-300 border-purple-500/30',
  CB:  'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  RB:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  LB:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  RWB: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  LWB: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  CDM: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  CM:  'bg-green-500/20 text-green-300 border-green-500/30',
  CAM: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  RM:  'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  LM:  'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  RW:  'bg-orange-500/20 text-orange-300 border-orange-500/30',
  LW:  'bg-orange-500/20 text-orange-300 border-orange-500/30',
  CF:  'bg-red-500/20 text-red-300 border-red-500/30',
  ST:  'bg-red-500/20 text-red-300 border-red-500/30',
};

function PositionWithOvr({
  position, ovr, isPrimary,
}: {
  position: string; ovr: number; isPrimary: boolean;
}) {
  const colors = POS_COLORS[position] || 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${colors} ${!isPrimary ? 'opacity-75' : ''}`}>
      {position}
      <span className={`${isPrimary ? 'text-white' : 'text-zinc-400'} font-normal text-[9px]`}>
        {ovr}
      </span>
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
   COLONNES PROGRESSION
   ════════════════════════════════════════════════════ */

const PROG_KEYS: { label: string; key: keyof MflProgression }[] = [
  { label: 'OVR', key: 'overall' },
  { label: 'PAC', key: 'pace' },
  { label: 'TIR', key: 'shooting' },
  { label: 'PAS', key: 'passing' },
  { label: 'DRI', key: 'dribbling' },
  { label: 'DEF', key: 'defense' },
  { label: 'PHY', key: 'physical' },
];

/* ════════════════════════════════════════════════════
   COLONNES DU TABLEAU
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
    header: 'Joueur',
    cell: (info) => {
      const row = info.row.original;

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
            {row.positionOvrs.map(({ position, ovr }, i) => (
              <PositionWithOvr key={position} position={position} ovr={ovr} isPrimary={i === 0} />
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
    header: 'Âge',
    cell: (info) => <span className="text-zinc-300">{info.getValue()}</span>,
  }),

  columnHelper.accessor('nationalities', {
    header: 'Nat',
    cell: (info) => {
      const nats = info.getValue();
      if (!nats || nats.length === 0) return <span className="text-zinc-600">-</span>;
      return (
        <div className="flex items-center gap-1">
          {nats.map((name) => <CountryFlag key={name} name={name} />)}
        </div>
      );
    },
    enableSorting: false,
  }),

  columnHelper.accessor('ownerName', {
    header: 'Propriétaire',
    cell: (info) => (
      <span className="text-zinc-400 text-sm truncate max-w-[140px] block">
        {info.getValue() || <span className="text-zinc-600 italic">Agent libre</span>}
      </span>
    ),
    enableSorting: false,
  }),

  columnHelper.accessor('revenueShare', {
    header: 'RS%',
    cell: (info) => {
      const raw = info.getValue();
      const pct = raw / 100;
      return (
        <span className={`text-xs font-medium ${pct > 0 ? 'text-amber-400' : 'text-zinc-600'}`}>
          {pct}%
        </span>
      );
    },
    enableSorting: false,
  }),

  columnHelper.accessor('offerStatus', {
    header: 'Statut',
    cell: (info) => {
      const val = info.getValue();
      if (val > 0) {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
            VENTE
          </span>
        );
      }
      return <span className="text-zinc-700 text-[10px]">—</span>;
    },
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
   INTERVALLES
   ════════════════════════════════════════════════════ */

const INTERVALS: { label: string; value: ProgressionInterval }[] = [
  { label: '24H', value: '24H' },
  { label: 'Semaine', value: 'WEEK' },
  { label: 'Mois', value: 'MONTH' },
  { label: 'Saison', value: 'CURRENT_SEASON' },
  { label: 'Total', value: 'ALL' },
];

/* ════════════════════════════════════════════════════
   INPUT FILTRE
   ════════════════════════════════════════════════════ */

function FilterInput({
  value, onChange, placeholder,
}: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <input
      type="number"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-16 bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500/50 transition-colors"
    />
  );
}

/* ════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
   ════════════════════════════════════════════════════ */

export default function PlayerTable() {
  const [data, setData] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filtres
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

  const hasFilters = !!(search || position || ageMin || ageMax || ovrMin || ovrMax || progMin || progMax);

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

  // Debounce recherche
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
      console.error('Erreur chargement joueurs:', err);
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
      {/* ── FILTRES ── */}
      <div className="glass-card p-4 space-y-3">
        {/* Ligne 1 : Recherche + Position + Intervalle */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input
              type="text"
              placeholder="Rechercher un joueur..."
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
            <option value="">Tous les postes</option>
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

        {/* Ligne 2 : Filtres plage + Reset + Total */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Âge</span>
            <FilterInput value={ageMin} onChange={setAgeMin} placeholder="Min" />
            <span className="text-zinc-600 text-xs">-</span>
            <FilterInput value={ageMax} onChange={setAgeMax} placeholder="Max" />
          </div>

          <div className="w-px h-5 bg-white/10" />

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">OVR</span>
            <FilterInput value={ovrMin} onChange={setOvrMin} placeholder="Min" />
            <span className="text-zinc-600 text-xs">-</span>
            <FilterInput value={ovrMax} onChange={setOvrMax} placeholder="Max" />
          </div>

          <div className="w-px h-5 bg-white/10" />

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Prog OVR</span>
            <FilterInput value={progMin} onChange={setProgMin} placeholder="Min" />
            <span className="text-zinc-600 text-xs">-</span>
            <FilterInput value={progMax} onChange={setProgMax} placeholder="Max" />
          </div>

          <div className="w-px h-5 bg-white/10" />

          {/* Bouton Reset — toujours visible */}
          <button
            onClick={resetFilters}
            disabled={!hasFilters}
            className="glass-button px-2.5 py-1.5 text-[11px] inline-flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 hover:text-orange-400"
          >
            <RotateCcw size={12} />
            Réinitialiser
          </button>

          <div className="ml-auto text-zinc-500 text-sm">
            <span className="text-orange-400 font-semibold">{total.toLocaleString()}</span> joueurs
          </div>
        </div>
      </div>

      {/* ── TABLEAU ── */}
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
                      <span className="text-sm">Chargement des joueurs...</span>
                    </td>
                  </motion.tr>
                ) : data.length === 0 ? (
                  <motion.tr key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td colSpan={columns.length} className="text-center py-20 text-zinc-500 text-sm">
                      Aucun joueur trouvé.
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
