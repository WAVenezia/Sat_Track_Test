import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { gstime, jday, sunPos } from 'satellite.js';
import type {
  CameraPreset,
  LayerSettings,
  OrbitRegime,
  ParsedSatellite,
  SatelliteTelemetry,
} from '../types/satellite';
import { createEarthTextures, type EarthTextureBundle } from '../utils/earthTextures';
import {
  computeGroundTrackPoints,
  computeInertialOrbitPoints,
  EARTH_RADIUS_KM,
  getSunDirectionScene,
  GLOBE_RADIUS,
  propagateSatelliteTelemetry,
} from '../utils/orbitalMath';
import { createSpacecraftModel, type SpacecraftModelHandle } from './createSpacecraftModel';

const REGIME_COLORS: Record<OrbitRegime, THREE.Color> = {
  LEO: new THREE.Color('#06b6d4'), // Laser Cyan
  MEO: new THREE.Color('#f59e0b'), // Telemetry Amber
  GEO: new THREE.Color('#60a5fa'), // Cobalt Blue
  HEO: new THREE.Color('#10b981'), // Emerald
};
const SELECTED_COLOR = new THREE.Color('#fef08a');

// Pre-allocated math scratch objects for zero-GC render loop
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3C = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _rotMat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scaleVec = new THREE.Vector3();
const _mouse = new THREE.Vector2();
const _sunDirScene = { x: 1, y: 0.2, z: 0.4 };
const _sunUnitEci = { x: 1, y: 0, z: 0 };

export interface EarthSceneCallbacks {
  onSelectSatellite: (satId: string) => void;
  onTelemetryUpdate: (telemetry: SatelliteTelemetry | null) => void;
  onClockTick: (simDate: Date) => void;
  onHoverSatellite: (info: { name: string; x: number; y: number } | null) => void;
  onWebglError?: (msg: string) => void;
}

export class EarthScene {
  private container: HTMLElement;
  private callbacks: EarthSceneCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();

  private textures: EarthTextureBundle;
  private earthMaterial: THREE.ShaderMaterial;
  private cloudMesh: THREE.Mesh;
  private cloudMaterial: THREE.ShaderMaterial;
  private graticuleGroup: THREE.LineSegments;
  private starField: THREE.Points;
  private sunLight: THREE.DirectionalLight;

  private satInstancedMesh: THREE.InstancedMesh;
  private satHitMesh: THREE.InstancedMesh;
  private spacecraftHandle: SpacecraftModelHandle;

  // Dynamic orbit / track / footprint visuals for selected satellite
  private selectedOrbitLine: THREE.Line;
  private groundTrackLine: THREE.Line;
  private nadirLine: THREE.Line;
  private footprintRing: THREE.LineLoop;
  private allOrbitsGroup: THREE.Group;
  private allOrbitLines: THREE.Line[] = [];

  private satellites: ParsedSatellite[] = [];
  private selectedSatId: string | null = null;
  private hoveredSatId: string | null = null;

  private layers: LayerSettings = {
    showOrbits: true,
    showAllOrbits: false,
    showGroundTrack: true,
    showDayNight: true,
    showGrid: true,
    showFootprint: true,
    showClouds: true,
  };

  // Simulation time state
  private simTimeMs: number = Date.now();
  private speedMultiplier = 1;
  private isPaused = false;
  private lastPerfTime = performance.now();
  private lastUiSyncTime = 0;
  private lastOrbitRefreshSimMs = 0;
  private lastSelectedIdForOrbit: string | null = null;

  // Camera transition & follow state
  private cameraAnimating = false;
  private targetCameraPos = new THREE.Vector3(0, 1.45, 3.35);
  private targetControlsTarget = new THREE.Vector3(0, 0, 0);
  private followMode = false;
  private followOffset = new THREE.Vector3();

  private frameId = 0;
  private disposed = false;
  private lastRaycastMs = 0;
  private pointerDownPos = { x: 0, y: 0 };
  private disposedObjects: Array<{ dispose: () => void }> = [];

  constructor(container: HTMLElement, callbacks: EarthSceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.setSize(width, height);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#05080f');
    this.scene.fog = new THREE.FogExp2('#05080f', 0.012);

    // Mandatory studio environment reflection for PBR spacecraft metals
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    this.scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();
    this.disposedObjects.push(envTarget);

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 200);
    this.camera.position.copy(this.targetCameraPos);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.18;
    this.controls.maxDistance = 24;
    this.controls.rotateSpeed = 0.65;
    this.controls.zoomSpeed = 0.85;

    // Cancel scripted camera presets if user drags/zooms manually
    this.controls.addEventListener('start', () => {
      this.cameraAnimating = false;
    });

    // Lighting rig: Warm solar key + cool space fill
    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 2.4);
    this.sunLight.position.set(10, 3, 6);
    this.scene.add(this.sunLight);

    const hemi = new THREE.HemisphereLight(0x5b8def, 0x090d16, 0.55);
    this.scene.add(hemi);

    // Procedural Textures
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createEarthTextures(maxAniso);

    // 1. Starfield (Inertial celestial backdrop)
    this.starField = this.buildStarfield();
    this.scene.add(this.starField);

    // 2. Earth Globe with Day/Night Solar Terminator + Ocean Specular Shader
    const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 72, 48);
    this.disposedObjects.push(earthGeo);

    this.earthMaterial = new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: this.textures.dayMap },
        nightMap: { value: this.textures.nightMap },
        specularMap: { value: this.textures.specularMap },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        showDayNight: { value: 1.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform sampler2D dayMap;
        uniform sampler2D nightMap;
        uniform sampler2D specularMap;
        uniform vec3 sunDir;
        uniform float showDayNight;

        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;

        void main() {
          vec3 N = normalize(vWorldNormal);
          vec3 L = normalize(sunDir);
          vec3 V = normalize(cameraPosition - vWorldPos);

          vec3 dayCol = texture2D(dayMap, vUv).rgb;
          vec3 nightCol = texture2D(nightMap, vUv).rgb;
          float specMask = texture2D(specularMap, vUv).r;

          float ndl = dot(N, L);
          // Smooth atmospheric twilight band across terminator
          float dayFactor = smoothstep(-0.14, 0.18, ndl);
          float effectiveDay = mix(1.0, dayFactor, showDayNight);

          // Diffuse daylight with subtle ambient floor
          float lambert = max(ndl, 0.0);
          vec3 litDay = dayCol * (0.24 + 0.92 * lambert);

          // Ocean sun-glint specular
          vec3 H = normalize(L + V);
          float spec = pow(max(dot(N, H), 0.0), 42.0) * specMask * smoothstep(0.0, 0.2, ndl);
          litDay += vec3(0.65, 0.82, 0.98) * spec * 0.42 * showDayNight;

          // Warm twilight scatter right along the solar terminator
          float twilight = exp(-pow(ndl * 6.5, 2.0)) * showDayNight;
          litDay += vec3(0.55, 0.24, 0.09) * twilight * 0.24;

          // Blend day hemisphere with amber city lights on night hemisphere
          vec3 color = mix(nightCol * 1.18, litDay, effectiveDay);

          // Subtle atmospheric Fresnel limb scattering
          float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.4);
          vec3 atmoTint = mix(vec3(0.08, 0.24, 0.46), vec3(0.24, 0.62, 0.96), max(effectiveDay, 0.25));
          color += atmoTint * fresnel * 0.46;

          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.disposedObjects.push(this.earthMaterial);

    const earthMesh = new THREE.Mesh(earthGeo, this.earthMaterial);
    this.scene.add(earthMesh);

    // 3. Drifting Cloud Layer
    const cloudGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.007, 64, 40);
    this.disposedObjects.push(cloudGeo);
    this.cloudMaterial = new THREE.ShaderMaterial({
      uniforms: {
        cloudMap: { value: this.textures.cloudMap },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        showDayNight: { value: 1.0 },
      },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        void main() {
          vUv = uv;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D cloudMap;
        uniform vec3 sunDir;
        uniform float showDayNight;
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        void main() {
          vec4 c = texture2D(cloudMap, vUv);
          float ndl = dot(normalize(vWorldNormal), normalize(sunDir));
          float light = mix(1.0, smoothstep(-0.2, 0.25, ndl) * 0.85 + 0.15, showDayNight);
          gl_FragColor = vec4(c.rgb * light, c.a * 0.55);
        }
      `,
    });
    this.disposedObjects.push(this.cloudMaterial);
    this.cloudMesh = new THREE.Mesh(cloudGeo, this.cloudMaterial);
    this.scene.add(this.cloudMesh);

    // 4. Outer Atmospheric Rayleigh Rim Halo
    const haloGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.045, 64, 40);
    this.disposedObjects.push(haloGeo);
    const haloMat = new THREE.ShaderMaterial({
      uniforms: {
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
      },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 sunDir;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vec3 V = normalize(cameraPosition - vWorldPos);
          float intensity = pow(0.62 - dot(vNormal, -V), 4.2);
          float sunSide = smoothstep(-0.4, 0.6, dot(vNormal, normalize(sunDir))) * 0.65 + 0.35;
          gl_FragColor = vec4(0.18, 0.56, 0.96, 1.0) * clamp(intensity, 0.0, 1.0) * sunSide * 0.52;
        }
      `,
    });
    this.disposedObjects.push(haloMat);
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    this.scene.add(haloMesh);

    // 5. Lat/Lon Geographic Graticule Grid
    this.graticuleGroup = this.buildGraticule();
    this.scene.add(this.graticuleGroup);

    // 6. Instanced Satellite Constellation Markers + Invisible Hit Spheres for Easy Picking
    const maxInstances = 256;
    const satMarkerGeo = new THREE.OctahedronGeometry(0.014, 0);
    this.disposedObjects.push(satMarkerGeo);
    const satMarkerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.5,
      emissive: 0x334155,
      emissiveIntensity: 0.6,
    });
    this.disposedObjects.push(satMarkerMat);

    this.satInstancedMesh = new THREE.InstancedMesh(satMarkerGeo, satMarkerMat, maxInstances);
    this.satInstancedMesh.count = 0;
    this.satInstancedMesh.frustumCulled = false;
    this.scene.add(this.satInstancedMesh);

    const hitGeo = new THREE.SphereGeometry(0.042, 8, 8);
    this.disposedObjects.push(hitGeo);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.disposedObjects.push(hitMat);
    this.satHitMesh = new THREE.InstancedMesh(hitGeo, hitMat, maxInstances);
    this.satHitMesh.count = 0;
    this.satHitMesh.frustumCulled = false;
    this.satHitMesh.layers.set(1);
    this.scene.add(this.satHitMesh);
    this.raycaster.layers.set(1);

    // 7. 7-Part Composite Procedural Spacecraft Model for Selected Satellite
    this.spacecraftHandle = createSpacecraftModel(
      this.textures.solarPanelMap,
      this.isSoftwareGl,
    );
    this.spacecraftHandle.group.visible = false;
    this.scene.add(this.spacecraftHandle.group);

    // 8. Selected Satellite Inertial Orbit Line (vertex-colored ahead/behind gradient)
    const orbitGeo = new THREE.BufferGeometry();
    const orbitMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
    });
    this.disposedObjects.push(orbitGeo, orbitMat);
    this.selectedOrbitLine = new THREE.Line(orbitGeo, orbitMat);
    this.selectedOrbitLine.frustumCulled = false;
    this.scene.add(this.selectedOrbitLine);

    // 9. Surface Ground Track Line
    const trackGeo = new THREE.BufferGeometry();
    const trackMat = new THREE.LineBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.78,
    });
    this.disposedObjects.push(trackGeo, trackMat);
    this.groundTrackLine = new THREE.Line(trackGeo, trackMat);
    this.groundTrackLine.frustumCulled = false;
    this.scene.add(this.groundTrackLine);

    // 10. Nadir Drop Beam + Surface Horizon Footprint Ring
    const nadirGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const nadirMat = new THREE.LineBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.55,
    });
    this.disposedObjects.push(nadirGeo, nadirMat);
    this.nadirLine = new THREE.Line(nadirGeo, nadirMat);
    this.nadirLine.frustumCulled = false;
    this.scene.add(this.nadirLine);

    const fpGeo = new THREE.BufferGeometry();
    const fpMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65,
    });
    this.disposedObjects.push(fpGeo, fpMat);
    this.footprintRing = new THREE.LineLoop(fpGeo, fpMat);
    this.footprintRing.frustumCulled = false;
    this.scene.add(this.footprintRing);

    // 11. All-Orbits Group
    this.allOrbitsGroup = new THREE.Group();
    this.scene.add(this.allOrbitsGroup);

    // Pre-compile shaders on hardware GPU
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.tick();
  }

  private buildStarfield(): THREE.Points {
    const count = 1800;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const tmpColor = new THREE.Color();

    for (let i = 0; i < count; i++) {
      // Uniform spherical shell at r = 45..75
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = 45 + Math.random() * 30;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      // Realistic stellar color temperatures (blue-white, white, warm amber)
      const temp = Math.random();
      if (temp < 0.25) tmpColor.setRGB(0.72, 0.85, 1.0);
      else if (temp < 0.75) tmpColor.setRGB(0.95, 0.96, 1.0);
      else tmpColor.setRGB(1.0, 0.88, 0.72);
      const brightness = 0.45 + Math.random() * 0.55;
      colors[i * 3] = tmpColor.r * brightness;
      colors[i * 3 + 1] = tmpColor.g * brightness;
      colors[i * 3 + 2] = tmpColor.b * brightness;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.disposedObjects.push(geo);

    const mat = new THREE.PointsMaterial({
      size: 0.12,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      fog: false,
    });
    this.disposedObjects.push(mat);

    return new THREE.Points(geo, mat);
  }

  private buildGraticule(): THREE.LineSegments {
    const points: number[] = [];
    const r = GLOBE_RADIUS * 1.0025;

    // Parallels every 30 deg
    for (let lat = -60; lat <= 60; lat += 30) {
      const latRad = THREE.MathUtils.degToRad(lat);
      const y = r * Math.sin(latRad);
      const ringR = r * Math.cos(latRad);
      const segs = 96;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        points.push(
          ringR * Math.cos(a0), y, -ringR * Math.sin(a0),
          ringR * Math.cos(a1), y, -ringR * Math.sin(a1),
        );
      }
    }

    // Meridians every 30 deg
    for (let lon = 0; lon < 360; lon += 30) {
      const lonRad = THREE.MathUtils.degToRad(lon);
      const segs = 72;
      for (let i = 0; i < segs; i++) {
        const lat0 = -Math.PI / 2 + (i / segs) * Math.PI;
        const lat1 = -Math.PI / 2 + ((i + 1) / segs) * Math.PI;
        points.push(
          r * Math.cos(lat0) * Math.cos(lonRad),
          r * Math.sin(lat0),
          -r * Math.cos(lat0) * Math.sin(lonRad),
          r * Math.cos(lat1) * Math.cos(lonRad),
          r * Math.sin(lat1),
          -r * Math.cos(lat1) * Math.sin(lonRad),
        );
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.14,
    });
    this.disposedObjects.push(geo, mat);
    return new THREE.LineSegments(geo, mat);
  }

  private bindEvents(): void {
    const dom = this.renderer.domElement;

    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('webglcontextlost', this.onContextLost);
    dom.addEventListener('webglcontextrestored', this.onContextRestored);
    window.addEventListener('resize', this.onResize);
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.callbacks.onWebglError?.('WebGL context lost. Waiting for GPU recovery.');
  };

  private onContextRestored = (): void => {
    this.callbacks.onWebglError?.('');
    this.tick();
  };

  private onResize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.pointerDownPos.x = e.clientX;
    this.pointerDownPos.y = e.clientY;
  };

  private onPointerUp = (e: PointerEvent): void => {
    const dist = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y,
    );
    // Distinguish genuine click from camera orbit drag
    if (dist > 6) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(_mouse, this.camera);
    const hits = this.raycaster.intersectObject(this.satHitMesh, false);
    if (hits.length > 0 && hits[0].instanceId !== undefined) {
      const sat = this.satellites[hits[0].instanceId];
      if (sat) {
        this.callbacks.onSelectSatellite(sat.id);
      }
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const now = performance.now();
    if (now - this.lastRaycastMs < 50) return;
    this.lastRaycastMs = now;

    const rect = this.renderer.domElement.getBoundingClientRect();
    _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(_mouse, this.camera);
    const hits = this.raycaster.intersectObject(this.satHitMesh, false);
    if (hits.length > 0 && hits[0].instanceId !== undefined) {
      const sat = this.satellites[hits[0].instanceId];
      if (sat) {
        this.hoveredSatId = sat.id;
        this.renderer.domElement.style.cursor = 'pointer';
        this.callbacks.onHoverSatellite({
          name: sat.name,
          x: e.clientX,
          y: e.clientY,
        });
        return;
      }
    }

    if (this.hoveredSatId !== null) {
      this.hoveredSatId = null;
      this.renderer.domElement.style.cursor = 'grab';
      this.callbacks.onHoverSatellite(null);
    }
  };

  // --- Public Control API ---

  public setSatellites(list: ParsedSatellite[]): void {
    this.satellites = list;
    const count = Math.min(list.length, 256);
    this.satInstancedMesh.count = count;
    this.satHitMesh.count = count;
    this.rebuildAllOrbitLines();
  }

  public setSelectedSatellite(satId: string | null): void {
    this.selectedSatId = satId;
    this.lastSelectedIdForOrbit = null; // Force immediate orbit curve recompute
    if (!satId) {
      this.followMode = false;
      this.spacecraftHandle.group.visible = false;
      this.selectedOrbitLine.visible = false;
      this.groundTrackLine.visible = false;
      this.nadirLine.visible = false;
      this.footprintRing.visible = false;
      this.callbacks.onTelemetryUpdate(null);
    }
  }

  public setLayers(next: LayerSettings): void {
    this.layers = next;
    this.graticuleGroup.visible = next.showGrid;
    this.cloudMesh.visible = next.showClouds;
    this.earthMaterial.uniforms.showDayNight.value = next.showDayNight ? 1.0 : 0.0;
    this.cloudMaterial.uniforms.showDayNight.value = next.showDayNight ? 1.0 : 0.0;
    this.allOrbitsGroup.visible = next.showOrbits && next.showAllOrbits;
  }

  public setSimulationSpeed(multiplier: number, paused: boolean): void {
    this.speedMultiplier = multiplier;
    this.isPaused = paused;
  }

  public syncToRealTime(): void {
    this.simTimeMs = Date.now();
    this.lastOrbitRefreshSimMs = 0;
  }

  public setCameraPreset(preset: CameraPreset): void {
    this.followMode = false;

    if (preset === 'global') {
      this.targetControlsTarget.set(0, 0, 0);
      this.targetCameraPos.set(0, 1.45, 3.35);
      this.cameraAnimating = true;
      return;
    }

    if (preset === 'north') {
      this.targetControlsTarget.set(0, 0, 0);
      this.targetCameraPos.set(0, 3.5, 0.28);
      this.cameraAnimating = true;
      return;
    }

    if (preset === 'equatorial') {
      this.targetControlsTarget.set(0, 0, 0);
      this.targetCameraPos.set(3.6, 0.12, 0.4);
      this.cameraAnimating = true;
      return;
    }

    if (preset === 'follow') {
      const sat = this.satellites.find((s) => s.id === this.selectedSatId);
      if (!sat) return;
      const tel = propagateSatelliteTelemetry(sat, new Date(this.simTimeMs));
      if (!tel) return;

      _vec3A.set(tel.sceneX, tel.sceneY, tel.sceneZ);
      const radialLen = _vec3A.length();
      // Place camera slightly above and behind satellite looking across Earth limb
      _vec3B.copy(_vec3A).normalize();
      const standOff = sat.regime === 'LEO' ? 0.55 : sat.regime === 'MEO' ? 1.4 : 2.2;
      this.targetControlsTarget.set(0, 0, 0);
      this.targetCameraPos
        .copy(_vec3B)
        .multiplyScalar(radialLen + standOff)
        .add(new THREE.Vector3(0.18, 0.16, 0.18));
      this.followMode = true;
      this.followOffset.copy(this.targetCameraPos).sub(_vec3A);
      this.cameraAnimating = true;
    }
  }

  public focusOnSelected(): void {
    this.setCameraPreset('follow');
  }

  private rebuildAllOrbitLines(): void {
    for (const line of this.allOrbitLines) {
      this.allOrbitsGroup.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.allOrbitLines = [];

    const simDate = new Date(this.simTimeMs);
    for (const sat of this.satellites) {
      const pts = computeInertialOrbitPoints(sat, simDate, 96);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const color = REGIME_COLORS[sat.regime];
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.18,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      this.allOrbitsGroup.add(line);
      this.allOrbitLines.push(line);
    }
  }

  private updateSelectedVisuals(
    sat: ParsedSatellite,
    tel: SatelliteTelemetry,
    simDate: Date,
  ): void {
    // Orient 7-part spacecraft along velocity vector (+Z) and nadir toward Earth center (-Y)
    const sc = this.spacecraftHandle.group;
    sc.visible = true;
    sc.position.set(tel.sceneX, tel.sceneY, tel.sceneZ);

    const camDist = this.camera.position.distanceTo(sc.position);
    const dynamicScale = THREE.MathUtils.clamp(camDist * 0.015, 0.008, 0.095);
    sc.scale.setScalar(dynamicScale);

    // Local basis: +Z = velocity direction, +Y = zenith (away from Earth center), +X = cross(Y, Z)
    _vec3A.set(tel.sceneX, tel.sceneY, tel.sceneZ).normalize(); // Zenith (+Y)
    _vec3B.set(tel.velX, tel.velY, tel.velZ).normalize(); // Velocity (+Z)
    _vec3C.crossVectors(_vec3A, _vec3B).normalize(); // Starboard (+X)
    _vec3B.crossVectors(_vec3C, _vec3A).normalize(); // Orthonormalized +Z
    _rotMat4.makeBasis(_vec3C, _vec3A, _vec3B);
    sc.quaternion.setFromRotationMatrix(_rotMat4);

    // Nadir beam from spacecraft to sub-satellite surface point
    const nadirVisible = this.layers.showFootprint;
    this.nadirLine.visible = nadirVisible;
    if (nadirVisible) {
      const nadirAttr = this.nadirLine.geometry.attributes
        .position as THREE.BufferAttribute;
      _vec3A.set(tel.sceneX, tel.sceneY, tel.sceneZ).normalize().multiplyScalar(GLOBE_RADIUS * 1.003);
      nadirAttr.setXYZ(0, tel.sceneX, tel.sceneY, tel.sceneZ);
      nadirAttr.setXYZ(1, _vec3A.x, _vec3A.y, _vec3A.z);
      nadirAttr.needsUpdate = true;
    }

    // Horizon visibility footprint circle on Earth's surface
    this.footprintRing.visible = nadirVisible;
    if (nadirVisible) {
      const centralAngle = Math.acos(
        Math.min(1, EARTH_RADIUS_KM / (EARTH_RADIUS_KM + tel.altKm)),
      );
      const segs = 64;
      const ringPts = new Float32Array(segs * 3);
      _vec3A.set(tel.sceneX, tel.sceneY, tel.sceneZ).normalize(); // Sub-sat normal
      // Orthonormal tangent frame on surface
      _vec3B.set(0, 1, 0);
      if (Math.abs(_vec3A.dot(_vec3B)) > 0.95) _vec3B.set(1, 0, 0);
      _vec3C.crossVectors(_vec3B, _vec3A).normalize();
      _vec3B.crossVectors(_vec3A, _vec3C).normalize();

      const sinA = Math.sin(centralAngle);
      const cosA = Math.cos(centralAngle);
      const rSurf = GLOBE_RADIUS * 1.004;

      for (let i = 0; i < segs; i++) {
        const theta = (i / segs) * Math.PI * 2;
        const ct = Math.cos(theta);
        const st = Math.sin(theta);
        ringPts[i * 3] =
          rSurf * (cosA * _vec3A.x + sinA * (ct * _vec3C.x + st * _vec3B.x));
        ringPts[i * 3 + 1] =
          rSurf * (cosA * _vec3A.y + sinA * (ct * _vec3C.y + st * _vec3B.y));
        ringPts[i * 3 + 2] =
          rSurf * (cosA * _vec3A.z + sinA * (ct * _vec3C.z + st * _vec3B.z));
      }
      this.footprintRing.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(ringPts, 3),
      );
    }

    // Recompute selected inertial orbit & surface ground track smoothly (every ~12s sim time or on selection change)
    const simDelta = Math.abs(this.simTimeMs - this.lastOrbitRefreshSimMs);
    const needsOrbitUpdate =
      this.lastSelectedIdForOrbit !== sat.id || simDelta > 12000;

    if (needsOrbitUpdate) {
      this.lastSelectedIdForOrbit = sat.id;
      this.lastOrbitRefreshSimMs = this.simTimeMs;

      const orbitPts = computeInertialOrbitPoints(sat, simDate, 160);
      const numVerts = orbitPts.length / 3;
      const orbitColors = new Float32Array(numVerts * 3);
      const accent = REGIME_COLORS[sat.regime];
      for (let i = 0; i < numVerts; i++) {
        const t = i / (numVerts - 1);
        // Bright ahead of satellite (t > 0.5), fading trail behind (t < 0.5)
        const intensity = t >= 0.5 ? 0.95 : 0.22 + t * 1.1;
        orbitColors[i * 3] = accent.r * intensity + (t >= 0.5 ? 0.15 : 0);
        orbitColors[i * 3 + 1] = accent.g * intensity + (t >= 0.5 ? 0.15 : 0);
        orbitColors[i * 3 + 2] = accent.b * intensity + (t >= 0.5 ? 0.15 : 0);
      }
      this.selectedOrbitLine.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(orbitPts, 3),
      );
      this.selectedOrbitLine.geometry.setAttribute(
        'color',
        new THREE.BufferAttribute(orbitColors, 3),
      );

      const trackPts = computeGroundTrackPoints(sat, simDate, 180);
      this.groundTrackLine.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(trackPts, 3),
      );
    }

    this.selectedOrbitLine.visible = this.layers.showOrbits;
    this.groundTrackLine.visible = this.layers.showGroundTrack;
  }

  private tick = (): void => {
    if (this.disposed) return;

    const nowPerf = performance.now();
    const dt = Math.min(0.1, (nowPerf - this.lastPerfTime) / 1000);
    this.lastPerfTime = nowPerf;

    if (!this.isPaused) {
      this.simTimeMs += dt * 1000 * this.speedMultiplier;
    }

    const simDate = new Date(this.simTimeMs);
    const jd = jday(simDate);
    const gmst = gstime(jd);
    const { rsun } = sunPos(jd);
    const rLen = Math.hypot(rsun.x, rsun.y, rsun.z) || 1;
    _sunUnitEci.x = rsun.x / rLen;
    _sunUnitEci.y = rsun.y / rLen;
    _sunUnitEci.z = rsun.z / rLen;

    // Update Sun direction in ECF scene frame + inertial starfield rotation
    getSunDirectionScene(simDate, _sunDirScene);
    this.earthMaterial.uniforms.sunDir.value.set(
      _sunDirScene.x,
      _sunDirScene.y,
      _sunDirScene.z,
    );
    this.cloudMaterial.uniforms.sunDir.value.copy(
      this.earthMaterial.uniforms.sunDir.value,
    );
    this.sunLight.position.set(
      _sunDirScene.x * 12,
      _sunDirScene.y * 12,
      _sunDirScene.z * 12,
    );
    this.starField.rotation.y = -gmst;
    this.cloudMesh.rotation.y += dt * 0.0025 * (this.isPaused ? 0 : 1);

    // Propagate all satellites into InstancedMesh
    let selectedTel: SatelliteTelemetry | null = null;
    let selectedSat: ParsedSatellite | null = null;
    const count = Math.min(this.satellites.length, 256);

    for (let i = 0; i < count; i++) {
      const sat = this.satellites[i];
      const tel = propagateSatelliteTelemetry(sat, simDate, gmst, _sunUnitEci);
      if (!tel) {
        _scaleVec.set(0, 0, 0);
        _mat4.compose(_vec3A.set(0, 0, 0), _quat.identity(), _scaleVec);
        this.satInstancedMesh.setMatrixAt(i, _mat4);
        this.satHitMesh.setMatrixAt(i, _mat4);
        continue;
      }

      const isSelected = sat.id === this.selectedSatId;
      _vec3A.set(tel.sceneX, tel.sceneY, tel.sceneZ);
      // Scale marker slightly larger for high orbits so GEO/HEO remain crisp
      const altitudeBoost =
        sat.regime === 'GEO' || sat.regime === 'HEO'
          ? 1.85
          : sat.regime === 'MEO'
            ? 1.45
            : 1.0;

      // Hide instanced dot when full 3D spacecraft model occupies the selected slot
      _scaleVec.setScalar(isSelected ? 0 : altitudeBoost);
      _mat4.compose(_vec3A, _quat.identity(), _scaleVec);
      this.satInstancedMesh.setMatrixAt(i, _mat4);

      _scaleVec.setScalar(altitudeBoost);
      _mat4.compose(_vec3A, _quat.identity(), _scaleVec);
      this.satHitMesh.setMatrixAt(i, _mat4);

      const baseColor = isSelected ? SELECTED_COLOR : REGIME_COLORS[sat.regime];
      this.satInstancedMesh.setColorAt(i, baseColor);

      if (isSelected) {
        selectedTel = tel;
        selectedSat = sat;
      }
    }

    this.satInstancedMesh.instanceMatrix.needsUpdate = true;
    this.satHitMesh.instanceMatrix.needsUpdate = true;
    if (this.satInstancedMesh.instanceColor) {
      this.satInstancedMesh.instanceColor.needsUpdate = true;
    }

    if (selectedSat && selectedTel) {
      this.updateSelectedVisuals(selectedSat, selectedTel, simDate);

      if (this.followMode && !this.cameraAnimating) {
        _vec3A.set(selectedTel.sceneX, selectedTel.sceneY, selectedTel.sceneZ);
        _vec3B.copy(_vec3A).add(this.followOffset);
        this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _vec3B.x, 4.5, dt);
        this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _vec3B.y, 4.5, dt);
        this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _vec3B.z, 4.5, dt);
      }
    }

    // Smooth camera preset transitions
    if (this.cameraAnimating) {
      this.camera.position.x = THREE.MathUtils.damp(
        this.camera.position.x,
        this.targetCameraPos.x,
        5.5,
        dt,
      );
      this.camera.position.y = THREE.MathUtils.damp(
        this.camera.position.y,
        this.targetCameraPos.y,
        5.5,
        dt,
      );
      this.camera.position.z = THREE.MathUtils.damp(
        this.camera.position.z,
        this.targetCameraPos.z,
        5.5,
        dt,
      );
      this.controls.target.x = THREE.MathUtils.damp(
        this.controls.target.x,
        this.targetControlsTarget.x,
        5.5,
        dt,
      );
      this.controls.target.y = THREE.MathUtils.damp(
        this.controls.target.y,
        this.targetControlsTarget.y,
        5.5,
        dt,
      );
      this.controls.target.z = THREE.MathUtils.damp(
        this.controls.target.z,
        this.targetControlsTarget.z,
        5.5,
        dt,
      );

      if (this.camera.position.distanceTo(this.targetCameraPos) < 0.015) {
        this.cameraAnimating = false;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    // Throttle React HUD telemetry updates (~10Hz) to keep React ultra-lean
    if (nowPerf - this.lastUiSyncTime > 100) {
      this.lastUiSyncTime = nowPerf;
      this.callbacks.onClockTick(simDate);
      this.callbacks.onTelemetryUpdate(selectedTel);
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('webglcontextlost', this.onContextLost);
    dom.removeEventListener('webglcontextrestored', this.onContextRestored);
    window.removeEventListener('resize', this.onResize);

    this.controls.dispose();
    this.textures.dispose();
    this.spacecraftHandle.dispose();

    for (const line of this.allOrbitLines) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }

    for (const obj of this.disposedObjects) {
      obj.dispose();
    }

    this.renderer.dispose();
    if (dom.parentNode === this.container) {
      this.container.removeChild(dom);
    }
  }
}
