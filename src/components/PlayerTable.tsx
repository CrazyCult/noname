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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
} from 'lucide-react';
import type { PlayerRow, ProgressionInterval } from '@/types/mfl';

interface ApiResponse {
  data: PlayerRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const columnHelper = createColumnHelper<PlayerRow>();

function ProgressionBadge({ value }: { value: number }) {
  if (value > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-400 text-xs font-medium">
        <TrendingUp size={12} />+{value}
      </span>
    );
  if (value < 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-red-400 text-xs font-medium">
        <TrendingDown size={12} />
        {value}
      </span>
    );
  return (
    <span className="inline-flex items-center text-zinc-600 text-xs">
      <Minus size={12} />
    </span>
  );
}

function PositionBadge({ position }: { position: string }) {
  const colors: Record<string, string> = {
    ST: 'bg-red-500/20 text-red-300 border-red-500/30',
    LW: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    RW: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    CAM: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    CM: 'bg-green-500/20 text-green-300 border-green-500/30',
    CDM: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    LB: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    RB: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    CB: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    GK: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  };

  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
        colors[position] || 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30'
      }`}
    >
      {position}
    </span>
  );
}

function OverallBadge({ value }: { value: number }) {
  let color = 'text-zinc-400';
  if (value >= 80) color = 'text-amber-400';
  else if (value >= 70) color = 'text-emerald-400';
  else if (value >= 60) color = 'text-blue-400';
  else if (value >= 50) color = 'text-zinc-300';

  return <span className={`font-bold text-lg ${color}`}>{value}</span>;
}

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
      return (
        <div>
          <div className="font-semibold text-white">
            {row.firstName} {row.lastName}
          </div>
          <div className="flex gap-1 mt-0.5">
            {row.positions.map((pos) => (
              <PositionBadge key={pos} position={pos} />
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
    header: 'Nationality',
    cell: (info) => (
      <span className="text-zinc-400 text-sm">
        {info.getValue()?.join(', ') || '-'}
      </span>
    ),
    enableSorting: false,
  }),
  columnHelper.accessor('ownerName', {
    header: 'Owner',
    cell: (info) => (
      <span className="text-zinc-400 text-sm truncate max-w-[150px] block">
        {info.getValue() || 'Free Agent'}
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
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-zinc-500 uppercase">OVR</span>
            <ProgressionBadge value={prog.overall} />
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-zinc-500 uppercase">PAC</span>
            <ProgressionBadge value={prog.pace} />
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-zinc-500 uppercase">SHO</span>
            <ProgressionBadge value={prog.shooting} />
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-zinc-500 uppercase">PAS</span>
            <ProgressionBadge value={prog.passing} />
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-zinc-500 uppercase">DRI</span>
            <ProgressionBadge value={prog.dribbling} />
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-zinc-500 uppercase">DEF</span>
            <ProgressionBadge value={prog.defense} />
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-zinc-500 uppercase">PHY</span>
            <ProgressionBadge value={prog.physical} />
          </div>
        </div>
      );
    },
    enableSorting: false,
  }),
];

const INTERVALS: { label: string; value: ProgressionInterval }[] = [
  { label: '24H', value: '24H' },
  { label: 'Week', value: 'WEEK' },
  { label: 'Month', value: 'MONTH' },
  { label: 'Season', value: 'CURRENT_SEASON' },
  { label: 'All Time', value: 'ALL' },
];

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
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'overall', desc: true },
  ]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sortBy = sorting[0]?.id || 'overall';
      const sortOrder = sorting[0]?.desc ? 'desc' : 'asc';

      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        sortBy,
        sortOrder,
        interval,
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (position) params.set('position', position);

      const res = await fetch(`/api/players?${params}`);
      const json: ApiResponse = await res.json();

      setData(json.data);
      setTotalPages(json.pagination.totalPages);
      setTotal(json.pagination.total);
    } catch (err) {
      console.error('Failed to fetch players:', err);
    } finally {
      setLoading(false);
    }
  }, [page, sorting, debouncedSearch, position, interval]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, position, interval]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  });

  const positions = [
    'ST',
    'LW',
    'RW',
    'CAM',
    'CM',
    'CDM',
    'LB',
    'RB',
    'CB',
    'GK',
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              size={16}
            />
            <input
              type="text"
              placeholder="Search players..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-colors"
            />
          </div>

          {/* Position Filter */}
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
          >
            <option value="">All Positions</option>
            {positions.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>

          {/* Interval Tabs */}
          <div className="flex gap-1 bg-white/5 rounded-lg p-1 border border-white/10">
            {INTERVALS.map((int) => (
              <button
                key={int.value}
                onClick={() => setInterval(int.value)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  interval === int.value
                    ? 'bg-blue-500/30 text-blue-300 border border-blue-500/30'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {int.label}
              </button>
            ))}
          </div>

          {/* Total Count */}
          <div className="text-zinc-500 text-sm">
            {total.toLocaleString()} players
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-white/10">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider"
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
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {header.column.getCanSort() && (
                            <>
                              {header.column.getIsSorted() === 'asc' ? (
                                <ArrowUp size={14} className="text-blue-400" />
                              ) : header.column.getIsSorted() === 'desc' ? (
                                <ArrowDown
                                  size={14}
                                  className="text-blue-400"
                                />
                              ) : (
                                <ArrowUpDown
                                  size={14}
                                  className="text-zinc-600"
                                />
                              )}
                            </>
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
                  <motion.tr
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <td
                      colSpan={columns.length}
                      className="text-center py-20 text-zinc-500"
                    >
                      <Loader2
                        className="animate-spin mx-auto mb-2"
                        size={24}
                      />
                      Loading players...
                    </td>
                  </motion.tr>
                ) : data.length === 0 ? (
                  <motion.tr
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <td
                      colSpan={columns.length}
                      className="text-center py-20 text-zinc-500"
                    >
                      No players found.
                    </td>
                  </motion.tr>
                ) : (
                  table.getRowModel().rows.map((row, index) => (
                    <motion.tr
                      key={row.original.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ delay: index * 0.02 }}
                      className="border-b border-white/5 hover:bg-white/[0.03] transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
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

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-zinc-500">
          Page {page} of {totalPages}
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
