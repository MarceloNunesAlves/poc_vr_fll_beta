import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FINGER_SECTIONS = [
  { x: -0.029, length: 0.065, width: 0.011 },
  { x: -0.010, length: 0.076, width: 0.0105 },
  { x: 0.009, length: 0.070, width: 0.010 },
  { x: 0.027, length: 0.054, width: 0.0085 }
];

// Cada seção tem um centro XYZ e dois raios. As pontas afunilam para fechar a malha.
function loft(sections, steps, sides = 16) {
  const curve = new THREE.CatmullRomCurve3(sections.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const positions = [];
  const uvs = [];
  const indices = [];
  const center = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const across = new THREE.Vector3();
  const up = new THREE.Vector3();
  for (let ring = 0; ring <= steps; ring++) {
    const t = ring / steps;
    const sample = t * (sections.length - 1);
    const from = Math.min(Math.floor(sample), sections.length - 2);
    const fraction = sample - from;
    const width = THREE.MathUtils.lerp(sections[from][3], sections[from + 1][3], fraction);
    const thickness = THREE.MathUtils.lerp(sections[from][4], sections[from + 1][4], fraction);
    curve.getPoint(t, center);
    curve.getTangent(t, tangent);
    across.set(1, 0, 0).addScaledVector(tangent, -tangent.x).normalize();
    up.crossVectors(across, tangent);
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * Math.PI * 2;
      const dx = Math.cos(angle) * width;
      const dy = Math.sin(angle) * thickness;
      positions.push(
        center.x + dx * across.x + dy * up.x,
        center.y + dx * across.y + dy * up.y,
        center.z + dx * across.z + dy * up.z
      );
      uvs.push(side / sides, t);
      if (ring === steps || side === sides) continue;
      const a = ring * (sides + 1) + side;
      const b = a + sides + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  for (let i = 1; i < sides - 1; i++) {
    const end = steps * (sides + 1);
    indices.push(0, i, i + 1, end, end + i + 1, end + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  for (let ring = 0; ring <= steps; ring++) {
    const a = ring * (sides + 1);
    const b = a + sides;
    across.fromBufferAttribute(normals, a).add(up.fromBufferAttribute(normals, b)).normalize();
    normals.setXYZ(a, across.x, across.y, across.z);
    normals.setXYZ(b, across.x, across.y, across.z);
  }
  return geometry;
}

function createFinger({ x, length, width }, index, closed) {
  const knuckleZ = [-0.005, -0.009, -0.008, -0.001][index];
  const relaxedSpread = [-0.010, -0.004, 0.004, 0.012][index];
  const bend = index * 0.0015;
  // O indicador acompanha o cabo pela lateral. Os demais dedos se recolhem sob a palma.
  if (closed && index === 0) {
    return loft([
      [x, 0.006, knuckleZ + 0.013, width, width * 0.90],
      [x, 0.008, -0.017, width, width * 0.95],
      [x - 0.003, 0.002, -0.036, width * 0.92, width * 0.90],
      [x - 0.006, -0.009, -0.050, width * 0.85, width * 0.82],
      [x - 0.008, -0.021, -0.051, width * 0.75, width * 0.72],
      [x - 0.007, -0.027, -0.047, width * 0.43, width * 0.46],
      [x - 0.005, -0.028, -0.044, 0.0008, 0.0008]
    ], 20);
  }
  const sections = closed ? [
    [x, 0.006, knuckleZ + 0.013, width, width * 0.90],
    [x, 0.008, -0.022 + bend, width, width * 0.95],
    [x, -0.008, -0.043 + bend, width * 0.92, width * 0.94],
    [x, -0.030, -0.043 + bend, width * 0.83, width * 0.84],
    [x, -0.040 + bend, -0.030, width * 0.79, width * 0.72],
    [x, -0.041 + bend, -0.017, width * 0.43, width * 0.46],
    [x, -0.041 + bend, -0.014, 0.0008, 0.0008]
  ] : [
    [x, 0.006, knuckleZ + 0.013, width, width * 0.90],
    [x, 0.007, knuckleZ - length * 0.25, width, width * 0.95],
    [x + relaxedSpread * 0.36, 0.002, knuckleZ - length * 0.53, width * 0.88, width * 0.90],
    [x + relaxedSpread * 0.63, -0.008, knuckleZ - length * 0.73, width * 0.81, width * 0.81],
    [x + relaxedSpread, -0.017, knuckleZ - length * 0.90, width * 0.77, width * 0.72],
    [x + relaxedSpread, -0.021, knuckleZ - length * 0.99, width * 0.43, width * 0.46],
    [x + relaxedSpread, -0.023, knuckleZ - length * 1.03, 0.0008, 0.0008]
  ];
  return loft(sections, 20);
}

function createLeatherBump() {
  const size = 128;
  const texels = new Uint8Array(size * size * 4);
  let seed = 4769;
  for (let i = 0; i < texels.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = 107 + (seed >>> 26);
    texels.set([grain, grain, grain, 255], i);
  }
  const texture = new THREE.DataTexture(texels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createGloveMeshes() {
  const palm = loft([
    [0.004, -0.001, 0.108, 0.027, 0.018],
    [0.004, 0, 0.081, 0.028, 0.018],
    [0.005, 0.001, 0.058, 0.030, 0.019],
    [0.003, 0.005, 0.035, 0.039, 0.020],
    [0.001, 0.007, 0.016, 0.042, 0.019],
    [0, 0.006, -0.002, 0.040, 0.015],
    [-0.003, 0.006, -0.016, 0.033, 0.007],
    [-0.005, 0.007, -0.022, 0.016, 0.002]
  ], 24, 24);
  const thumbBase = [[-0.016, 0.001, 0.047, 0.010, 0.009], [-0.036, -0.002, 0.027, 0.013, 0.012]];
  const thumb = loft([
    ...thumbBase,
    [-0.054, -0.006, 0.009, 0.011, 0.010],
    [-0.061, -0.010, -0.013, 0.010, 0.009],
    [-0.061, -0.013, -0.026, 0.008, 0.007],
    [-0.059, -0.014, -0.032, 0.001, 0.001]
  ], 18);
  const closedThumb = loft([
    ...thumbBase,
    [-0.052, -0.011, 0.012, 0.011, 0.010],
    [-0.052, -0.027, -0.005, 0.010, 0.009],
    [-0.045, -0.033, -0.019, 0.008, 0.007],
    [-0.037, -0.033, -0.027, 0.001, 0.001]
  ], 18);
  const fingers = FINGER_SECTIONS.map((finger, i) => createFinger(finger, i, false));
  const curledFingers = FINGER_SECTIONS.map((finger, i) => createFinger(finger, i, true));
  const body = mergeGeometries([palm, thumb, ...fingers]);
  const curled = mergeGeometries([palm, closedThumb, ...curledFingers]);
  body.morphAttributes.position = [curled.getAttribute('position')];
  body.morphAttributes.normal = [curled.getAttribute('normal')];

  const cuff = loft([
    [0.004, -0.001, 0.109, 0.028, 0.019],
    [0.004, -0.001, 0.105, 0.031, 0.021],
    [0.004, 0, 0.077, 0.030, 0.020],
    [0.005, 0, 0.073, 0.028, 0.018]
  ], 12, 24);
  const seams = [cuff];
  for (const side of [-1, 1]) {
    const seam = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.013, 0.017, 0.079),
      new THREE.Vector3(side * 0.021, 0.020, 0.055),
      new THREE.Vector3(side * 0.027, 0.021, 0.032),
      new THREE.Vector3(side * 0.030, 0.019, 0.011),
      new THREE.Vector3(side * 0.027, 0.016, 0.001)
    ]);
    seams.push(new THREE.TubeGeometry(seam, 18, 0.0011, 5, false));
  }
  const grain = createLeatherBump();
  const leather = new THREE.MeshStandardMaterial({
    color: 0x252429, roughness: 0.54, bumpMap: grain, bumpScale: 0.002,
    emissive: 0x141419, emissiveIntensity: 0.18
  });
  const trim = leather.clone();
  trim.color.setHex(0x352f2e);
  trim.roughness = 0.65;
  return { body, leather, seams: mergeGeometries(seams), trim };
}

let gloveMeshes;

export function createLeatherGlove() {
  gloveMeshes ??= createGloveMeshes();
  const { body, leather, seams, trim } = gloveMeshes;
  const group = new THREE.Group();
  const model = new THREE.Group();
  const skin = new THREE.Mesh(body, leather);
  model.add(skin, new THREE.Mesh(seams, trim));

  // O eixo -Z da luva vai do punho aos dedos. +Y é o dorso da mão.
  model.rotateY(0.36);
  model.rotateX(0.20);
  const gripCenter = new THREE.Vector3(-0.029, -0.022, -0.025);
  model.position.copy(gripCenter.applyQuaternion(model.quaternion)).negate();
  group.add(model);

  return {
    group,
    setHandedness(handedness) {
      group.scale.x = handedness === 'left' ? -1 : 1;
    },
    setGrip(closed, dt) {
      const target = closed ? 1 : 0;
      skin.morphTargetInfluences[0] = THREE.MathUtils.damp(skin.morphTargetInfluences[0], target, 20, dt);
    }
  };
}
