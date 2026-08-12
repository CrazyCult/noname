'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  useReactTable, getCoreRowModel, flexRender,
  createColumnHelper, type SortingState,
} from '@tanstack/react-table';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpDown, ArrowUp, ArrowDown, Search,
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown,
  Minus, Loader2, ExternalLink, RotateCcw, ShoppingCart, EyeOff,
} from 'lucide-react';
import type { PlayerRow, PlayerPrediction, MflProgression, ProgressionInterval } from '@/types/mfl';
import { countryToFlag } from '@/lib/country-codes';

const ALL_POSITIONS = [
  { group: 'Gardien', items: ['GK'] },
  { group: 'Défenseurs', items: ['CB', 'RB', 'LB', 'RWB', 'LWB'] },
  { group: 'Milieux', items: ['CDM', 'CM', 'CAM', 'RM', 'LM'] },
  { group: 'Attaquants', items: ['RW', 'LW', 'CF', 'ST'] },
];

const ATTR_KEYS: { label: string; key: keyof MflProgression }[] = [
  { label: 'PAC', key: 'pace' },
  { label: 'TIR', key: 'shooting' },
  { label: 'PAS', key: 'passing' },
  { label: 'DRI', key: 'dribbling' },
  { label: 'DEF', key: 'defense' },
  { label: 'PHY', key: 'physical' },
];

const PROG_KEYS: { label: string; key: keyof MflProgression }[] = [
  { label: 'OVR', key: 'overall' }, ...ATTR_KEYS,
];

interface IntervalStats { totalPlayers: number; playersProgressed: number; lastUpdated: string | null; }
interface ApiResponse {
  data: PlayerRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/* ── Sous-composants ── */

function CountryFlag({ name }: { name: string }) {
  const { emoji, code } = countryToFlag(name);
  if (!emoji) return <span className="text-[10px] text-zinc-500" title={name}>{name}</span>;
  return <span className="text-base leading-none" title={`${name} (${code})`}>{emoji}</span>;
}

function ProgressionBadge({ value }: { value: number }) {
  if (value > 0) return <span className="inline-flex items-center gap-0.5 text-emerald-400 text-[11px] font-semibold"><TrendingUp size={11} />+{value}</span>;
  if (value < 0) return <span className="inline-flex items-center gap-0.5 text-red-400 text-[11px] font-semibold"><TrendingDown size={11} />{value}</span>;
  return <span className="inline-flex items-center text-zinc-600 text-[11px]"><Minus size={11} /></span>;
}

function PredictionBadge({ prediction }: { prediction?: PlayerPrediction }) {
  if (!prediction) {
    return <span className="text-zinc-600 text-[10px]" title="La prédiction apparaîtra après le prochain calcul du modèle.">En attente</span>;
  }

  const gainPrefix = prediction.predictedGain > 0 ? '+' : '';
  const confidenceColor = prediction.confidence >= 75
    ? 'text-emerald-400'
    : prediction.confidence >= 50 ? 'text-amber-400' : 'text-zinc-400';
  const details = [
    `OVR prévu : ${prediction.predictedOverall}`,
    `Gain attendu : ${gainPrefix}${prediction.predictedGain}`,
    `Confiance : ${prediction.confidence}% (${prediction.sampleSize} joueurs comparables)`,
    `Modèle : ${prediction.modelVersion} (carrières terminées à activité observée, âge, OVR, poste, attributs et courbe récente)`,
    `P(+10) ${prediction.probabilityGain10}% · P(+15) ${prediction.probabilityGain15}%`,
    `P(+20) ${prediction.probabilityGain20}% · P(+25) ${prediction.probabilityGain25}% · P(+30) ${prediction.probabilityGain30}%`,
  ].join('\n');

  return (
    <div title={details} className="inline-flex flex-col leading-tight cursor-help">
      <span className="text-[11px] font-bold text-sky-300">{gainPrefix}{prediction.predictedGain} <span className="text-zinc-500 font-medium">→ {prediction.predictedOverall}</span></span>
      <span className={`text-[9px] font-medium ${confidenceColor}`}>{prediction.confidence}% confiance</span>
    </div>
  );
}

const POS_COLORS: Record<string, string> = {
  GK: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  CB: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  RB: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  LB: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  RWB: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  LWB: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  CDM: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  CM: 'bg-green-500/20 text-green-300 border-green-500/30',
  CAM: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  RM: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  LM: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  RW: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  LW: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  CF: 'bg-red-500/20 text-red-300 border-red-500/30',
  ST: 'bg-red-500/20 text-red-300 border-red-500/30',
};

function PositionWithOvr({ position, ovr, isPrimary }: { position: string; ovr: number; isPrimary: boolean }) {
  const colors = POS_COLORS[position] || 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${colors} ${!isPrimary ? 'opacity-75' : ''}`}>
      {position}
      <span className={`${isPrimary ? 'text-white' : 'text-zinc-400'} font-normal text-[9px]`}>{ovr}</span>
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

function RetirementAge({ age, retirementYears }: { age: number; retirementYears: number | null }) {
  const color = retirementYears === 1
    ? 'text-red-400'
    : retirementYears === 2
      ? 'text-orange-400'
      : retirementYears === 3
        ? 'text-yellow-400'
        : 'text-zinc-300';

  const title = retirementYears != null && retirementYears >= 1 && retirementYears <= 3
    ? `Retraite déclarée par MFL : ${retirementYears} an${retirementYears > 1 ? 's' : ''} restant${retirementYears > 1 ? 's' : ''}.`
    : undefined;

  return <span className={`font-medium ${color}`} title={title}>{age}</span>;
}

function FilterInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input type="number" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
      className="w-16 bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500/50 transition-colors"
    />
  );
}

function ToggleChip({ active, onClick, children, activeClass = 'bg-orange-500/15 text-orange-300 border-orange-500/30' }: {
  active: boolean; onClick: () => void; children: React.ReactNode; activeClass?: string;
}) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1.5 text-[11px] inline-flex items-center gap-1.5 rounded-md border transition-all font-medium select-none ${
        active ? activeClass : 'bg-white/5 text-zinc-400 border-white/10 hover:text-zinc-200 hover:border-white/20'
      }`}
    >{children}</button>
  );
}

const columnHelper = createColumnHelper<PlayerRow>();

const INTERVALS: { label: string; value: ProgressionInterval }[] = [
  { label: '24H', value: '24H' },
  { label: 'Semaine', value: 'WEEK' },
  { label: 'Mois', value: 'MONTH' },
  { label: 'Saison', value: 'CURRENT_SEASON' },
  { label: 'Total', value: 'ALL' },
];

/* ════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
   ════════════════════════════════════════════════════ */

export default function PlayerTable({
  intervalStats = {},
}: {
  intervalStats?: Partial<Record<ProgressionInterval, IntervalStats>>;
}) {
  const [data, setData] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

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
  const [hideDevCenter, setHideDevCenter] = useState(false);
  const [showOnlyForSale, setShowOnlyForSale] = useState(false);
  const [attrFilters, setAttrFilters] = useState<Set<keyof MflProgression>>(new Set());
  const [sorting, setSorting] = useState<SortingState>([{ id: 'overall', desc: true }]);

  const [listings, setListings] = useState<Record<number, number | null>>({});
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [checkingListings, setCheckingListings] = useState(false);
  const [listingsChecked, setListingsChecked] = useState(false);

  const hasFilters = !!(search || position || ageMin || ageMax || ovrMin || ovrMax || progMin || progMax || hideDevCenter || showOnlyForSale || attrFilters.size > 0);

  const resetFilters = () => {
    setSearch(''); setPosition('');
    setAgeMin(''); setAgeMax('');
    setOvrMin(''); setOvrMax('');
    setProgMin(''); setProgMax('');
    setHideDevCenter(false); setShowOnlyForSale(false);
    setAttrFilters(new Set());
    setSorting([{ id: 'overall', desc: true }]);
  };

  const toggleAttr = (key: keyof MflProgression) => {
    setAttrFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setListings({}); setCheckedIds(new Set());
    setListingsChecked(false); setShowOnlyForSale(false);
  }, [page, debouncedSearch, position, interval, ageMin, ageMax, ovrMin, ovrMax, progMin, progMax, hideDevCenter]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sortBy = sorting[0]?.id || 'overall';
      const sortOrder = sorting[0]?.desc ? 'desc' : 'asc';
      const params = new URLSearchParams({ page: String(page), limit: '50', sortBy, sortOrder, interval });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (position) params.set('position', position);
      if (ageMin) params.set('ageMin', ageMin);
      if (ageMax) params.set('ageMax', ageMax);
      if (ovrMin) params.set('ovrMin', ovrMin);
      if (ovrMax) params.set('ovrMax', ovrMax);
      if (progMin) params.set('progMin', progMin);
      if (progMax) params.set('progMax', progMax);
      if (hideDevCenter) params.set('hideDevCenter', 'true');

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
  }, [page, sorting, debouncedSearch, position, interval, ageMin, ageMax, ovrMin, ovrMax, progMin, progMax, hideDevCenter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const checkListings = useCallback(async () => {
    if (checkingListings || data.length === 0) return;
    setCheckingListings(true);
    try {
      const ids = data.map((p) => p.id);
      const res = await fetch('/api/players/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error('listings fetch failed');
      const json = await res.json();
      const newListings: Record<number, number | null> = {};
      const newChecked = new Set(checkedIds);
      for (const r of json.results) {
        if (r.playerId) { newListings[r.playerId] = r.listingPrice; newChecked.add(r.playerId); }
      }
      setListings((prev) => ({ ...prev, ...newListings }));
      setCheckedIds(newChecked);
      setListingsChecked(true);
    } catch (err) {
      console.error('checkListings error:', err);
    } finally {
      setCheckingListings(false);
    }
  }, [data, checkedIds, checkingListings]);

  const filteredData = data.filter((p) => {
    if (showOnlyForSale && listingsChecked) {
      const price = listings[p.id] !== undefined ? listings[p.id] : p.listingPrice;
      if (price == null) return false;
    }
    if (attrFilters.size > 0 && p.progression) {
      if (!Array.from(attrFilters).some((key) => (p.progression![key] ?? 0) > 0)) return false;
    }
    return true;
  });

  const forSaleCount = data.filter((p) => checkedIds.has(p.id) && (listings[p.id] ?? p.listingPrice) != null).length;

  const columns = [
    columnHelper.accessor('id', {
      header: 'ID',
      cell: (info) => <span className="text-zinc-500 text-xs font-mono">{info.getValue()}</span>,
    }),
    columnHelper.accessor((row) => `${row.firstName} ${row.lastName}`, {
      id: 'name', header: 'Joueur',
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="min-w-[180px]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <a href={`https://app.playmfl.com/fr/players/${row.id}`} target="_blank" rel="noopener noreferrer"
                className="font-semibold text-white hover:text-orange-400 transition-colors inline-flex items-center gap-1 group">
                {row.firstName} {row.lastName}
                <ExternalLink size={11} className="opacity-0 group-hover:opacity-60 transition-opacity" />
              </a>
              {row.isDevCenter && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500/70 border border-yellow-500/20 font-medium tracking-wide">DEV</span>
              )}
            </div>
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
      cell: (info) => (
        <RetirementAge
          age={info.getValue()}
          retirementYears={info.row.original.retirementYears}
        />
      ),
    }),
    columnHelper.accessor('nationalities', {
      header: 'Nat', enableSorting: false,
      cell: (info) => {
        const nats = info.getValue();
        if (!nats?.length) return <span className="text-zinc-600">-</span>;
        return <div className="flex items-center gap-1">{nats.map((n) => <CountryFlag key={n} name={n} />)}</div>;
      },
    }),
    columnHelper.accessor('ownerName', {
      header: 'Propriétaire',
      cell: (info) => (
        <span className="text-zinc-400 text-sm truncate max-w-[140px] block">
          {info.getValue() || <span className="text-zinc-600 italic">Agent libre</span>}
        </span>
      ),
    }),
    columnHelper.accessor('revenueShare', {
      header: 'RS%',
      cell: (info) => {
        const { revenueShare, clause } = info.row.original;
        const rs = revenueShare / 100, cl = clause / 100;
        if (rs === 0 && cl === 0) return <span className="text-zinc-600 text-xs">0%</span>;
        return <span className="text-xs font-medium text-amber-400">{rs}{cl > 0 ? <span className="text-orange-400">+{cl}</span> : ''}%</span>;
      },
    }),
    columnHelper.accessor('listingPrice', {
      header: 'Vente',
      cell: (info) => {
        const id = info.row.original.id;
        if (!checkedIds.has(id)) return <span className="text-zinc-700 text-[10px]">—</span>;
        const price = listings[id] !== undefined ? listings[id] : info.getValue();
        if (price == null) return <span className="text-zinc-600 text-[10px]">Non dispo</span>;
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            {price.toLocaleString()} $
          </span>
        );
      },
    }),
    columnHelper.accessor('prediction', {
      header: 'Prédiction',
      enableSorting: false,
      cell: (info) => <PredictionBadge prediction={info.getValue()} />,
    }),
    columnHelper.accessor('progression', {
      header: 'Progression',
      cell: (info) => {
        const prog = info.getValue();
        if (!prog) return <span className="text-zinc-600 text-xs">N/A</span>;
        return (
          <div className="flex items-center gap-2.5">
            {PROG_KEYS.map(({ label, key }) => {
              const highlighted = key !== 'overall' && attrFilters.has(key);
              return (
                <div key={key} className={`flex flex-col items-center min-w-[28px] transition-all ${highlighted ? 'ring-1 ring-orange-500/50 rounded px-0.5 bg-orange-500/5' : ''}`}>
                  <span className={`text-[8px] uppercase leading-none mb-0.5 ${highlighted ? 'text-orange-400' : 'text-zinc-600'}`}>{label}</span>
                  <ProgressionBadge value={prog[key]} />
                </div>
              );
            })}
          </div>
        );
      },
    }),
  ];

  const table = useReactTable({
    data: filteredData, columns,
    state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true, manualPagination: true, pageCount: totalPages,
  });

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 space-y-3">

        {/* Ligne 1 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="text" placeholder="Rechercher un joueur..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-md text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500/50 transition-colors w-52"
            />
          </div>

          <select value={position} onChange={(e) => setPosition(e.target.value)}
            className="bg-zinc-900 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500/50 transition-colors [&>option]:bg-zinc-900 [&>option]:text-white [&>optgroup]:bg-zinc-900 [&>optgroup]:text-zinc-400">
            <option value="">Toutes positions</option>
            {ALL_POSITIONS.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.items.map((pos) => <option key={pos} value={pos}>{pos}</option>)}
              </optgroup>
            ))}
          </select>

          {/* Tabs intervalles avec compteurs */}
          <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-1 border border-white/[0.06]">
            {INTERVALS.map((int) => {
              const stats = intervalStats[int.value];
              const count = stats?.playersProgressed;
              const isActive = interval === int.value;
              const lastUpdated = stats?.lastUpdated ? new Date(stats.lastUpdated) : null;
              const STALE_MS: Partial<Record<ProgressionInterval, number>> = {
                '24H': 25 * 60 * 60 * 1000,
                'WEEK': 8 * 24 * 60 * 60 * 1000,
                'MONTH': 31 * 24 * 60 * 60 * 1000,
              };
              const staleThreshold = STALE_MS[int.value];
              const isStale = lastUpdated != null && staleThreshold != null
                && (Date.now() - lastUpdated.getTime()) > staleThreshold;
              return (
                <button key={int.value} onClick={() => {
                  setInterval(int.value);
                  setPage(1);
                  setSorting([{ id: 'progression', desc: true }]);
                }}
                  title={lastUpdated ? `Mis à jour : ${lastUpdated.toLocaleString('fr-FR')}${isStale ? ' (données périmées)' : ''}` : undefined}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    isActive ? 'bg-orange-500/25 text-orange-300' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {int.label}
                  {isStale && (
                    <span className="text-[9px] text-amber-500" title="Données périmées">⚠</span>
                  )}
                  {count != null && count > 0 && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                      isStale
                        ? 'bg-amber-500/15 text-amber-500/70'
                        : isActive ? 'bg-orange-500/30 text-orange-200' : 'bg-white/10 text-zinc-400'
                    }`}>
                      {count.toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Ligne 2 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Âge</span>
            <FilterInput value={ageMin} onChange={setAgeMin} placeholder="min" />
            <span className="text-zinc-600 text-xs">-</span>
            <FilterInput value={ageMax} onChange={setAgeMax} placeholder="max" />
          </div>
          <div className="w-px h-5 bg-white/10" />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">OVR</span>
            <FilterInput value={ovrMin} onChange={setOvrMin} placeholder="min" />
            <span className="text-zinc-600 text-xs">-</span>
            <FilterInput value={ovrMax} onChange={setOvrMax} placeholder="max" />
          </div>
          <div className="w-px h-5 bg-white/10" />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Prog OVR</span>
            <FilterInput value={progMin} onChange={setProgMin} placeholder="min" />
            <span className="text-zinc-600 text-xs">-</span>
            <FilterInput value={progMax} onChange={setProgMax} placeholder="max" />
          </div>
          <div className="w-px h-5 bg-white/10" />
          <button onClick={resetFilters} disabled={!hasFilters}
            className="glass-button px-2.5 py-1.5 text-[11px] inline-flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 hover:text-orange-400">
            <RotateCcw size={12} />Réinitialiser
          </button>
          <div className="ml-auto text-zinc-500 text-sm">
            <span className="text-orange-400 font-semibold">{total.toLocaleString()}</span> joueurs
            {filteredData.length < data.length && (
              <span className="text-zinc-600 ml-1">(affichés : {filteredData.length})</span>
            )}
          </div>
        </div>

        {/* Ligne 3 — toggles */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.05]">
          <ToggleChip active={hideDevCenter} onClick={() => setHideDevCenter((v) => !v)}
            activeClass="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
            <EyeOff size={12} />Masquer Dev Center
          </ToggleChip>
          <div className="w-px h-5 bg-white/10" />
          <button onClick={checkListings} disabled={checkingListings || loading || data.length === 0}
            className={`px-3 py-1.5 text-[11px] inline-flex items-center gap-1.5 rounded-md border transition-all disabled:opacity-40 disabled:cursor-not-allowed font-medium ${
              listingsChecked
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                : 'bg-white/5 text-zinc-300 border-white/10 hover:text-emerald-400 hover:border-emerald-500/30'
            }`}>
            {checkingListings
              ? <><Loader2 size={12} className="animate-spin" />Vérification...</>
              : listingsChecked ? <><ShoppingCart size={12} />{forSaleCount} en vente</>
              : <><ShoppingCart size={12} />Vérifier les ventes</>
            }
          </button>
          {listingsChecked && (
            <ToggleChip active={showOnlyForSale} onClick={() => setShowOnlyForSale((v) => !v)}
              activeClass="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
              <ShoppingCart size={12} />
              {showOnlyForSale ? `En vente (${forSaleCount})` : 'Afficher seulement en vente'}
            </ToggleChip>
          )}
          <div className="w-px h-5 bg-white/10" />
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Prog attr :</span>
          {ATTR_KEYS.map(({ label, key }) => (
            <ToggleChip key={key} active={attrFilters.has(key)} onClick={() => toggleAttr(key)}>
              {label} ↑
            </ToggleChip>
          ))}
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
                    <th key={header.id} className="text-left px-4 py-3 text-[11px] font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                      {header.isPlaceholder ? null : (
                        <div className={header.column.getCanSort() ? 'cursor-pointer select-none flex items-center gap-1 hover:text-zinc-300 transition-colors' : ''}
                          onClick={header.column.getToggleSortingHandler()}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <span className="text-zinc-600">
                              {header.column.getIsSorted() === 'asc' ? <ArrowUp size={12} className="text-orange-400" /> :
                               header.column.getIsSorted() === 'desc' ? <ArrowDown size={12} className="text-orange-400" /> :
                               <ArrowUpDown size={12} />}
                            </span>
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.tr key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td colSpan={columns.length} className="text-center py-20">
                      <Loader2 size={24} className="animate-spin text-orange-500 mx-auto" />
                    </td>
                  </motion.tr>
                ) : table.getRowModel().rows.length === 0 ? (
                  <motion.tr key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td colSpan={columns.length} className="text-center py-20 text-zinc-500 text-sm">Aucun joueur trouvé.</td>
                  </motion.tr>
                ) : (
                  table.getRowModel().rows.map((row, index) => (
                    <motion.tr key={row.original.id}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      transition={{ delay: index * 0.015, duration: 0.2 }}
                      className={`border-b border-white/[0.04] transition-colors hover:bg-white/[0.03] ${
                        checkedIds.has(row.original.id) && (listings[row.original.id] ?? row.original.listingPrice) != null
                          ? 'bg-emerald-500/[0.04]' : ''
                      }`}>
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
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="glass-button p-2 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronLeft size={16} /></button>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="glass-button p-2 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  );
}
