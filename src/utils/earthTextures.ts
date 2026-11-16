import * as THREE from 'three';
import { CITY_CLUSTERS, LAND_POLYGONS } from './earthData';

function seededRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function lonToX(lon: number, width: number): number {
  return ((lon + 180) / 360) * width;
}

function latToY(lat: number, height: number): number {
  return ((90 - lat) / 180) * height;
}

function drawLandPath(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  wrapOffset = 0,
): void {
  ctx.beginPath();
  for (const poly of LAND_POLYGONS) {
    if (poly.length < 3) continue;
    ctx.moveTo(lonToX(poly[0][0], width) + wrapOffset, latToY(poly[0][1], height));
    for (let i = 1; i < poly.length; i++) {
      ctx.lineTo(lonToX(poly[i][0], width) + wrapOffset, latToY(poly[i][1], height));
    }
    ctx.closePath();
  }
}

export interface EarthTextureBundle {
  dayMap: THREE.CanvasTexture;
  nightMap: THREE.CanvasTexture;
  specularMap: THREE.CanvasTexture;
  cloudMap: THREE.CanvasTexture;
  solarPanelMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createEarthTextures(maxAnisotropy: number): EarthTextureBundle {
  const width = 2048;
  const height = 1024;

  // 1. DAY ALBEDO TEXTURE
  const dayCanvas = document.createElement('canvas');
  dayCanvas.width = width;
  dayCanvas.height = height;
  const dCtx = dayCanvas.getContext('2d')!;

  // Deep ocean bathymetric gradient
  const oceanGrad = dCtx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0.0, '#10243d');
  oceanGrad.addColorStop(0.18, '#0c2340');
  oceanGrad.addColorStop(0.5, '#092a4c');
  oceanGrad.addColorStop(0.82, '#0c2340');
  oceanGrad.addColorStop(1.0, '#142b47');
  dCtx.fillStyle = oceanGrad;
  dCtx.fillRect(0, 0, width, height);

  // Subtle oceanic ridge / bathymetry mottling
  for (let i = 0; i < 420; i++) {
    const rx = seededRand(i * 3.1) * width;
    const ry = seededRand(i * 7.7) * height;
    const rad = 24 + seededRand(i * 11.3) * 90;
    const g = dCtx.createRadialGradient(rx, ry, 0, rx, ry, rad);
    g.addColorStop(0, 'rgba(18, 64, 108, 0.14)');
    g.addColorStop(1, 'rgba(9, 42, 76, 0)');
    dCtx.fillStyle = g;
    dCtx.beginPath();
    dCtx.arc(rx, ry, rad, 0, Math.PI * 2);
    dCtx.fill();
  }

  // Continental shelf cyan-blue coastal glow
  dCtx.save();
  dCtx.lineJoin = 'round';
  dCtx.lineWidth = 14;
  dCtx.strokeStyle = 'rgba(28, 106, 152, 0.35)';
  drawLandPath(dCtx, width, height);
  dCtx.stroke();
  dCtx.lineWidth = 6;
  dCtx.strokeStyle = 'rgba(45, 140, 180, 0.35)';
  dCtx.stroke();
  dCtx.restore();

  // Landmasses clipped with latitude biome palette (polar ice, boreal, temperate, arid belt)
  dCtx.save();
  drawLandPath(dCtx, width, height);
  dCtx.clip();

  const biomeGrad = dCtx.createLinearGradient(0, 0, 0, height);
  biomeGrad.addColorStop(0.0, '#d8e3ed'); // High Arctic ice
  biomeGrad.addColorStop(0.12, '#6c7c74'); // Tundra
  biomeGrad.addColorStop(0.24, '#2d4b3e'); // Boreal forest
  biomeGrad.addColorStop(0.36, '#485d46'); // Temperate
  biomeGrad.addColorStop(0.43, '#7b6d52'); // Subtropical / arid belt
  biomeGrad.addColorStop(0.5, '#2b4c39'); // Equatorial rainforest
  biomeGrad.addColorStop(0.58, '#6e654d'); // Southern arid
  biomeGrad.addColorStop(0.68, '#3c5342'); // Southern temperate
  biomeGrad.addColorStop(0.84, '#c8d6e2'); // Antarctic margin
  biomeGrad.addColorStop(1.0, '#e5edf4'); // Polar ice cap
  dCtx.fillStyle = biomeGrad;
  dCtx.fillRect(0, 0, width, height);

  // Subtle topographic relief patches inside continents
  for (let i = 0; i < 650; i++) {
    const px = seededRand(i * 19.3 + 5) * width;
    const py = seededRand(i * 23.7 + 11) * height;
    const pr = 8 + seededRand(i * 5.9) * 34;
    const isLight = seededRand(i * 13.1) > 0.45;
    const g = dCtx.createRadialGradient(px, py, 0, px, py, pr);
    g.addColorStop(0, isLight ? 'rgba(180, 172, 145, 0.14)' : 'rgba(20, 38, 30, 0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    dCtx.fillStyle = g;
    dCtx.beginPath();
    dCtx.arc(px, py, pr, 0, Math.PI * 2);
    dCtx.fill();
  }
  dCtx.restore();

  // Crisp continental coastlines
  dCtx.save();
  dCtx.lineJoin = 'round';
  dCtx.lineWidth = 1.6;
  dCtx.strokeStyle = 'rgba(130, 175, 195, 0.48)';
  drawLandPath(dCtx, width, height);
  dCtx.stroke();
  dCtx.restore();

  // 2. NIGHT CITY LIGHTS TEXTURE
  const nightCanvas = document.createElement('canvas');
  nightCanvas.width = width;
  nightCanvas.height = height;
  const nCtx = nightCanvas.getContext('2d')!;

  nCtx.fillStyle = '#03060c';
  nCtx.fillRect(0, 0, width, height);

  // Very subtle night-side land tint so continents remain softly legible in eclipse
  nCtx.save();
  drawLandPath(nCtx, width, height);
  nCtx.fillStyle = '#0a1220';
  nCtx.fill();
  nCtx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
  nCtx.lineWidth = 1.2;
  nCtx.stroke();
  nCtx.restore();

  // Draw glowing urban clusters + satellite micro-sparks
  for (let idx = 0; idx < CITY_CLUSTERS.length; idx++) {
    const [lon, lat, intensity, radiusScale] = CITY_CLUSTERS[idx];
    const cx = lonToX(lon, width);
    const cy = latToY(lat, height);
    const baseR = 9 * radiusScale;

    const halo = nCtx.createRadialGradient(cx, cy, 0, cx, cy, baseR);
    halo.addColorStop(0, `rgba(255, 224, 148, ${0.9 * intensity})`);
    halo.addColorStop(0.35, `rgba(245, 166, 35, ${0.5 * intensity})`);
    halo.addColorStop(1, 'rgba(245, 158, 11, 0)');
    nCtx.fillStyle = halo;
    nCtx.beginPath();
    nCtx.arc(cx, cy, baseR, 0, Math.PI * 2);
    nCtx.fill();

    // Suburban scatter points
    const subCount = Math.round(8 * radiusScale);
    for (let s = 0; s < subCount; s++) {
      const ang = seededRand(idx * 31 + s * 7.3) * Math.PI * 2;
      const dist = seededRand(idx * 17 + s * 3.9) * baseR * 1.4;
      const sx = cx + Math.cos(ang) * dist;
      const sy = cy + Math.sin(ang) * dist * 0.75;
      const sr = 0.8 + seededRand(idx * 9 + s) * 1.6;
      nCtx.fillStyle = `rgba(253, 210, 120, ${0.65 * intensity})`;
      nCtx.beginPath();
      nCtx.arc(sx, sy, sr, 0, Math.PI * 2);
      nCtx.fill();
    }
  }

  // 3. SPECULAR MASK TEXTURE (Ocean shiny, land matte)
  const specWidth = 1024;
  const specHeight = 512;
  const specCanvas = document.createElement('canvas');
  specCanvas.width = specWidth;
  specCanvas.height = specHeight;
  const sCtx = specCanvas.getContext('2d')!;
  sCtx.fillStyle = '#c8c8c8'; // Ocean specular strength
  sCtx.fillRect(0, 0, specWidth, specHeight);
  drawLandPath(sCtx, specWidth, specHeight);
  sCtx.fillStyle = '#181818'; // Land matte
  sCtx.fill();

  // 4. PROCEDURAL CLOUD LAYER
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = 1024;
  cloudCanvas.height = 512;
  const cCtx = cloudCanvas.getContext('2d')!;
  cCtx.clearRect(0, 0, 1024, 512);

  for (let i = 0; i < 320; i++) {
    const cx = seededRand(i * 41.3) * 1024;
    // Favor mid-latitude storm tracks & ITCZ equatorial band
    const bandChoice = seededRand(i * 11.7);
    const latNorm =
      bandChoice < 0.35
        ? 0.5 + (seededRand(i * 5.3) - 0.5) * 0.14
        : bandChoice < 0.68
          ? 0.28 + (seededRand(i * 8.1) - 0.5) * 0.16
          : 0.72 + (seededRand(i * 9.7) - 0.5) * 0.16;
    const cy = latNorm * 512;
    const rx = 22 + seededRand(i * 13.7) * 68;
    const ry = 5 + seededRand(i * 17.1) * 14;
    const alpha = 0.05 + seededRand(i * 29.3) * 0.11;

    for (const offset of [-1024, 0, 1024]) {
      cCtx.save();
      cCtx.translate(cx + offset, cy);
      cCtx.rotate((seededRand(i * 3.7) - 0.5) * 0.45);
      const grad = cCtx.createRadialGradient(0, 0, 0, 0, 0, rx);
      grad.addColorStop(0, `rgba(235, 244, 255, ${alpha})`);
      grad.addColorStop(0.55, `rgba(220, 234, 248, ${alpha * 0.55})`);
      grad.addColorStop(1, 'rgba(220, 234, 248, 0)');
      cCtx.scale(1, ry / rx);
      cCtx.fillStyle = grad;
      cCtx.beginPath();
      cCtx.arc(0, 0, rx, 0, Math.PI * 2);
      cCtx.fill();
      cCtx.restore();
    }
  }

  // 5. SPACECRAFT SOLAR PANEL TEXTURE
  const solarCanvas = document.createElement('canvas');
  solarCanvas.width = 256;
  solarCanvas.height = 256;
  const pCtx = solarCanvas.getContext('2d')!;
  pCtx.fillStyle = '#0c1c3a';
  pCtx.fillRect(0, 0, 256, 256);
  // Solar cell grid lines
  pCtx.strokeStyle = '#3b6ea5';
  pCtx.lineWidth = 2;
  for (let x = 0; x <= 256; x += 32) {
    pCtx.beginPath();
    pCtx.moveTo(x, 0);
    pCtx.lineTo(x, 256);
    pCtx.stroke();
  }
  for (let y = 0; y <= 256; y += 16) {
    pCtx.beginPath();
    pCtx.moveTo(0, y);
    pCtx.lineTo(256, y);
    pCtx.stroke();
  }
  pCtx.strokeStyle = '#93c5fd';
  pCtx.lineWidth = 1;
  for (let x = 16; x < 256; x += 32) {
    pCtx.beginPath();
    pCtx.moveTo(x, 0);
    pCtx.lineTo(x, 256);
    pCtx.stroke();
  }

  const dayMap = new THREE.CanvasTexture(dayCanvas);
  dayMap.colorSpace = THREE.SRGBColorSpace;
  dayMap.anisotropy = maxAnisotropy;
  dayMap.wrapS = THREE.RepeatWrapping;

  const nightMap = new THREE.CanvasTexture(nightCanvas);
  nightMap.colorSpace = THREE.SRGBColorSpace;
  nightMap.anisotropy = maxAnisotropy;
  nightMap.wrapS = THREE.RepeatWrapping;

  const specularMap = new THREE.CanvasTexture(specCanvas);
  specularMap.wrapS = THREE.RepeatWrapping;

  const cloudMap = new THREE.CanvasTexture(cloudCanvas);
  cloudMap.colorSpace = THREE.SRGBColorSpace;
  cloudMap.anisotropy = maxAnisotropy;
  cloudMap.wrapS = THREE.RepeatWrapping;

  const solarPanelMap = new THREE.CanvasTexture(solarCanvas);
  solarPanelMap.colorSpace = THREE.SRGBColorSpace;
  solarPanelMap.anisotropy = maxAnisotropy;

  return {
    dayMap,
    nightMap,
    specularMap,
    cloudMap,
    solarPanelMap,
    dispose: () => {
      dayMap.dispose();
      nightMap.dispose();
      specularMap.dispose();
      cloudMap.dispose();
      solarPanelMap.dispose();
    },
  };
}
