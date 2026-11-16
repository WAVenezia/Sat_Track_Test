import React, { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import type { OrbitRegime, ParsedSatellite } from '../types/satellite';

interface CatalogDrawerProps {
  open: boolean;
  onClose: () => void;
  satellites: ParsedSatellite[];
  selectedSatId: string | null;
  onSelectSatellite: (satId: string) => void;
  onImportTle: (rawTle: string) => { error?: string };
}

const SAMPLE_TLE = `NOAA-21 (JPSS-2)
1 54234U 22150A   26319.50000000  .00000120  00000-0  58200-4 0  9998
2 54234  98.7450 245.1200 0001420  90.1200 270.0100 14.19552000201124`;

const REGIME_TEXT: Record<OrbitRegime, string> = {
  LEO: 'text-cyan-400',
  MEO: 'text-amber-400',
  GEO: 'text-blue-400',
  HEO: 'text-emerald-400',
};

export const CatalogDrawer: React.FC<CatalogDrawerProps> = ({
  open,
  onClose,
  satellites,
  selectedSatId,
  onSelectSatellite,
  onImportTle,
}) => {
  const [tab, setTab] = useState<'catalog' | 'import'>('catalog');
  const [query, setQuery] = useState('');
  const [tleInput, setTleInput] = useState('');
  const [tleError, setTleError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return satellites;
    return satellites.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        String(s.noradId).includes(q) ||
        s.operator.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    );
  }, [satellites, query]);

  if (!open) return null;

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = onImportTle(tleInput);
    if (result.error) {
      setTleError(result.error);
      return;
    }
    setTleError(null);
    setTleInput('');
    setTab('catalog');
  };

  return (
    <aside
      aria-label="Satellite catalog and TLE importer"
      className="pointer-events-auto fixed top-12 right-0 bottom-0 z-30 flex w-[380px] max-w-[94vw] flex-col border-l border-slate-800 bg-[#0B0E17]/97"
    >
      {/* Drawer Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-1 rounded border border-slate-800 bg-[#07090E] p-0.5">
          <button
            type="button"
            onClick={() => setTab('catalog')}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'catalog'
                ? 'bg-slate-800 text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Active Catalog ({satellites.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('import')}
            className={`inline-flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'import'
                ? 'bg-slate-800 text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            <span>Import TLE</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close catalog drawer"
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-800 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-100 cursor-pointer"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {tab === 'catalog' ? (
        <>
          {/* Search Input */}
          <div className="border-b border-slate-800 p-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
                aria-hidden="true"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search satellite, NORAD ID, or agency"
                className="w-full rounded-md border border-slate-800 bg-[#07090E] py-2 pr-3 pl-8 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/60 focus:outline-none"
              />
            </div>
          </div>

          {/* Satellite List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">
                No satellites match "{query}".
              </div>
            ) : (
              filtered.map((sat) => {
                const selected = sat.id === selectedSatId;
                return (
                  <button
                    key={sat.id}
                    type="button"
                    onClick={() => onSelectSatellite(sat.id)}
                    className={`w-full px-4 py-3 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400 ${
                      selected
                        ? 'bg-cyan-500/10'
                        : 'hover:bg-slate-900/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-100 truncate">
                        {sat.name}
                      </span>
                      <span
                        className={`font-mono text-[11px] font-medium shrink-0 ${REGIME_TEXT[sat.regime]}`}
                      >
                        {sat.regime}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span className="font-mono tabular-nums">#{sat.noradId}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{sat.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums shrink-0">
                        {sat.inclinationDeg.toFixed(1)}°
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </>
      ) : (
        <form onSubmit={handleImportSubmit} className="flex flex-1 flex-col gap-3 p-4">
          <div className="text-xs leading-relaxed text-slate-400">
            Paste a standard 2-line or 3-line NORAD TLE element set to propagate and visualize its real-time orbit.
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="tle-textarea" className="text-xs font-medium text-slate-200">
              TLE Element Lines
            </label>
            <button
              type="button"
              onClick={() => {
                setTleInput(SAMPLE_TLE);
                setTleError(null);
              }}
              className="text-xs font-medium text-cyan-400 hover:text-cyan-300 cursor-pointer"
            >
              Load Sample TLE
            </button>
          </div>

          <textarea
            id="tle-textarea"
            value={tleInput}
            onChange={(e) => setTleInput(e.target.value)}
            rows={5}
            placeholder={'SATELLITE NAME\n1 25544U ...\n2 25544  ...'}
            className="w-full rounded-md border border-slate-800 bg-[#07090E] p-3 font-mono text-[11px] leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-cyan-500/60 focus:outline-none"
          />

          {tleError && (
            <div className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {tleError}
            </div>
          )}

          <button
            type="submit"
            disabled={tleInput.trim().length === 0}
            className="mt-1 rounded-md border border-cyan-500/50 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            Track Object
          </button>
        </form>
      )}
    </aside>
  );
};
