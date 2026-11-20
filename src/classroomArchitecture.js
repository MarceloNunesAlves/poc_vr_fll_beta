import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Agrupa malhas opacas por material dentro de um conjunto decorativo estático.
export function batchStaticMeshes(group) {
  const byMaterial = new Map();
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert();
  group.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh || Array.isArray(object.material) ||
        object.material.transparent || object.matrixWorld.determinant() < 0) return;
    if (!byMaterial.has(object.material)) byMaterial.set(object.material, []);
    byMaterial.get(object.material).push(object);
  });
  const transform = new THREE.Matrix4();
  for (const [material, meshes] of byMaterial) {
    if (meshes.length < 2) continue;
    const parts = meshes.map(({ geometry, matrixWorld }) => {
      const part = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      return part.applyMatrix4(transform.multiplyMatrices(inverse, matrixWorld));
    });
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    if (!geometry) continue;
    meshes.forEach((mesh) => mesh.removeFromParent());
    group.add(new THREE.Mesh(geometry, material));
  }
  return group;
}

// O mesmo perfil ogival é usado no vidro, nas folhas da porta e nas molduras.
function pointedArch(width, spring, rise, border = 0) {
  const half = width / 2 + border;
  const top = spring + rise + border;
  const shape = new THREE.Shape();
  shape.moveTo(-half, -border);
  shape.lineTo(half, -border);
  shape.lineTo(half, spring);
  shape.quadraticCurveTo(half, spring + (rise + border) * 0.53, 0, top);
  shape.quadraticCurveTo(-half, spring + (rise + border) * 0.53, -half, spring);
  shape.closePath();
  return shape;
}

function archMolding(width, spring, rise, inner, outer, depth, stoneMat) {
  const shape = pointedArch(width, spring, rise, outer);
  shape.holes.push(pointedArch(width, spring, rise, inner));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 1,
    curveSegments: 12
  });
  return new THREE.Mesh(geometry, stoneMat);
}

function archSurface(width, spring, rise, material) {
  const geometry = new THREE.ShapeGeometry(pointedArch(width, spring, rise));
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < positions.count; i++) {
    uv.setXY(i, positions.getX(i) / width + 0.5, positions.getY(i) / (spring + rise));
  }
  return new THREE.Mesh(geometry, material);
}

export function createCarvedPanel(width, height, woodMat, insetMat) {
  const spring = height * 0.72;
  const rise = height - spring;
  const group = new THREE.Group();
  const inset = archSurface(width, spring, rise, insetMat);
  const trim = archMolding(width, spring, rise, -0.013, 0.016, 0.013, woodMat);
  inset.position.z = 0.004;
  trim.position.z = 0.015;
  group.add(inset, trim);
  return batchStaticMeshes(group);
}

export function createGothicWindow(width, height, glassMat, stoneMat, traceryMat) {
  const group = new THREE.Group();
  const spring = height * 0.68;
  const rise = height - spring;
  const glass = archSurface(width, spring, rise, glassMat);
  glass.position.z = 0.013;
  const reveal = archMolding(width, spring, rise, 0, 0.14, 0.16, stoneMat);
  const lip = archMolding(width, spring, rise, 0.065, 0.16, 0.036, stoneMat);
  lip.position.z = 0.16;

  const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.039, spring * 1.25, 0.063), traceryMat);
  mullion.position.set(0, spring * 0.625, 0.07);
  // Dois arcos menores sobre as lancetas, com um quadrifólio no encontro.
  const tracery = new THREE.Shape();
  tracery.moveTo(-width / 2, spring * 0.65);
  for (const centerX of [-width / 4, width / 4]) {
    tracery.quadraticCurveTo(centerX - width * 0.25, spring * 0.93, centerX, spring * 1.06);
    tracery.quadraticCurveTo(centerX + width * 0.25, spring * 0.93, centerX + width / 4, spring * 0.65);
  }
  const traceryCurve = new THREE.CatmullRomCurve3(
    tracery.getPoints(10).map(({x, y}) => new THREE.Vector3(x, y, 0.083))
  );
  const lancets = new THREE.Mesh(new THREE.TubeGeometry(traceryCurve, 32, 0.016, 5, false), traceryMat);
  const lobeRadius = width * 0.11;
  const lobeCenterY = spring + rise * 0.45;
  const lobePoints = Array.from({ length: 32 }, (_, i) => {
    const angle = i * Math.PI / 16;
    const radius = lobeRadius * (0.78 + Math.cos(angle * 4) * 0.22);
    return new THREE.Vector3(radius * Math.cos(angle), lobeCenterY + radius * Math.sin(angle), 0.077);
  });
  const rosette = new THREE.Mesh(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(lobePoints, true), 32, 0.016, 5, true
  ), traceryMat);

  const sill = new THREE.Mesh(new THREE.BoxGeometry(width + 0.36, 0.10, 0.29), stoneMat);
  sill.position.set(0, -0.12, 0.135);
  group.add(glass, reveal, lip, mullion, lancets, rosette, sill);
  return batchStaticMeshes(group);
}

export function createGothicDoor(stoneMat, plankMat, ironMat) {
  const group = new THREE.Group();
  const width = 1.78;
  const spring = 2.14;
  const rise = 0.88;
  const leaves = archSurface(width, spring, rise, plankMat);
  const surround = archMolding(width, spring, rise, 0, 0.26, 0.14, stoneMat);
  const molding = archMolding(width, spring, rise, 0.035, 0.15, 0.07, stoneMat);
  leaves.position.z = 0.023;
  molding.position.z = 0.14;
  group.add(leaves, surround, molding);

  const stile = new THREE.Mesh(new THREE.BoxGeometry(0.029, spring + rise, 0.04), ironMat);
  stile.position.set(0, (spring + rise) / 2, 0.044);
  group.add(stile);

  const seamMat = new THREE.MeshStandardMaterial({ color: 0x3d2317, roughness: 0.82 });
  for (const x of [-0.70, -0.51, -0.33, -0.17, 0.17, 0.33, 0.51, 0.70]) {
    const t = Math.sqrt(1 - 2 * Math.abs(x) / width);
    const height = spring + rise * (1.06 * (1 - t) * t + t * t);
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.013, height), seamMat);
    seam.position.set(x, height / 2, 0.024);
    group.add(seam);
  }

  const strap = new THREE.Shape();
  strap.moveTo(0, -0.038);
  strap.lineTo(0.39, -0.024);
  strap.quadraticCurveTo(0.49, -0.02, 0.58, 0);
  strap.quadraticCurveTo(0.49, 0.02, 0.39, 0.024);
  strap.lineTo(0, 0.038);
  strap.closePath();
  const strapGeo = new THREE.ExtrudeGeometry(strap, { depth: 0.015, bevelEnabled: false });
  const boltGeo = new THREE.SphereGeometry(0.017, 6, 4);
  const handleGeo = new THREE.TorusGeometry(0.062, 0.013, 6, 14);
  for (const side of [-1, 1]) {
    for (const y of [0.73, 1.92]) {
      const hinge = new THREE.Mesh(strapGeo, ironMat);
      hinge.scale.x = -side;
      hinge.position.set(side * 0.86, y, 0.055);
      group.add(hinge);
      for (const x of [0.78, 0.57, 0.36]) {
        const bolt = new THREE.Mesh(boltGeo, ironMat);
        bolt.position.set(side * x, y, 0.074);
        group.add(bolt);
      }
    }
    const handle = new THREE.Mesh(handleGeo, ironMat);
    handle.position.set(side * 0.16, 1.17, 0.085);
    group.add(handle);
  }
  return batchStaticMeshes(group);
}

function vaultHeight(t, spring, apex) {
  return spring + (apex - spring) * Math.sqrt(Math.max(0, 1 - t * t));
}

// A abóbada de aresta resulta do encontro de dois perfis semicirculares.
function vaultSurface(width, length, spring, apex) {
  const steps = 24;
  const vertices = [];
  const uv = [];
  const indices = [];
  for (let row = 0; row <= steps; row++) {
    const v = row / steps;
    for (let col = 0; col <= steps; col++) {
      const u = col / steps;
      const x = 2 * u - 1;
      const z = 2 * v - 1;
      vertices.push(x * width / 2, vaultHeight(Math.min(Math.abs(x), Math.abs(z)), spring, apex), z * length / 2);
      uv.push(u, v * length / width);
    }
  }
  for (let row = 0; row < steps; row++) {
    for (let col = 0; col < steps; col++) {
      const a = row * (steps + 1) + col;
      const b = a + 1;
      const c = a + steps + 1;
      const d = c + 1;
      // A diagonal da malha acompanha o encontro das duas superfícies.
      if ((row < steps / 2) === (col < steps / 2)) indices.push(a, b, d, a, d, c);
      else indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Seção retangular orientada pela curva, com o veio da madeira no sentido do arco.
function sweptRib(points, width, depth, material) {
  const vertices = [];
  const uv = [];
  const indices = [];
  const tangent = new THREE.Vector3();
  const across = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const corners = [[-1, -1], [-1, 1], [1, 1], [1, -1]];
  let distance = 0;
  points.forEach((point, i) => {
    if (i > 0) distance += point.distanceTo(points[i - 1]);
    tangent.subVectors(points[Math.min(i + 1, points.length - 1)], points[Math.max(0, i - 1)]).normalize();
    across.crossVectors(tangent, up).normalize();
    radial.crossVectors(across, tangent).normalize();
    for (let face = 0; face < 4; face++) {
      for (const corner of [corners[face], corners[(face + 1) % 4]]) {
        const position = point.clone().addScaledVector(across, corner[0] * width / 2)
          .addScaledVector(radial, corner[1] * depth / 2);
        vertices.push(position.x, position.y, position.z);
      }
      uv.push(distance * 0.46, 0.10, distance * 0.46, 0.36);
      if (i === 0) continue;
      const a = (i - 1) * 8 + face * 2;
      const b = i * 8 + face * 2;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

export function createVaultedCeiling(width, length, spring, apex, vaultMat, stoneMat, timberMat) {
  const group = new THREE.Group();
  const bayLength = length / 3;
  const geometry = vaultSurface(width, bayLength, spring, apex);
  const diagonal = (side) => sweptRib(Array.from({ length: 33 }, (_, i) => {
    const angle = Math.PI * i / 32;
    const t = -Math.cos(angle);
    return new THREE.Vector3(t * (width / 2 - 0.04), vaultHeight(t, spring, apex) - 0.045, side * t * bayLength / 2);
  }), 0.16, 0.16, stoneMat);
  const ribLeft = diagonal(1);
  const ribRight = diagonal(-1);
  const bossGeo = new THREE.CylinderGeometry(0.18, 0.21, 0.14, 12);
  for (const z of [-bayLength, 0, bayLength]) {
    const bay = new THREE.Mesh(geometry, vaultMat);
    const left = ribLeft.clone();
    const right = ribRight.clone();
    const boss = new THREE.Mesh(bossGeo, stoneMat);
    bay.position.z = left.position.z = right.position.z = z;
    boss.position.set(0, apex - 0.14, z);
    group.add(bay, left, right, boss);
  }
  const arch = sweptRib(Array.from({ length: 33 }, (_, i) => {
    const t = -Math.cos(Math.PI * i / 32);
    return new THREE.Vector3(t * (width / 2 - 0.10), vaultHeight(t, spring, apex) - 0.095, 0);
  }), 0.30, 0.25, timberMat);
  const tieGeo = new THREE.BoxGeometry(width * 0.75, 0.20, 0.28);
  for (const z of [-length / 2 + 0.14, -bayLength / 2, bayLength / 2, length / 2 - 0.14]) {
    const archAtBay = arch.clone();
    archAtBay.position.z = z;
    group.add(archAtBay);
    if (Math.abs(z) < bayLength) {
      const tie = new THREE.Mesh(tieGeo, timberMat);
      tie.position.set(0, spring + (apex - spring) * 0.60, z);
      group.add(tie);
    }
  }
  return batchStaticMeshes(group);
}
