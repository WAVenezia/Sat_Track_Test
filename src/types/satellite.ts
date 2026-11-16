import type { SatRec } from 'satellite.js';

export type OrbitRegime = 'LEO' | 'MEO' | 'GEO' | 'HEO';

export type RegimeFilter = 'ALL' | OrbitRegime;

export type CameraPreset = 'global' | 'follow' | 'north' | 'equatorial';

export interface LayerSettings {
  showOrbits: boolean;
  showAllOrbits: boolean;
  showGroundTrack: boolean;
  showDayNight: boolean;
  showGrid: boolean;
  showFootprint: boolean;
  showClouds: boolean;
}

export interface SatelliteCatalogEntry {
  id: string;
  noradId: number;
  name: string;
  operator: string;
  category: string;
  line1: string;
  line2: string;
  isCustom?: boolean;
}

export interface ParsedSatellite extends SatelliteCatalogEntry {
  satrec: SatRec;
  regime: OrbitRegime;
  inclinationDeg: number;
  eccentricity: number;
  periodMin: number;
  apogeeKm: number;
  perigeeKm: number;
  meanMotionRevPerDay: number;
}

export interface SatelliteTelemetry {
  id: string;
  name: string;
  noradId: number;
  operator: string;
  category: string;
  regime: OrbitRegime;
  latDeg: number;
  lonDeg: number;
  altKm: number;
  speedKmS: number;
  periodMin: number;
  inclinationDeg: number;
  eccentricity: number;
  apogeeKm: number;
  perigeeKm: number;
  footprintRadiusKm: number;
  sunlit: boolean;
  sceneX: number;
  sceneY: number;
  sceneZ: number;
  velX: number;
  velY: number;
  velZ: number;
}
