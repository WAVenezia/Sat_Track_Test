import type { SatelliteCatalogEntry } from '../types/satellite';

/**
 * Computes standard NORAD TLE modulo-10 checksum for a 68-character line.
 * Digits add their face value; '-' adds 1; all other characters add 0.
 */
function withTleChecksum(line68: string): string {
  const padded = line68.padEnd(68, ' ').slice(0, 68);
  let sum = 0;
  for (let i = 0; i < 68; i++) {
    const ch = padded[i];
    if (ch >= '0' && ch <= '9') {
      sum += ch.charCodeAt(0) - 48;
    } else if (ch === '-') {
      sum += 1;
    }
  }
  return padded + String(sum % 10);
}

interface SeedOrbit {
  noradId: number;
  intlDesig: string;
  name: string;
  operator: string;
  category: string;
  inclinationDeg: number;
  raanDeg: number;
  eccentricity: number;
  argPerigeeDeg: number;
  meanAnomalyDeg: number;
  meanMotionRevDay: number;
  bstar?: string;
}

function buildTlePair(seed: SeedOrbit): { line1: string; line2: string } {
  const cat = String(seed.noradId).padStart(5, '0').slice(0, 5);
  const desig = seed.intlDesig.padEnd(8, ' ').slice(0, 8);
  // Epoch 2026 day 319.50000000 (Nov 15, 2026 12:00 UTC) so SGP4 stays crisp near current time
  const epoch = '26319.50000000';
  const bstar = (seed.bstar ?? ' 00000-0').padStart(8, ' ').slice(0, 8);
  const line1Body = `1 ${cat}U ${desig} ${epoch}  .00001250  00000-0 ${bstar} 0  999`;

  const inc = seed.inclinationDeg.toFixed(4).padStart(8, ' ');
  const raan = (((seed.raanDeg % 360) + 360) % 360).toFixed(4).padStart(8, ' ');
  const eccStr = Math.round(seed.eccentricity * 1e7)
    .toString()
    .padStart(7, '0')
    .slice(0, 7);
  const argp = (((seed.argPerigeeDeg % 360) + 360) % 360).toFixed(4).padStart(8, ' ');
  const ma = (((seed.meanAnomalyDeg % 360) + 360) % 360).toFixed(4).padStart(8, ' ');
  const mm = seed.meanMotionRevDay.toFixed(8).padStart(11, ' ');
  const rev = '10421';

  const line2Body = `2 ${cat} ${inc} ${raan} ${eccStr} ${argp} ${ma} ${mm}${rev}`;

  return {
    line1: withTleChecksum(line1Body),
    line2: withTleChecksum(line2Body),
  };
}

const SEED_ORBITS: SeedOrbit[] = [
  // --- Low Earth Orbit (LEO) ---
  {
    noradId: 25544,
    intlDesig: '98067A  ',
    name: 'ISS (ZARYA)',
    operator: 'NASA / Roscosmos / Partners',
    category: 'Space Station',
    inclinationDeg: 51.6416,
    raanDeg: 247.4627,
    eccentricity: 0.0006703,
    argPerigeeDeg: 130.536,
    meanAnomalyDeg: 325.0288,
    meanMotionRevDay: 15.498154,
    bstar: ' 12450-4',
  },
  {
    noradId: 48274,
    intlDesig: '21035A  ',
    name: 'CSS (TIANHE)',
    operator: 'CMSA',
    category: 'Space Station',
    inclinationDeg: 41.4742,
    raanDeg: 112.841,
    eccentricity: 0.000512,
    argPerigeeDeg: 215.42,
    meanAnomalyDeg: 48.21,
    meanMotionRevDay: 15.60542,
    bstar: ' 10200-4',
  },
  {
    noradId: 20580,
    intlDesig: '90037B  ',
    name: 'HST (HUBBLE)',
    operator: 'NASA / ESA',
    category: 'Space Telescope',
    inclinationDeg: 28.4698,
    raanDeg: 304.221,
    eccentricity: 0.000284,
    argPerigeeDeg: 78.15,
    meanAnomalyDeg: 192.34,
    meanMotionRevDay: 15.14625,
    bstar: ' 68400-5',
  },
  {
    noradId: 25994,
    intlDesig: '99068A  ',
    name: 'TERRA (EOS AM-1)',
    operator: 'NASA',
    category: 'Earth Observation',
    inclinationDeg: 98.2041,
    raanDeg: 42.18,
    eccentricity: 0.000142,
    argPerigeeDeg: 91.42,
    meanAnomalyDeg: 268.71,
    meanMotionRevDay: 14.5712,
  },
  {
    noradId: 27424,
    intlDesig: '02022A  ',
    name: 'AQUA (EOS PM-1)',
    operator: 'NASA',
    category: 'Earth Observation',
    inclinationDeg: 98.2145,
    raanDeg: 214.64,
    eccentricity: 0.000185,
    argPerigeeDeg: 85.12,
    meanAnomalyDeg: 142.33,
    meanMotionRevDay: 14.5711,
  },
  {
    noradId: 33591,
    intlDesig: '09005A  ',
    name: 'NOAA-19',
    operator: 'NOAA',
    category: 'Weather / Polar',
    inclinationDeg: 99.1422,
    raanDeg: 158.92,
    eccentricity: 0.00138,
    argPerigeeDeg: 118.4,
    meanAnomalyDeg: 241.6,
    meanMotionRevDay: 14.1246,
  },
  {
    noradId: 43013,
    intlDesig: '17073A  ',
    name: 'NOAA-20 (JPSS-1)',
    operator: 'NOAA / NASA',
    category: 'Weather / Polar',
    inclinationDeg: 98.742,
    raanDeg: 292.14,
    eccentricity: 0.000145,
    argPerigeeDeg: 92.8,
    meanAnomalyDeg: 64.15,
    meanMotionRevDay: 14.1965,
  },
  {
    noradId: 40697,
    intlDesig: '15028A  ',
    name: 'SENTINEL-2A',
    operator: 'ESA Copernicus',
    category: 'Earth Observation',
    inclinationDeg: 98.569,
    raanDeg: 61.35,
    eccentricity: 0.000128,
    argPerigeeDeg: 88.24,
    meanAnomalyDeg: 271.9,
    meanMotionRevDay: 14.3082,
  },
  {
    noradId: 49260,
    intlDesig: '21088A  ',
    name: 'LANDSAT-9',
    operator: 'USGS / NASA',
    category: 'Earth Observation',
    inclinationDeg: 98.218,
    raanDeg: 38.44,
    eccentricity: 0.000118,
    argPerigeeDeg: 94.12,
    meanAnomalyDeg: 18.45,
    meanMotionRevDay: 14.571,
  },
  {
    noradId: 36508,
    intlDesig: '10013A  ',
    name: 'CRYOSAT-2',
    operator: 'ESA',
    category: 'Cryosphere Altimetry',
    inclinationDeg: 92.028,
    raanDeg: 184.72,
    eccentricity: 0.00114,
    argPerigeeDeg: 89.5,
    meanAnomalyDeg: 109.2,
    meanMotionRevDay: 14.5218,
  },
  {
    noradId: 46984,
    intlDesig: '20086A  ',
    name: 'SENTINEL-6 MICHAEL FREILICH',
    operator: 'ESA / NASA / EUMETSAT',
    category: 'Ocean Altimetry',
    inclinationDeg: 66.048,
    raanDeg: 128.45,
    eccentricity: 0.00079,
    argPerigeeDeg: 270.12,
    meanAnomalyDeg: 89.4,
    meanMotionRevDay: 12.8093,
  },
  {
    noradId: 44713,
    intlDesig: '19074A  ',
    name: 'STARLINK-1007',
    operator: 'SpaceX',
    category: 'Communications LEO',
    inclinationDeg: 53.054,
    raanDeg: 16.4,
    eccentricity: 0.00014,
    argPerigeeDeg: 95.3,
    meanAnomalyDeg: 42.8,
    meanMotionRevDay: 15.064,
  },
  {
    noradId: 48091,
    intlDesig: '21027B  ',
    name: 'STARLINK-2314',
    operator: 'SpaceX',
    category: 'Communications LEO',
    inclinationDeg: 53.215,
    raanDeg: 148.9,
    eccentricity: 0.00016,
    argPerigeeDeg: 88.7,
    meanAnomalyDeg: 215.4,
    meanMotionRevDay: 15.0638,
  },
  {
    noradId: 44057,
    intlDesig: '19010A  ',
    name: 'ONEWEB-0012',
    operator: 'Eutelsat OneWeb',
    category: 'Communications LEO',
    inclinationDeg: 87.912,
    raanDeg: 74.2,
    eccentricity: 0.00021,
    argPerigeeDeg: 90.1,
    meanAnomalyDeg: 312.6,
    meanMotionRevDay: 13.1536,
  },
  {
    noradId: 41917,
    intlDesig: '17003A  ',
    name: 'IRIDIUM-106',
    operator: 'Iridium',
    category: 'Communications LEO',
    inclinationDeg: 86.395,
    raanDeg: 263.5,
    eccentricity: 0.00022,
    argPerigeeDeg: 91.8,
    meanAnomalyDeg: 128.4,
    meanMotionRevDay: 14.3422,
  },
  {
    noradId: 59598,
    intlDesig: '24075A  ',
    name: 'SWOT (SURFACE WATER)',
    operator: 'NASA / CNES',
    category: 'Hydrology Radar',
    inclinationDeg: 77.612,
    raanDeg: 325.1,
    eccentricity: 0.00028,
    argPerigeeDeg: 89.9,
    meanAnomalyDeg: 175.2,
    meanMotionRevDay: 13.9635,
  },

  // --- Medium Earth Orbit (MEO) ---
  {
    noradId: 40730,
    intlDesig: '15033A  ',
    name: 'GPS BIIF-10 (PRN 08)',
    operator: 'U.S. Space Force',
    category: 'GNSS Navigation',
    inclinationDeg: 55.142,
    raanDeg: 192.4,
    eccentricity: 0.0054,
    argPerigeeDeg: 45.2,
    meanAnomalyDeg: 112.8,
    meanMotionRevDay: 2.00564,
  },
  {
    noradId: 48859,
    intlDesig: '21054A  ',
    name: 'GPS III SV05 (NEIL ARMSTRONG)',
    operator: 'U.S. Space Force',
    category: 'GNSS Navigation',
    inclinationDeg: 55.028,
    raanDeg: 72.1,
    eccentricity: 0.0021,
    argPerigeeDeg: 162.4,
    meanAnomalyDeg: 248.6,
    meanMotionRevDay: 2.00562,
  },
  {
    noradId: 43566,
    intlDesig: '18060A  ',
    name: 'GALILEO-23 (FOC FM19)',
    operator: 'ESA / EUSPA',
    category: 'GNSS Navigation',
    inclinationDeg: 56.124,
    raanDeg: 128.6,
    eccentricity: 0.00038,
    argPerigeeDeg: 25.4,
    meanAnomalyDeg: 318.2,
    meanMotionRevDay: 1.70475,
  },
  {
    noradId: 43567,
    intlDesig: '18060B  ',
    name: 'GALILEO-24 (FOC FM20)',
    operator: 'ESA / EUSPA',
    category: 'GNSS Navigation',
    inclinationDeg: 56.118,
    raanDeg: 248.6,
    eccentricity: 0.00041,
    argPerigeeDeg: 214.8,
    meanAnomalyDeg: 95.4,
    meanMotionRevDay: 1.70474,
  },
  {
    noradId: 41554,
    intlDesig: '16032A  ',
    name: 'GLONASS-M 753',
    operator: 'Roscosmos',
    category: 'GNSS Navigation',
    inclinationDeg: 64.842,
    raanDeg: 314.2,
    eccentricity: 0.00145,
    argPerigeeDeg: 312.7,
    meanAnomalyDeg: 47.9,
    meanMotionRevDay: 2.13102,
  },
  {
    noradId: 43107,
    intlDesig: '18003A  ',
    name: 'BEIDOU-3 M3',
    operator: 'CNSA',
    category: 'GNSS Navigation',
    inclinationDeg: 55.084,
    raanDeg: 14.8,
    eccentricity: 0.0018,
    argPerigeeDeg: 148.2,
    meanAnomalyDeg: 186.5,
    meanMotionRevDay: 1.86231,
  },
  {
    noradId: 8820,
    intlDesig: '76039A  ',
    name: 'LAGEOS-1',
    operator: 'NASA',
    category: 'Geodetic Laser Target',
    inclinationDeg: 109.842,
    raanDeg: 89.4,
    eccentricity: 0.0044,
    argPerigeeDeg: 262.1,
    meanAnomalyDeg: 74.3,
    meanMotionRevDay: 6.38664,
  },

  // --- Geostationary / Geosynchronous (GEO) ---
  {
    noradId: 41866,
    intlDesig: '16071A  ',
    name: 'GOES-16 (GOES-EAST)',
    operator: 'NOAA / NASA',
    category: 'Weather GEO (75.2°W)',
    inclinationDeg: 0.042,
    raanDeg: 120.4,
    eccentricity: 0.00018,
    argPerigeeDeg: 140.2,
    meanAnomalyDeg: 22.8,
    meanMotionRevDay: 1.00271,
  },
  {
    noradId: 51850,
    intlDesig: '22021A  ',
    name: 'GOES-18 (GOES-WEST)',
    operator: 'NOAA / NASA',
    category: 'Weather GEO (137.0°W)',
    inclinationDeg: 0.035,
    raanDeg: 64.2,
    eccentricity: 0.00015,
    argPerigeeDeg: 185.4,
    meanAnomalyDeg: 332.1,
    meanMotionRevDay: 1.0027,
  },
  {
    noradId: 41836,
    intlDesig: '16064A  ',
    name: 'HIMAWARI-9',
    operator: 'JMA',
    category: 'Weather GEO (140.7°E)',
    inclinationDeg: 0.048,
    raanDeg: 265.1,
    eccentricity: 0.00022,
    argPerigeeDeg: 45.8,
    meanAnomalyDeg: 148.2,
    meanMotionRevDay: 1.00272,
  },
  {
    noradId: 40732,
    intlDesig: '15034A  ',
    name: 'METEOSAT-11 (MSG-4)',
    operator: 'EUMETSAT',
    category: 'Weather GEO (0.0°E)',
    inclinationDeg: 1.42,
    raanDeg: 82.6,
    eccentricity: 0.00024,
    argPerigeeDeg: 112.4,
    meanAnomalyDeg: 164.5,
    meanMotionRevDay: 1.00269,
  },
  {
    noradId: 42915,
    intlDesig: '17047A  ',
    name: 'TDRS-13 (TDRS-M)',
    operator: 'NASA',
    category: 'Tracking & Data Relay',
    inclinationDeg: 4.18,
    raanDeg: 302.4,
    eccentricity: 0.00048,
    argPerigeeDeg: 221.3,
    meanAnomalyDeg: 74.9,
    meanMotionRevDay: 1.00268,
  },

  // --- Highly Elliptical Orbit (HEO / Molniya / Tundra / Science) ---
  {
    noradId: 25485,
    intlDesig: '98054A  ',
    name: 'MOLNIYA 1-91',
    operator: 'Roscosmos',
    category: 'Molniya HEO Comms',
    inclinationDeg: 63.142,
    raanDeg: 175.4,
    eccentricity: 0.718,
    argPerigeeDeg: 270.4,
    meanAnomalyDeg: 35.8,
    meanMotionRevDay: 2.00642,
  },
  {
    noradId: 39215,
    intlDesig: '13038A  ',
    name: 'SIRIUS FM-6',
    operator: 'SiriusXM',
    category: 'Tundra Elliptical',
    inclinationDeg: 63.42,
    raanDeg: 218.7,
    eccentricity: 0.268,
    argPerigeeDeg: 270.0,
    meanAnomalyDeg: 145.6,
    meanMotionRevDay: 1.00265,
  },
  {
    noradId: 43226,
    intlDesig: '18022A  ',
    name: 'QZSS-4 (MICHIBIKI-4)',
    operator: 'JAXA / CAO',
    category: 'Quasi-Zenith Tundra',
    inclinationDeg: 40.82,
    raanDeg: 194.3,
    eccentricity: 0.0752,
    argPerigeeDeg: 270.1,
    meanAnomalyDeg: 210.4,
    meanMotionRevDay: 1.00271,
  },
  {
    noradId: 25867,
    intlDesig: '99040B  ',
    name: 'CHANDRA X-RAY (CXO)',
    operator: 'NASA / SAO',
    category: 'High-Altitude Observatory',
    inclinationDeg: 39.24,
    raanDeg: 58.9,
    eccentricity: 0.742,
    argPerigeeDeg: 145.2,
    meanAnomalyDeg: 112.4,
    meanMotionRevDay: 0.3782,
  },
];

export const DEFAULT_SATELLITE_CATALOG: SatelliteCatalogEntry[] = SEED_ORBITS.map(
  (seed) => {
    const { line1, line2 } = buildTlePair(seed);
    return {
      id: `norad-${seed.noradId}`,
      noradId: seed.noradId,
      name: seed.name,
      operator: seed.operator,
      category: seed.category,
      line1,
      line2,
    };
  },
);
