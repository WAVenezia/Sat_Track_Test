import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  Globe,
  Pause,
  Play,
  RotateCcw,
  Sun,
  X,
} from 'lucide-react';
import type {
  CameraPreset,
  LayerSettings,
  OrbitRegime,
  SatelliteTelemetry,
} from '../types/satellite';

interface BottomDockProps {
  dockExpanded: boolean;
  onToggleDock: () => void;
  simDate: Date;
  speedMultiplier: number;
  isPaused: boolean;
  onChangeSpeed: (speed: number) => void;
  onTogglePause: () => void;
  onSyncNow: () => void;
  cameraPreset: CameraPreset;
  onSelectCamera: (preset: CameraPreset) => void;
  layers: LayerSettings;
  onToggleLayer: (key: keyof LayerSettings) => void;
  telemetry: SatelliteTelemetry | null;
  onClearSelection: () => void;
  onFocusSelected: () => void;
}

const SPEED_OPTIONS = [
  { value: 1, label: '1×' },
  { value: 10, label: '10×' },
  { value: 60, label: '60×' },
  { value: 300, label: '300×' },
  { value: 1000, label: '1000×' },
];

const REGIME_TEXT_COLOR: Record<OrbitRegime, string> = {
  LEO: 'text-cyan-400',
  MEO: 'text-amber-400',
  GEO: 'text-blue-400',
  HEO: 'text-emerald-400',
};

function formatLat(lat: number): string {
  const dir = lat >= 0 ? 'N' : 'S';
  return `${Math.abs(lat).toFixed(2)}° ${dir}`;
}

function formatLon(lon: number): string {
  const dir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lon).toFixed(2)}° ${dir}`;
}

function formatUtcClock(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export const BottomDock: React.FC<BottomDockProps> = ({
  dockExpanded,
  onToggleDock,
  simDate,
  speedMultiplier,
  isPaused,
  onChangeSpeed,
  onTogglePause,
  onSyncNow,
  cameraPreset,
  onSelectCamera,
  layers,
  onToggleLayer,
  telemetry,
  onClearSelection,
  onFocusSelected,
}) => {
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-20 flex w-[min(940px,94vw)] -translate-x-1/2 flex-col items-center gap-2">
      {/* Collapse / Expand Handle */}
      <button
        type="button"
        onClick={onToggleDock}
        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-[#0B0E17]/95 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700 hover:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      >
        {dockExpanded ? (
          <>
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Hide Controls</span>
          </>
        ) : (
          <>
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Show Controls</span>
          </>
        )}
      </button>

      {/* Main Collapsible Dock Container */}
      <div
        className={`pointer-events-auto w-full rounded-lg border border-slate-800 bg-[#0B0E17]/94 transition-all duration-200 ${
          dockExpanded
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-6 opacity-0 hidden'
        }`}
      >
        {/* Selected Satellite Live Telemetry Strip */}
        {telemetry && (
          <div className="border-b border-slate-800 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight text-slate-100 truncate">
                    {telemetry.name}
                  </h2>
                  <span className="text-xs text-slate-500" aria-hidden="true">·</span>
                  <span className={`text-xs font-mono font-medium ${REGIME_TEXT_COLOR[telemetry.regime]}`}>
                    {telemetry.regime}
                  </span>
                  <span className="text-xs text-slate-500" aria-hidden="true">·</span>
                  <span className="text-xs font-mono tabular-nums text-slate-400">
                    NORAD {telemetry.noradId}
                  </span>
                  <span className="text-xs text-slate-500" aria-hidden="true">·</span>
                  <span className="text-xs text-slate-400 truncate">
                    {telemetry.operator}
                  </span>
                  <span className="text-xs text-slate-500" aria-hidden="true">·</span>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium ${
                      telemetry.sunlit ? 'text-amber-300' : 'text-slate-400'
                    }`}
                  >
                    <Sun className="h-3 w-3" aria-hidden="true" />
                    {telemetry.sunlit ? 'Sunlit' : 'Umbra Eclipse'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onFocusSelected}
                  className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    cameraPreset === 'follow'
                      ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                      : 'border-slate-700 bg-[#111827] text-slate-200 hover:border-slate-500'
                  }`}
                >
                  <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{cameraPreset === 'follow' ? 'Following' : 'Track View'}</span>
                </button>
                <button
                  type="button"
                  onClick={onClearSelection}
                  aria-label="Clear selected satellite"
                  className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-800 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Tabular Orbital Readout Grid */}
            <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-800/70 pt-2.5 sm:grid-cols-4 lg:grid-cols-6">
              <div>
                <div className="text-[11px] font-medium text-slate-400">Altitude</div>
                <div className="font-mono text-sm font-semibold tabular-nums text-slate-100">
                  {telemetry.altKm.toFixed(1)}
                  <span className="ml-1 text-[11px] font-normal text-slate-400">km</span>
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-400">Velocity</div>
                <div className="font-mono text-sm font-semibold tabular-nums text-slate-100">
                  {telemetry.speedKmS.toFixed(2)}
                  <span className="ml-1 text-[11px] font-normal text-slate-400">km/s</span>
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-400">Latitude</div>
                <div className="font-mono text-sm font-semibold tabular-nums text-slate-100">
                  {formatLat(telemetry.latDeg)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-400">Longitude</div>
                <div className="font-mono text-sm font-semibold tabular-nums text-slate-100">
                  {formatLon(telemetry.lonDeg)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-400">Period / Inc</div>
                <div className="font-mono text-sm font-semibold tabular-nums text-slate-100">
                  {telemetry.periodMin.toFixed(1)}
                  <span className="ml-0.5 text-[11px] font-normal text-slate-400">m</span>
                  <span className="mx-1 text-slate-600">/</span>
                  {telemetry.inclinationDeg.toFixed(1)}°
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-400">Perigee / Apogee</div>
                <div className="font-mono text-sm font-semibold tabular-nums text-slate-100">
                  {Math.round(telemetry.perigeeKm)}
                  <span className="mx-0.5 text-slate-600">/</span>
                  {Math.round(telemetry.apogeeKm)}
                  <span className="ml-1 text-[11px] font-normal text-slate-400">km</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Controls Bar: Time Warp · Camera Presets · Display Layers */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          {/* Simulation Clock & Speed Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onTogglePause}
              aria-label={isPaused ? 'Resume simulation' : 'Pause simulation'}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-700 bg-[#111827] text-slate-100 transition-colors hover:border-slate-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              {isPaused ? (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>

            <div className="flex items-center rounded border border-slate-800 bg-[#07090E] p-0.5">
              {SPEED_OPTIONS.map((opt) => {
                const active = speedMultiplier === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChangeSpeed(opt.value)}
                    className={`px-2 py-1 font-mono text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-slate-800 text-cyan-300'
                        : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onSyncNow}
              className="inline-flex items-center gap-1 rounded border border-slate-800 bg-[#111827] px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
              title="Reset simulation clock to current UTC time"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              <span>Sync Now</span>
            </button>

            <span className="font-mono text-xs tabular-nums text-slate-400 whitespace-nowrap">
              {formatUtcClock(simDate)}
            </span>
          </div>

          {/* Camera Views & Layer Toggles */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded border border-slate-800 bg-[#07090E] p-0.5">
              <button
                type="button"
                onClick={() => onSelectCamera('global')}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  cameraPreset === 'global'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Globe className="h-3 w-3" aria-hidden="true" />
                <span>Global</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectCamera('north')}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  cameraPreset === 'north'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Polar
              </button>
              <button
                type="button"
                onClick={() => onSelectCamera('equatorial')}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  cameraPreset === 'equatorial'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Equatorial
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  ['showOrbits', 'Orbit'],
                  ['showAllOrbits', 'All Rings'],
                  ['showGroundTrack', 'Ground Track'],
                  ['showFootprint', 'Footprint'],
                  ['showDayNight', 'Terminator'],
                  ['showGrid', 'Grid'],
                ] as Array<[keyof LayerSettings, string]>
              ).map(([key, label]) => {
                const enabled = layers[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onToggleLayer(key)}
                    aria-pressed={enabled}
                    className={`rounded border px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      enabled
                        ? 'border-cyan-500/45 bg-cyan-500/12 text-cyan-200'
                        : 'border-slate-800 bg-[#07090E] text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
