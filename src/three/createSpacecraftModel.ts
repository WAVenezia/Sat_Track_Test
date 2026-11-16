import * as THREE from 'three';

export interface SpacecraftModelHandle {
  group: THREE.Group;
  dispose: () => void;
}

/**
 * Builds a 7-part composite procedural spacecraft assembly (THREE.Group)
 * with distinct roughness/metalness contrast across thermal foil, avionics bay,
 * parabolic dish, photovoltaic wings, optical sensor, and thruster nozzle.
 */
export function createSpacecraftModel(
  solarPanelTexture: THREE.Texture,
  isSoftwareGl: boolean,
): SpacecraftModelHandle {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // 1. Primary Gold MLI Thermal Foil Octagonal Bus
  const busGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.95, 8);
  busGeo.rotateX(Math.PI / 2); // Align axis along +Z velocity vector
  geometries.push(busGeo);

  const goldFoilMat = new THREE.MeshStandardMaterial({
    color: 0xe6b422,
    metalness: 0.92,
    roughness: 0.34,
    emissive: 0x3b2a04,
    emissiveIntensity: 0.25,
  });
  materials.push(goldFoilMat);

  const busMesh = new THREE.Mesh(busGeo, goldFoilMat);
  group.add(busMesh);

  // 2. Brushed Titanium Avionics & Payload Frame
  const avionicsGeo = new THREE.BoxGeometry(0.68, 0.56, 0.62);
  geometries.push(avionicsGeo);

  const titaniumMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.85,
    roughness: 0.22,
  });
  materials.push(titaniumMat);

  const avionicsMesh = new THREE.Mesh(avionicsGeo, titaniumMat);
  avionicsMesh.position.set(0, 0.08, 0.24);
  group.add(avionicsMesh);

  // 3. Parabolic High-Gain Dish Antenna (LatheGeometry) + Feed Strut
  const dishPoints: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const r = (i / 10) * 0.44;
    const y = (r * r) * 0.85;
    dishPoints.push(new THREE.Vector2(r, y));
  }
  const dishGeo = new THREE.LatheGeometry(dishPoints, 24);
  geometries.push(dishGeo);

  const ceramicMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    metalness: 0.08,
    roughness: 0.72,
    side: THREE.DoubleSide,
  });
  materials.push(ceramicMat);

  const dishMesh = new THREE.Mesh(dishGeo, ceramicMat);
  dishMesh.position.set(0, 0.44, 0.12);
  dishMesh.rotation.x = 0.22;
  group.add(dishMesh);

  const feedGeo = new THREE.CylinderGeometry(0.025, 0.035, 0.3, 8);
  geometries.push(feedGeo);
  const feedMesh = new THREE.Mesh(feedGeo, titaniumMat);
  feedMesh.position.set(0, 0.58, 0.15);
  feedMesh.rotation.x = 0.22;
  group.add(feedMesh);

  // 4. Dual Articulated Photovoltaic Solar Array Wings + Yoke Booms
  const boomGeo = new THREE.CylinderGeometry(0.035, 0.035, 4.4, 8);
  boomGeo.rotateZ(Math.PI / 2);
  geometries.push(boomGeo);

  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.18,
    roughness: 0.78,
  });
  materials.push(carbonMat);

  const boomMesh = new THREE.Mesh(boomGeo, carbonMat);
  group.add(boomMesh);

  const panelGeo = new THREE.BoxGeometry(1.55, 0.03, 0.72);
  geometries.push(panelGeo);

  const solarMat = new THREE.MeshStandardMaterial({
    map: solarPanelTexture,
    color: 0x93c5fd,
    metalness: 0.48,
    roughness: 0.18,
    emissive: 0x0b2545,
    emissiveIntensity: 0.35,
  });
  materials.push(solarMat);

  const portWing = new THREE.Mesh(panelGeo, solarMat);
  portWing.position.set(-1.38, 0, 0);
  portWing.rotation.x = 0.35;
  group.add(portWing);

  const starboardWing = new THREE.Mesh(panelGeo, solarMat);
  starboardWing.position.set(1.38, 0, 0);
  starboardWing.rotation.x = 0.35;
  group.add(starboardWing);

  // 5. Nadir Optical / SAR Sensor Housing + Sapphire Lens (points -Y toward Earth)
  const turretGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.24, 16);
  geometries.push(turretGeo);
  const turretMesh = new THREE.Mesh(turretGeo, carbonMat);
  turretMesh.position.set(0, -0.34, 0.18);
  group.add(turretMesh);

  const lensGeo = new THREE.SphereGeometry(0.13, 16, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
  geometries.push(lensGeo);
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    metalness: 0.1,
    roughness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    transmission: isSoftwareGl ? 0 : 0.75,
    transparent: true,
    opacity: isSoftwareGl ? 0.55 : 0.95,
    ior: 1.76,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.45,
  });
  materials.push(lensMat);

  const lensMesh = new THREE.Mesh(lensGeo, lensMat);
  lensMesh.position.set(0, -0.42, 0.18);
  group.add(lensMesh);

  // 6. Aft Titanium Thruster Nozzle Bell (LatheGeometry at -Z)
  const nozzlePoints = [
    new THREE.Vector2(0.06, 0),
    new THREE.Vector2(0.09, -0.08),
    new THREE.Vector2(0.18, -0.26),
    new THREE.Vector2(0.22, -0.34),
  ];
  const nozzleGeo = new THREE.LatheGeometry(nozzlePoints, 16);
  nozzleGeo.rotateX(Math.PI / 2);
  geometries.push(nozzleGeo);

  const nozzleMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.9,
    roughness: 0.32,
    side: THREE.DoubleSide,
  });
  materials.push(nozzleMat);

  const nozzleMesh = new THREE.Mesh(nozzleGeo, nozzleMat);
  nozzleMesh.position.set(0, 0, -0.48);
  group.add(nozzleMesh);

  // 7. Forward Telemetry Transponder Beacon Tip (+Z)
  const beaconGeo = new THREE.OctahedronGeometry(0.075, 0);
  geometries.push(beaconGeo);
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfacc15,
    emissiveIntensity: 1.2,
    roughness: 0.2,
    metalness: 0.1,
  });
  materials.push(beaconMat);
  const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
  beaconMesh.position.set(0, 0.12, 0.62);
  group.add(beaconMesh);

  return {
    group,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
