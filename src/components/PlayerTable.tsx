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
  TrendingUp, TrendingDown, Minus,
  Loader2, SlidersHorizontal, X,
} from 'lucide-react';
import type { PlayerRow, ProgressionInterval } from '@/types/mfl';

interface ApiResponse {
  data: PlayerRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number; };
}

// ─── Drapeaux emoji ───────────────────────────────────────────────────────────
const FLAGS: Record<string, string> = {
  France: '🇫🇷', Germany: '🇩🇪', Spain: '🇪🇸', Italy: '🇮🇹',
  Portugal: '🇵🇹', Brazil: '🇧🇷', Argentina: '🇦🇷', England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  Netherlands: '🇳🇱', Belgium: '🇧🇪', Croatia: '🇭🇷', Poland: '🇵🇱',
  Senegal: '🇸🇳', Morocco: '🇲🇦', Nigeria: '🇳🇬', 'Ivory Coast': '🇨🇮',
  Ghana: '🇬🇭', Cameroon: '🇨🇲', Egypt: '🇪🇬', Japan: '🇯🇵',
  'South Korea': '🇰🇷', Australia: '🇦🇺', USA: '🇺🇸', Mexico: '🇲🇽',
  Colombia: '🇨🇴', Uruguay: '🇺🇾', Chile: '🇨🇱', Ecuador: '🇪🇨',
  Peru: '🇵🇪', Venezuela: '🇻🇪', Sweden: '🇸🇪', Denmark: '🇩🇰',
  Norway: '🇳🇴', Switzerland: '🇨🇭', Austria: '🇦🇹', 'Czech Republic': '🇨🇿',
  Slovakia: '🇸🇰', Hungary: '🇭🇺', Romania: '🇷🇴', Serbia: '🇷🇸',
  Ukraine: '🇺🇦', Russia: '🇷🇺', Turkey: '🇹🇷', Greece: '🇬🇷',
  Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', Wales: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', Ireland: '🇮🇪', Algeria: '🇩🇿',
  Tunisia: '🇹🇳', Mali: '🇲🇱', Guinea: '🇬🇳', Gabon: '🇬🇦',
  'DR Congo': '🇨🇩', Canada: '🇨🇦', Jamaica: '🇯🇲', 'Costa Rica': '🇨🇷',
  Paraguay: '🇵🇾', Bolivia: '🇧🇴', Honduras: '🇭🇳', China: '🇨🇳',
  Iran: '🇮🇷', 'Saudi Arabia': '🇸🇦', Qatar: '🇶🇦', Finland: '🇫🇮',
  Iceland: '🇮🇸', Slovenia: '🇸🇮', Albania: '🇦🇱', 'North Macedonia': '🇲🇰',
  'Cape Verde': '🇨🇻', 'South Africa': '🇿🇦', Burkina_Faso: '🇧🇫',
  'Burkina Faso': '🇧🇫', Angola: '🇦🇴', Mozambique: '🇲🇿', Kenya: '🇰🇪',
  'Guinea-Bissau': '🇬🇼', Liberia: '🇱🇷', 'Sierra Leone': '🇸🇱',
  Congo: '🇨🇬', Benin: '🇧🇯', Togo: '🇹🇬', Niger: '🇳🇪',
  Somalia: '🇸🇴', Ethiopia: '🇪🇹', Sudan: '🇸🇩', Libya: '🇱🇾',
  Lebanon: '🇱🇧', Iraq: '🇮🇶', UAE: '🇦🇪', India: '🇮🇳',
  Thailand: '🇹🇭', Vietnam: '🇻🇳', Indonesia: '🇮🇩', Philippines: '🇵🇭',
};

function getFlag(nat: string) { return FLAGS[nat] || '🏳️'; }

// ─── Couleurs postes ──────────────────────────────────────────────────────────
const POS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  GK:  { bg: '#2a0044', color: '#cc88ff', border: '#9933cc' },
  CB:  { bg: '#001a44', color: '#88aaff', border: '#3366cc' },
  RB:  { bg: '#001a44', color: '#88ccff', border: '#2266bb' },
  LB:  { bg: '#001a44', color: '#88ccff', border: '#2266bb' },
  RWB: { bg: '#001a33', color: '#66ddff', border: '#0099bb' },
  LWB: { bg: '#001a33', color: '#66ddff', border: '#0099bb' },
  CDM: { bg: '#001a1a', color: '#66ffee', border: '#009988' },
  CM:  { bg: '#001a00', color: '#66ff99', border: '#009944' },
  CAM: { bg: '#0d2200', color: '#aaff44', border: '#66bb00' },
  RM:  { bg: '#221100', color: '#ffcc44', border: '#bb8800' },
  LM:  { bg: '#221100', color: '#ffcc44', border: '#bb8800' },
  RW:  { bg: '#2a1000', color: '#ff8844', border: '#cc5500' },
  LW:  { bg: '#2a1000', color: '#ff8844', border: '#cc5500' },
  CF:  { bg: '#2a0000', color: '#ff6666', border: '#cc2222' },
  ST:  { bg: '#330000', color: '#ff4444', border: '#FF6600' },
};

// ─── Intervalles ──────────────────────────────────────────────────────────────
const INTERVALS: { label: string; value: ProgressionInterval }[] = [
  { label: '24H', value: '24H' },
  { label: 'WEEK', value: 'WEEK' },
  { label: 'MONTH', value: 'MONTH' },
  { label: 'SEASON', value: 'CURRENT_SEASON' },
  { label: 'ALL', value: 'ALL' },
];

// ─── Sub-composants ───────────────────────────────────────────────────────────
function ProgBadge({ value }: { value: number }) {
  if (value > 0) return (
    <span style={{ color: '#00FF00', fontSize: '0.75em', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      <TrendingUp size={10} />+{value}
    </span>
  );
  if (value < 0) return (
    <span style={{ color: '#FF6600', fontSize: '0.75em', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      <TrendingDown size={10} />{value}
    </span>
  );
  return <span style={{ color: '#333333', fontSize: '0.75em', display: 'inline-flex' }}><Minus size={10} /></span>;
}

function PosBadge({ position }: { position: string }) {
  const c = POS_COLORS[position] || { bg: '#111', color: '#888', border: '#444' };
  return (
    <span style={{
      display: 'inline-block',
      backgroundColor: c.bg,
      color: c.color,
      border: `1px solid ${c.border}`,
      padding: '1px 5px',
      fontSize: '0.6em',
      fontFamily: "'Press Start 2P', monospace",
      letterSpacing: '0',
      lineHeight: '1.6',
    }}>
      {position}
    </span>
  );
}

function OvrBadge({ value }: { value: number }) {
  let color = '#555555';
  if (value >= 85) color = '#FFD700';
  else if (value >= 80) color = '#FF9900';
  else if (value >= 70) color = '#00FF00';
  else if (value >= 60) color = '#4488FF';
  else if (value >= 50) color = '#AAAAAA';
  return (
    <span style={{
      fontFamily: "'Press Start 2P', monospace",
      fontWeight: 'bold',
      fontSize: '1em',
      color,
      textShadow: value >= 80 ? `0 0 8px ${color}55` : 'none',
    }}>
      {value}
    </span>
  );
}

function NatFlags({ nats }: { nats: string[] }) {
  if (!nats?.length) return <span style={{ color: '#333' }}>—</span>;
  return (
    <span style={{ display: 'flex', gap: '3px', alignItems: 'center', flexWrap: 'wrap' }}>
      {nats.map(n => (
        <span key={n} title={n} style={{ fontSize: '1.1em', lineHeight: 1 }}>{getFlag(n)}</span>
      ))}
    </span>
  );
}

const columnHelper = createColumnHelper<PlayerRow>();

const PROG_ATTRS = [
  { label: 'OVR', key: 'overall', cls: 'attr-overall' },
  { label: 'PAC', key: 'pace', cls: 'attr-pace' },
  { label: 'SHO', key: 'shooting', cls: 'attr-shooting' },
  { label: 'PAS', key: 'passing', cls: 'attr-passing' },
  { label: 'DRI', key: 'dribbling', cls: 'attr-dribbling' },
  { label: 'DEF', key: 'defense', cls: 'attr-defense' },
  { label: 'PHY', key: 'physical', cls: 'attr-physical' },
];

const columns = [
  columnHelper.accessor('id', {
    header: 'ID',
    cell: i => <span style={{ color: '#444', fontSize: '0.65em', fontFamily: 'monospace' }}>{i.getValue()}</span>,
  }),
  columnHelper.accessor(r => `${r.firstName} ${r.lastName}`, {
    id: 'name',
    header: 'JOUEUR',
    cell: i => {
      const row = i.row.original;
      return (
        <div>
          <div style={{ fontFamily: "'Press Start 2P', monospace", color: '#FFFFFF', fontSize: '0.75em', marginBottom: '4px' }}>
            {row.firstName} {row.lastName}
          </div>
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
            {(row.positions as string[])?.map(p => <PosBadge key={p} position={p} />)}
          </div>
        </div>
      );
    },
  }),
  columnHelper.accessor('overall', {
    header: 'OVR',
    cell: i => <OvrBadge value={i.getValue()} />,
  }),
  columnHelper.accessor('age', {
    header: 'AGE',
    cell: i => <span style={{ color: '#AAAAAA', fontSize: '0.8em' }}>{i.getValue()}</span>,
  }),
  columnHelper.accessor('nationalities', {
    header: 'NAT',
    cell: i => <NatFlags nats={i.getValue() as string[]} />,
    enableSorting: false,
  }),
  columnHelper.accessor('ownerName', {
    header: 'OWNER',
    cell: i => (
      <span style={{
        fontSize: '0.65em',
        color: i.getValue() ? '#CCCCCC' : '#333333',
        fontStyle: i.getValue() ? 'normal' : 'italic',
        display: 'block',
        maxWidth: '150px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {i.getValue() || 'FREE AGENT'}
      </span>
    ),
    enableSorting: false,
  }),
  columnHelper.accessor('progression', {
    header: 'PROGRESSION',
    cell: i => {
      const prog = i.getValue();
      if (!prog) return <span style={{ color: '#333', fontSize: '0.65em' }}>N/A</span>;
      return (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {PROG_ATTRS.map(({ label, key }) => (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <span style={{ fontSize: '0.5em', color: '#444444', letterSpacing: '0.05em' }}>{label}</span>
              <ProgBadge value={(prog as Record<string, number>)[key]} />
            </div>
          ))}
        </div>
      );
    },
    enableSorting: false,
  }),
];

// ─── Composant principal ──────────────────────────────────────────────────────
export default function PlayerTable() {
  const [data, setData] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [position, setPosition] = useState('');
  const [interval, setInterval] = useState<ProgressionInterval>('WEEK');

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [ovrMin, setOvrMin] = useState('');
  const [ovrMax, setOvrMax] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<'' | 'owned' | 'free'>('');

  const [sorting, setSorting] = useState<SortingState>([{ id: 'overall', desc: true }]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

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
      if (ownerFilter) params.set('ownerFilter', ownerFilter);

      const res = await fetch(`/api/players?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResponse = await res.json();
      setData(json.data);
      setTotalPages(json.pagination.totalPages);
      setTotal(json.pagination.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, sorting, debouncedSearch, position, interval, ageMin, ageMax, ovrMin, ovrMax, ownerFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, position, interval, ageMin, ageMax, ovrMin, ovrMax, ownerFilter]);

  const hasFilters = ageMin || ageMax || ovrMin || ovrMax || ownerFilter;

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  });

  const S = {
    // Styles inline réutilisables
    card: {
      backgroundColor: '#000000',
      border: '1px solid #FF6600',
      boxShadow: '0 0 8px rgba(255,102,0,0.25)',
      marginBottom: '16px',
    } as React.CSSProperties,
    cardHeader: {
      backgroundColor: '#330000',
      padding: '8px 14px',
      borderBottom: '1px solid #FF6600',
      fontFamily: "'Press Start 2P', monospace",
      color: '#FF6600',
      fontSize: '0.6em',
      letterSpacing: '0.06em',
    } as React.CSSProperties,
    input: {
      backgroundColor: '#0a0a0a',
      border: '1px solid #333333',
      color: '#FFFFFF',
      padding: '7px 10px',
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '0.6em',
      outline: 'none',
      width: '100%',
    } as React.CSSProperties,
    select: {
      backgroundColor: '#0a0a0a',
      border: '1px solid #333333',
      color: '#FFFFFF',
      padding: '7px 10px',
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '0.55em',
      outline: 'none',
      cursor: 'pointer',
    } as React.CSSProperties,
  };

  return (
    <div>
      {/* ── Filtres principaux ── */}
      <div style={S.card}>
        <div style={S.cardHeader}>▶ FILTRES ET RECHERCHE</div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>

            {/* Search */}
            <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
              <Search style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#444' }} size={14} />
              <input
                type="text"
                placeholder="SEARCH PLAYER..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ ...S.input, paddingLeft: '28px' }}
              />
            </div>

            {/* Position */}
            <select value={position} onChange={e => setPosition(e.target.value)} style={S.select}>
              <option value="">ALL POSITIONS</option>
              <optgroup label="── GARDIEN ──">
                <option value="GK">GK — Goalkeeper</option>
              </optgroup>
              <optgroup label="── DÉFENSEURS ──">
                <option value="CB">CB — Centre Back</option>
                <option value="RB">RB — Right Back</option>
                <option value="LB">LB — Left Back</option>
                <option value="RWB">RWB — Right Wing Back</option>
                <option value="LWB">LWB — Left Wing Back</option>
              </optgroup>
              <optgroup label="── MILIEUX ──">
                <option value="CDM">CDM — Defensive Mid</option>
                <option value="CM">CM — Central Mid</option>
                <option value="CAM">CAM — Attacking Mid</option>
                <option value="RM">RM — Right Mid</option>
                <option value="LM">LM — Left Mid</option>
              </optgroup>
              <optgroup label="── ATTAQUANTS ──">
                <option value="RW">RW — Right Winger</option>
                <option value="LW">LW — Left Winger</option>
                <option value="CF">CF — Centre Forward</option>
                <option value="ST">ST — Striker</option>
              </optgroup>
            </select>

            {/* Intervalles */}
            <div style={{ display: 'flex', gap: '2px', backgroundColor: '#0a0000', padding: '3px', border: '1px solid #330000' }}>
              {INTERVALS.map(int => (
                <button
                  key={int.value}
                  onClick={() => setInterval(int.value)}
                  style={{
                    backgroundColor: interval === int.value ? '#FF6600' : 'transparent',
                    color: interval === int.value ? '#000000' : '#555555',
                    border: 'none',
                    padding: '5px 10px',
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.55em',
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                    letterSpacing: '0.04em',
                  }}
                >
                  {int.label}
                </button>
              ))}
            </div>

            {/* Advanced toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                backgroundColor: hasFilters ? '#330000' : '#000000',
                color: hasFilters ? '#FF6600' : '#444444',
                border: `1px solid ${hasFilters ? '#FF6600' : '#333333'}`,
                padding: '6px 10px',
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.55em',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <SlidersHorizontal size={12} />
              FILTRES {hasFilters && <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#FF6600', display: 'inline-block' }} />}
            </button>

            {/* Total */}
            <div style={{ marginLeft: 'auto', fontFamily: "'Press Start 2P', monospace", fontSize: '0.55em', color: '#555555' }}>
              <span style={{ color: '#FF6600' }}>{total.toLocaleString()}</span> JOUEURS
            </div>
          </div>

          {/* ── Filtres avancés ── */}
          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              style={{
                marginTop: '12px',
                paddingTop: '12px',
                borderTop: '1px solid #330000',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '16px',
                alignItems: 'flex-end',
              }}
            >
              {/* Âge */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.5em', color: '#555', letterSpacing: '0.06em' }}>ÂGE</label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input type="number" placeholder="MIN" value={ageMin} onChange={e => setAgeMin(e.target.value)}
                    style={{ ...S.input, width: '60px', textAlign: 'center' }} />
                  <span style={{ color: '#333', fontSize: '0.7em' }}>→</span>
                  <input type="number" placeholder="MAX" value={ageMax} onChange={e => setAgeMax(e.target.value)}
                    style={{ ...S.input, width: '60px', textAlign: 'center' }} />
                </div>
              </div>

              {/* Overall */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.5em', color: '#555', letterSpacing: '0.06em' }}>OVERALL</label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input type="number" placeholder="MIN" value={ovrMin} onChange={e => setOvrMin(e.target.value)}
                    style={{ ...S.input, width: '60px', textAlign: 'center' }} />
                  <span style={{ color: '#333', fontSize: '0.7em' }}>→</span>
                  <input type="number" placeholder="MAX" value={ovrMax} onChange={e => setOvrMax(e.target.value)}
                    style={{ ...S.input, width: '60px', textAlign: 'center' }} />
                </div>
              </div>

              {/* Owner */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.5em', color: '#555', letterSpacing: '0.06em' }}>OWNERSHIP</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[
                    { v: '' as const, label: 'TOUS' },
                    { v: 'owned' as const, label: 'OWNED' },
                    { v: 'free' as const, label: 'FREE' },
                  ].map(opt => (
                    <button
                      key={opt.v}
                      onClick={() => setOwnerFilter(opt.v)}
                      style={{
                        backgroundColor: ownerFilter === opt.v ? '#FF6600' : '#000000',
                        color: ownerFilter === opt.v ? '#000000' : '#555555',
                        border: `1px solid ${ownerFilter === opt.v ? '#FF6600' : '#333333'}`,
                        padding: '5px 8px',
                        fontFamily: "'Press Start 2P', monospace",
                        fontSize: '0.5em',
                        cursor: 'pointer',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reset */}
              {hasFilters && (
                <button
                  onClick={() => { setAgeMin(''); setAgeMax(''); setOvrMin(''); setOvrMax(''); setOwnerFilter(''); }}
                  style={{
                    backgroundColor: '#000000',
                    color: '#FF3333',
                    border: '1px solid #FF3333',
                    padding: '5px 10px',
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '0.5em',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <X size={10} /> RESET
                </button>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Tableau ── */}
      <div style={S.card}>
        <div style={S.cardHeader}>▶ DONNÉES JOUEURS — {total.toLocaleString()} RÉSULTATS</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Press Start 2P', monospace" }}>
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id} style={{ backgroundColor: '#1a0000', borderBottom: '1px solid #FF6600' }}>
                  {hg.headers.map(header => (
                    <th
                      key={header.id}
                      style={{
                        textAlign: 'left',
                        padding: '10px 12px',
                        fontSize: '0.6em',
                        color: '#FF6600',
                        letterSpacing: '0.06em',
                        fontWeight: 'normal',
                        whiteSpace: 'nowrap',
                        cursor: header.column.getCanSort() ? 'pointer' : 'default',
                        userSelect: 'none',
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {header.isPlaceholder ? null : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            header.column.getIsSorted() === 'asc'
                              ? <ArrowUp size={12} color="#FF6600" />
                              : header.column.getIsSorted() === 'desc'
                              ? <ArrowDown size={12} color="#FF6600" />
                              : <ArrowUpDown size={12} color="#333333" />
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
                  <tr key="loading">
                    <td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center' }}>
                      <div style={{ color: '#FF6600', fontFamily: "'Press Start 2P', monospace", fontSize: '0.65em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                        <Loader2 size={16} className="animate-spin" />
                        CHARGEMENT...
                      </div>
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr key="empty">
                    <td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: '#333', fontFamily: "'Press Start 2P', monospace", fontSize: '0.6em' }}>
                      AUCUN JOUEUR TROUVÉ
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row, i) => (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: i * 0.008 }}
                      style={{
                        backgroundColor: i % 2 === 0 ? '#0a0000' : '#0d0000',
                        borderBottom: '1px solid #1a0000',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1a0800')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#0a0000' : '#0d0000')}
                    >
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
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

        {/* ── Pagination ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderTop: '1px solid #330000',
          backgroundColor: '#0a0000',
        }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              backgroundColor: '#000000',
              color: page === 1 ? '#222222' : '#FF6600',
              border: `1px solid ${page === 1 ? '#222222' : '#FF6600'}`,
              padding: '5px 10px',
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '0.55em',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <ChevronLeft size={12} /> PREV
          </button>

          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.55em', color: '#555555' }}>
            PAGE <span style={{ color: '#FF6600' }}>{page}</span> / {totalPages}
          </span>

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              backgroundColor: '#000000',
              color: page === totalPages ? '#222222' : '#FF6600',
              border: `1px solid ${page === totalPages ? '#222222' : '#FF6600'}`,
              padding: '5px 10px',
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '0.55em',
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            NEXT <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
