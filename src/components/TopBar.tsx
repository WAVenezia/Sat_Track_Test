import React from 'react';
import type { RegimeFilter } from '../types/satellite';

interface TopBarProps {
  regimeFilter: RegimeFilter;
  onChangeRegime: (regime: RegimeFilter) => void;
  totalVisible: number;
  catalogOpen: boolean;
  onToggleCatalog: () => void;
}

const REGIME_OPTIONS: Array<{ value: RegimeFilter; label: string }> = [
  { value: 'ALL', label: 'All Orbits' },
  { value: 'LEO', label: 'LEO' },
  { value: 'MEO', label: 'MEO' },
  { value: 'GEO', label: 'GEO' },
  { value: 'HEO', label: 'HEO' },
];

export const TopBar: React.FC<TopBarProps> = ({
  regimeFilter,
  onChangeRegime,
  totalVisible,
  catalogOpen,
  onToggleCatalog,
}) => {
  return (
    <header className="pointer-events-auto relative z-20 flex h-12 w-full items-center justify-between gap-8 border-b border-slate-800/90 bg-[#07090E]/95 px-5">
      {/* Zone 1: Single text wordmark */}
      <a
        href="#top"
        onClick={(e) => e.preventDefault()}
        className="text-base font-semibold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
      >
        Apogee
      </a>

      {/* Zone 2: Regime filter segmented controls */}
      <nav
        aria-label="Orbital regime filter"
        className="hidden sm:flex items-center gap-1 rounded-md border border-slate-800 bg-[#0B0E17] p-0.5"
      >
        {REGIME_OPTIONS.map((opt) => {
          const active = regimeFilter === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChangeRegime(opt.value)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                active
                  ? 'bg-slate-800 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Primary action */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onToggleCatalog}
          aria-expanded={catalogOpen}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
            catalogOpen
              ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
              : 'border-slate-700 bg-[#111827] text-slate-100 hover:border-slate-500 hover:bg-slate-800'
          }`}
        >
          {catalogOpen ? 'Close Catalog' : `Catalog (${totalVisible})`}
        </button>
      </div>
    </header>
  );
};
