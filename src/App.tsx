import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomDock } from './components/BottomDock';
import { CatalogDrawer } from './components/CatalogDrawer';
import { TopBar } from './components/TopBar';
import { DEFAULT_SATELLITE_CATALOG } from './data/satellites';
import { EarthScene } from './three/EarthScene';
import type {
  CameraPreset,
  LayerSettings,
  ParsedSatellite,
  RegimeFilter,
  SatelliteTelemetry,
} from './types/satellite';
import { parseCustomTleInput, parseSatelliteEntry } from './utils/orbitalMath';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<EarthScene | null>(null);

  const initialSatellites = useMemo(() => {
    return DEFAULT_SATELLITE_CATALOG.map(parseSatelliteEntry).filter(
      (s): s is ParsedSatellite => s !== null,
    );
  }, []);

  const [allSatellites, setAllSatellites] = useState<ParsedSatellite[]>(initialSatellites);
  const [regimeFilter, setRegimeFilter] = useState<RegimeFilter>('ALL');
  const [selectedSatId, setSelectedSatId] = useState<string | null>(
    initialSatellites[0]?.id ?? null,
  );
  const [telemetry, setTelemetry] = useState<SatelliteTelemetry | null>(null);
  const [simDate, setSimDate] = useState<Date>(() => new Date());
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(60);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('global');
  const [dockExpanded, setDockExpanded] = useState<boolean>(true);
  const [catalogOpen, setCatalogOpen] = useState<boolean>(false);
  const [hoverInfo, setHoverInfo] = useState<{ name: string; x: number; y: number } | null>(null);
  const [webglError, setWebglError] = useState<string>('');

  const [layers, setLayers] = useState<LayerSettings>({
    showOrbits: true,
    showAllOrbits: false,
    showGroundTrack: true,
    showDayNight: true,
    showGrid: true,
    showFootprint: true,
    showClouds: true,
  });

  const visibleSatellites = useMemo(() => {
    if (regimeFilter === 'ALL') return allSatellites;
    return allSatellites.filter((s) => s.regime === regimeFilter);
  }, [allSatellites, regimeFilter]);

  // Mount Three.js WebGL scene once in isolated ref container
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    let engine: EarthScene | null = null;
    try {
      engine = new EarthScene(mountEl, {
        onSelectSatellite: (satId) => {
          setSelectedSatId(satId);
        },
        onTelemetryUpdate: (tel) => {
          setTelemetry(tel);
        },
        onClockTick: (d) => {
          setSimDate(d);
        },
        onHoverSatellite: (info) => {
          setHoverInfo(info);
        },
        onWebglError: (msg) => {
          setWebglError(msg);
        },
      });
      sceneRef.current = engine;
      engine.setSimulationSpeed(60, false);
    } catch {
      setWebglError('WebGL2 acceleration is unavailable in this browser environment.');
    }

    return () => {
      engine?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Sync filtered satellites into Three.js scene
  useEffect(() => {
    const engine = sceneRef.current;
    if (!engine) return;
    engine.setSatellites(visibleSatellites);
  }, [visibleSatellites]);

  // Keep selected satellite valid when regime filter changes
  useEffect(() => {
    if (
      selectedSatId &&
      visibleSatellites.length > 0 &&
      !visibleSatellites.some((s) => s.id === selectedSatId)
    ) {
      setSelectedSatId(visibleSatellites[0].id);
    }
  }, [visibleSatellites, selectedSatId]);

  useEffect(() => {
    sceneRef.current?.setSelectedSatellite(selectedSatId);
  }, [selectedSatId]);

  useEffect(() => {
    sceneRef.current?.setLayers(layers);
  }, [layers]);

  useEffect(() => {
    sceneRef.current?.setSimulationSpeed(speedMultiplier, isPaused);
  }, [speedMultiplier, isPaused]);

  // Keyboard shortcuts (H: toggle controls, Space: pause/resume, Escape: close drawer)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'h' || e.key === 'H') {
        setDockExpanded((prev) => !prev);
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPaused((prev) => !prev);
      } else if (e.key === 'Escape') {
        setCatalogOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSelectCamera = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
    sceneRef.current?.setCameraPreset(preset);
  }, []);

  const handleToggleLayer = useCallback((key: keyof LayerSettings) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSyncNow = useCallback(() => {
    sceneRef.current?.syncToRealTime();
    setSpeedMultiplier(1);
    setIsPaused(false);
  }, []);

  const handleSelectFromCatalog = useCallback((satId: string) => {
    setSelectedSatId(satId);
    setCameraPreset('follow');
    // Wait a tick if switching from filtered view, then focus
    requestAnimationFrame(() => {
      sceneRef.current?.focusOnSelected();
    });
  }, []);

  const handleImportTle = useCallback((rawTle: string): { error?: string } => {
    const res = parseCustomTleInput(rawTle);
    if (res.error || !res.parsed) {
      return { error: res.error ?? 'Invalid TLE format.' };
    }
    const parsed = res.parsed;
    setAllSatellites((prev) => [parsed, ...prev]);
    setRegimeFilter('ALL');
    setSelectedSatId(parsed.id);
    requestAnimationFrame(() => {
      sceneRef.current?.focusOnSelected();
    });
    return {};
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#07090E]">
      {/* Dedicated WebGL Mount Container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
      />

      {/* WebGL Context Fallback */}
      {webglError && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#07090E] p-6">
          <div className="max-w-md rounded-lg border border-slate-800 bg-[#0B0E17] p-6 text-center">
            <h1 className="text-base font-semibold text-slate-100">
              3D Globe Renderer Unavailable
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              {webglError}
            </p>
          </div>
        </div>
      )}

      {/* Top Navigation Bar */}
      <TopBar
        regimeFilter={regimeFilter}
        onChangeRegime={setRegimeFilter}
        totalVisible={visibleSatellites.length}
        catalogOpen={catalogOpen}
        onToggleCatalog={() => setCatalogOpen((prev) => !prev)}
      />

      {/* Hover Tooltip on 3D Satellite Picking */}
      {hoverInfo && (
        <div
          className="pointer-events-none fixed z-30 rounded border border-slate-700 bg-[#0B0E17]/95 px-2.5 py-1 font-mono text-[11px] font-medium text-slate-100 whitespace-nowrap"
          style={{
            left: `${hoverInfo.x + 14}px`,
            top: `${hoverInfo.y - 12}px`,
          }}
        >
          {hoverInfo.name}
        </div>
      )}

      {/* Collapsible Bottom Control & Telemetry Dock */}
      <BottomDock
        dockExpanded={dockExpanded}
        onToggleDock={() => setDockExpanded((prev) => !prev)}
        simDate={simDate}
        speedMultiplier={speedMultiplier}
        isPaused={isPaused}
        onChangeSpeed={(spd) => {
          setSpeedMultiplier(spd);
          setIsPaused(false);
        }}
        onTogglePause={() => setIsPaused((prev) => !prev)}
        onSyncNow={handleSyncNow}
        cameraPreset={cameraPreset}
        onSelectCamera={handleSelectCamera}
        layers={layers}
        onToggleLayer={handleToggleLayer}
        telemetry={telemetry}
        onClearSelection={() => setSelectedSatId(null)}
        onFocusSelected={() => handleSelectCamera('follow')}
      />

      {/* Slide-Over Satellite Catalog & TLE Importer */}
      <CatalogDrawer
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        satellites={visibleSatellites}
        selectedSatId={selectedSatId}
        onSelectSatellite={handleSelectFromCatalog}
        onImportTle={handleImportTle}
      />
    </div>
  );
}
