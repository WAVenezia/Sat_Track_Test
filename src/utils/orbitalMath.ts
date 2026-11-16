import {
  degreesLat,
  degreesLong,
  eciToEcf,
  eciToGeodetic,
  gstime,
  jday,
  propagate,
  radiansToDegrees,
  SatRecError,
  sunPos,
  twoline2satrec,
  type EcfVec3,
  type EciVec3,
  type SatRec,
} from 'satellite.js';
import type {
  OrbitRegime,
  ParsedSatellite,
  SatelliteCatalogEntry,
  SatelliteTelemetry,
} from '../types/satellite';

export const EARTH_RADIUS_KM = 6371.0;
export const GLOBE_RADIUS = 1.0; // 1 Three.js unit = 6371 km
const MU_EARTH = 398600.4418; // km^3 / s^2

export function kmToGlobeUnits(km: number): number {
  return km / EARTH_RADIUS_KM;
}

/**
 * Converts ECEF (km) to Three.js world coordinates (Globe radius = 1.0).
 * Aligns with Three.js SphereGeometry UV mapping:
 *   +X = Prime Meridian (0 deg lon, 0 deg lat)
 *   +Y = North Pole (+90 deg lat)
 *   -Z = +90 deg East lon
 */
export function ecfKmToScene(
  ecf: EcfVec3<number>,
  out: { x: number; y: number; z: number },
): void {
  const scale = GLOBE_RADIUS / EARTH_RADIUS_KM;
  out.x = ecf.x * scale;
  out.y = ecf.z * scale;
  out.z = -ecf.y * scale;
}

/**
 * Converts geodetic lat/lon (radians) + altitude (km) to Three.js world position.
 */
export function geodeticToScene(
  latRad: number,
  lonRad: number,
  altKm: number,
  out: { x: number; y: number; z: number },
): void {
  const r = (EARTH_RADIUS_KM + altKm) / EARTH_RADIUS_KM;
  const cosLat = Math.cos(latRad);
  out.x = r * cosLat * Math.cos(lonRad);
  out.y = r * Math.sin(latRad);
  out.z = -r * cosLat * Math.sin(lonRad);
}

export function classifyRegime(
  apogeeKm: number,
  perigeeKm: number,
  eccentricity: number,
  periodMin: number,
): OrbitRegime {
  if (eccentricity >= 0.06) return 'HEO';
  const avgAlt = (apogeeKm + perigeeKm) * 0.5;
  if (avgAlt < 2200) return 'LEO';
  if (periodMin >= 1380 && periodMin <= 1490 && eccentricity < 0.06) return 'GEO';
  if (avgAlt > 33000) return 'GEO';
  return 'MEO';
}

export function parseSatelliteEntry(entry: SatelliteCatalogEntry): ParsedSatellite | null {
  try {
    const satrec: SatRec = twoline2satrec(entry.line1.trim(), entry.line2.trim());
    if (satrec.error !== SatRecError.None) {
      return null;
    }

    // satrec.no is mean motion in radians/minute
    const meanMotionRadPerSec = satrec.no / 60;
    if (!Number.isFinite(meanMotionRadPerSec) || meanMotionRadPerSec <= 0) {
      return null;
    }

    const periodMin = (2 * Math.PI) / satrec.no;
    const meanMotionRevPerDay = 1440 / periodMin;
    const semiMajorAxisKm = Math.cbrt(MU_EARTH / (meanMotionRadPerSec * meanMotionRadPerSec));
    const eccentricity = satrec.ecco;
    const apogeeKm = Math.max(0, semiMajorAxisKm * (1 + eccentricity) - EARTH_RADIUS_KM);
    const perigeeKm = Math.max(0, semiMajorAxisKm * (1 - eccentricity) - EARTH_RADIUS_KM);
    const inclinationDeg = radiansToDegrees(satrec.inclo);
    const regime = classifyRegime(apogeeKm, perigeeKm, eccentricity, periodMin);

    // Quick propagation sanity check
    const probe = propagate(satrec, new Date());
    if (!probe || !probe.position || !probe.velocity) {
      return null;
    }

    return {
      ...entry,
      satrec,
      regime,
      inclinationDeg,
      eccentricity,
      periodMin,
      apogeeKm,
      perigeeKm,
      meanMotionRevPerDay,
    };
  } catch {
    return null;
  }
}

/**
 * Computes unit Sun direction vector in Three.js ECF scene space for a UTC Date.
 */
export function getSunDirectionScene(
  date: Date,
  out: { x: number; y: number; z: number },
): void {
  const jd = jday(date);
  const gmst = gstime(jd);
  const { rsun } = sunPos(jd);
  const ecfSun = eciToEcf(rsun, gmst);
  const len = Math.hypot(ecfSun.x, ecfSun.y, ecfSun.z) || 1;
  out.x = ecfSun.x / len;
  out.y = ecfSun.z / len;
  out.z = -ecfSun.y / len;
}

/**
 * Checks whether a satellite at ECI position (km) is sunlit given Sun ECI direction.
 */
function isSatelliteSunlit(
  satEciKm: EciVec3<number>,
  sunDirEciUnit: { x: number; y: number; z: number },
): boolean {
  const dot =
    satEciKm.x * sunDirEciUnit.x +
    satEciKm.y * sunDirEciUnit.y +
    satEciKm.z * sunDirEciUnit.z;
  if (dot >= 0) return true; // On sunward side of Earth terminator plane
  // Distance from Earth-Sun axis
  const projX = dot * sunDirEciUnit.x;
  const projY = dot * sunDirEciUnit.y;
  const projZ = dot * sunDirEciUnit.z;
  const perpSq =
    (satEciKm.x - projX) ** 2 +
    (satEciKm.y - projY) ** 2 +
    (satEciKm.z - projZ) ** 2;
  return perpSq > EARTH_RADIUS_KM * EARTH_RADIUS_KM;
}

const _tmpScenePos = { x: 0, y: 0, z: 0 };
const _tmpVelScene = { x: 0, y: 0, z: 0 };

export function propagateSatelliteTelemetry(
  sat: ParsedSatellite,
  date: Date,
  gmstCache?: number,
  sunEciUnitCache?: { x: number; y: number; z: number },
): SatelliteTelemetry | null {
  const pv = propagate(sat.satrec, date);
  if (!pv || !pv.position || !pv.velocity) return null;

  const gmst = gmstCache ?? gstime(date);
  const ecfPos = eciToEcf(pv.position, gmst);
  const geodetic = eciToGeodetic(pv.position, gmst);

  ecfKmToScene(ecfPos, _tmpScenePos);

  // Convert inertial velocity to ECF scene direction for spacecraft attitude alignment
  const velEcf = eciToEcf(pv.velocity, gmst);
  const vMag = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z);
  const velNorm = Math.hypot(velEcf.x, velEcf.y, velEcf.z) || 1;
  _tmpVelScene.x = velEcf.x / velNorm;
  _tmpVelScene.y = velEcf.z / velNorm;
  _tmpVelScene.z = -velEcf.y / velNorm;

  let sunUnit = sunEciUnitCache;
  if (!sunUnit) {
    const { rsun } = sunPos(jday(date));
    const len = Math.hypot(rsun.x, rsun.y, rsun.z) || 1;
    sunUnit = { x: rsun.x / len, y: rsun.y / len, z: rsun.z / len };
  }

  const altKm = Math.max(0, geodetic.height);
  // Horizon visibility footprint arc radius on Earth's surface
  const centralAngle = Math.acos(
    Math.min(1, EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altKm)),
  );
  const footprintRadiusKm = EARTH_RADIUS_KM * centralAngle;

  return {
    id: sat.id,
    name: sat.name,
    noradId: sat.noradId,
    operator: sat.operator,
    category: sat.category,
    regime: sat.regime,
    latDeg: degreesLat(geodetic.latitude),
    lonDeg: degreesLong(geodetic.longitude),
    altKm,
    speedKmS: vMag,
    periodMin: sat.periodMin,
    inclinationDeg: sat.inclinationDeg,
    eccentricity: sat.eccentricity,
    apogeeKm: sat.apogeeKm,
    perigeeKm: sat.perigeeKm,
    footprintRadiusKm,
    sunlit: isSatelliteSunlit(pv.position, sunUnit),
    sceneX: _tmpScenePos.x,
    sceneY: _tmpScenePos.y,
    sceneZ: _tmpScenePos.z,
    velX: _tmpVelScene.x,
    velY: _tmpVelScene.y,
    velZ: _tmpVelScene.z,
  };
}

/**
 * Samples 1 full inertial orbital path centered around `date` (for smooth 3D orbit ring).
 * Each ECI sample is rotated by the CURRENT `gmst(date)` so the ring forms a true closed
 * Keplerian orbit in space passing directly through the satellite's current position.
 */
export function computeInertialOrbitPoints(
  sat: ParsedSatellite,
  date: Date,
  segments = 160,
): Float32Array {
  const gmstNow = gstime(date);
  const periodMs = Math.min(sat.periodMin, 2880) * 60 * 1000;
  const startMs = date.getTime() - periodMs * 0.5;
  const positions = new Float32Array((segments + 1) * 3);
  const out = { x: 0, y: 0, z: 0 };

  let lastGoodX = 0;
  let lastGoodY = 0;
  let lastGoodZ = 0;

  for (let i = 0; i <= segments; i++) {
    const t = new Date(startMs + (i / segments) * periodMs);
    const pv = propagate(sat.satrec, t);
    if (pv && pv.position) {
      const ecf = eciToEcf(pv.position, gmstNow);
      ecfKmToScene(ecf, out);
      lastGoodX = out.x;
      lastGoodY = out.y;
      lastGoodZ = out.z;
    }
    positions[i * 3] = lastGoodX;
    positions[i * 3 + 1] = lastGoodY;
    positions[i * 3 + 2] = lastGoodZ;
  }

  return positions;
}

/**
 * Samples the surface ground track (past 0.5 orbit to future 0.75 orbit) using
 * each sample's own instantaneous GMST so Earth's rotation produces authentic
 * westward ground-track precession across continents.
 */
export function computeGroundTrackPoints(
  sat: ParsedSatellite,
  date: Date,
  segments = 180,
): Float32Array {
  const periodMs = Math.min(sat.periodMin, 1600) * 60 * 1000;
  const startMs = date.getTime() - periodMs * 0.35;
  const spanMs = periodMs * 1.1;
  const positions = new Float32Array((segments + 1) * 3);
  const out = { x: 0, y: 0, z: 0 };

  let lastX = 0;
  let lastY = 0;
  let lastZ = 0;

  for (let i = 0; i <= segments; i++) {
    const t = new Date(startMs + (i / segments) * spanMs);
    const pv = propagate(sat.satrec, t);
    if (pv && pv.position) {
      const gmst = gstime(t);
      const geo = eciToGeodetic(pv.position, gmst);
      // Slight elevation offset above Earth surface to prevent Z-fighting
      geodeticToScene(geo.latitude, geo.longitude, 52, out);
      lastX = out.x;
      lastY = out.y;
      lastZ = out.z;
    }
    positions[i * 3] = lastX;
    positions[i * 3 + 1] = lastY;
    positions[i * 3 + 2] = lastZ;
  }

  return positions;
}

/**
 * Parses raw 2-line or 3-line TLE text pasted by a user.
 */
export function parseCustomTleInput(rawText: string): {
  entry?: SatelliteCatalogEntry;
  parsed?: ParsedSatellite;
  error?: string;
} {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let name = 'CUSTOM SATELLITE';
  let line1 = '';
  let line2 = '';

  if (lines.length === 2) {
    line1 = lines[0];
    line2 = lines[1];
  } else if (lines.length >= 3) {
    name = lines[0].replace(/^0\s+/, '').slice(0, 32);
    line1 = lines[1];
    line2 = lines[2];
  } else {
    return { error: 'Provide either 2 TLE lines or 3 lines (Name + Line 1 + Line 2).' };
  }

  if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) {
    return { error: 'Line 1 must start with "1 " and Line 2 must start with "2 ".' };
  }

  const noradNum = Number.parseInt(line1.slice(2, 7).trim(), 10);
  const noradId = Number.isFinite(noradNum) ? noradNum : Math.floor(Math.random() * 90000 + 10000);

  const entry: SatelliteCatalogEntry = {
    id: `custom-${noradId}-${Date.now()}`,
    noradId,
    name: name || `SAT-${noradId}`,
    operator: 'Custom TLE Import',
    category: 'User Tracked Object',
    line1,
    line2,
    isCustom: true,
  };

  const parsed = parseSatelliteEntry(entry);
  if (!parsed) {
    return { error: 'Unable to initialize SGP4 ephemeris from the supplied TLE lines.' };
  }

  return { entry, parsed };
}
