import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  batchStaticMeshes, createCarvedPanel, createGothicDoor, createGothicWindow, createVaultedCeiling
} from './classroomArchitecture.js';
import { FLOOR_QR_CORNERS, QR_PHYSICAL_SIZE_METERS, generateCornerQrCanvas } from './qrFloorAnchors.js';

const wandGltfLoader = new GLTFLoader();
const wandModelCache = new Map();

/**
 * Carrega e normaliza um modelo .glb de varinha para o sistema de coordenadas da mão/mesa:
 * - Alinha automaticamente o eixo principal (do cabo mais grosso em z = +0.11 até a ponta fina em z = -0.275)
 * - Escala para 38,5 cm de comprimento real em VR (0.385m)
 */
function loadNormalizedWandGlb(glbUrl) {
  if (wandModelCache.has(glbUrl)) {
    return wandModelCache.get(glbUrl).then((template) => template.clone(true));
  }

  const promise = new Promise((resolve, reject) => {
    wandGltfLoader.load(
      glbUrl,
      (gltf) => {
        const rawScene = gltf.scene;
        rawScene.updateMatrixWorld(true);

        // Coleta amostra de vértices em espaço mundial do GLB para achar o eixo principal (PCA)
        const points = [];
        rawScene.traverse((child) => {
          if (child.isMesh && child.geometry && child.geometry.attributes.position) {
            const posAttr = child.geometry.attributes.position;
            const step = Math.max(1, Math.floor(posAttr.count / 2000));
            for (let i = 0; i < posAttr.count; i += step) {
              const v = new THREE.Vector3().fromBufferAttribute(posAttr, i).applyMatrix4(child.matrixWorld);
              points.push(v);
            }

            // Ajusta materiais PBR para brilharem bem sob a iluminação de velas da sala
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => {
              if (!m) return;
              if (typeof m.metalness === 'number') m.metalness = Math.min(m.metalness, 0.35);
              if (typeof m.roughness === 'number') m.roughness = Math.max(m.roughness, 0.35);
              m.needsUpdate = true;
            });
          }
        });

        const normalizedGroup = new THREE.Group();

        if (points.length > 10) {
          const mean = new THREE.Vector3();
          points.forEach((p) => mean.add(p));
          mean.divideScalar(points.length);

          let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0;
          points.forEach((p) => {
            const x = p.x - mean.x;
            const y = p.y - mean.y;
            const z = p.z - mean.z;
            cxx += x * x; cxy += x * y; cxz += x * z;
            cyy += y * y; cyz += y * z; czz += z * z;
          });

          // Power iteration para o autovetor dominante (comprimento da varinha)
          const axis = new THREE.Vector3(1, 1, 0.1).normalize();
          for (let iter = 0; iter < 30; iter++) {
            const nx = cxx * axis.x + cxy * axis.y + cxz * axis.z;
            const ny = cxy * axis.x + cyy * axis.y + cyz * axis.z;
            const nz = cxz * axis.x + cyz * axis.y + czz * axis.z;
            axis.set(nx, ny, nz).normalize();
          }

          let minProj = Infinity;
          let maxProj = -Infinity;
          points.forEach((p) => {
            const proj = (p.x - mean.x) * axis.x + (p.y - mean.y) * axis.y + (p.z - mean.z) * axis.z;
            if (proj < minProj) minProj = proj;
            if (proj > maxProj) maxProj = proj;
          });

          const span = Math.max(0.001, maxProj - minProj);
          let rMinSum = 0, rMinCnt = 0, rMaxSum = 0, rMaxCnt = 0;
          points.forEach((p) => {
            const dx = p.x - mean.x;
            const dy = p.y - mean.y;
            const dz = p.z - mean.z;
            const proj = dx * axis.x + dy * axis.y + dz * axis.z;
            const px = dx - proj * axis.x;
            const py = dy - proj * axis.y;
            const pz = dz - proj * axis.z;
            const r = Math.hypot(px, py, pz);
            if (proj < minProj + span * 0.25) {
              rMinSum += r;
              rMinCnt++;
            }
            if (proj > maxProj - span * 0.25) {
              rMaxSum += r;
              rMaxCnt++;
            }
          });

          // Garante que o vetor 'axis' aponte do cabo (mais espesso) para a ponta (mais fina)
          const rMinAvg = rMinCnt > 0 ? rMinSum / rMinCnt : 0;
          const rMaxAvg = rMaxCnt > 0 ? rMaxSum / rMaxCnt : 0;
          if (rMaxAvg > rMinAvg) {
            axis.negate();
          }

          // Rotaciona o modelo para que cabo -> ponta aponte para -Z (0, 0, -1)
          const targetDir = new THREE.Vector3(0, 0, -1);
          const alignQuat = new THREE.Quaternion().setFromUnitVectors(axis, targetDir);
          rawScene.quaternion.premultiply(alignQuat);
          rawScene.updateMatrixWorld(true);

          // Calcula bounding box já rotacionado e escala para 0.385m (de z=-0.275 na ponta até z=+0.11 no cabo)
          const rotBox = new THREE.Box3().setFromObject(rawScene);
          const rotSize = new THREE.Vector3();
          const rotCenter = new THREE.Vector3();
          rotBox.getSize(rotSize);
          rotBox.getCenter(rotCenter);

          const targetLength = 0.385;
          const scale = targetLength / Math.max(rotSize.z, 0.001);
          rawScene.scale.multiplyScalar(scale);
          rawScene.updateMatrixWorld(true);

          const finalBox = new THREE.Box3().setFromObject(rawScene);
          const finalCenter = new THREE.Vector3();
          finalBox.getCenter(finalCenter);

          // Posiciona a ponta fina exatamente em z = -0.275 (onde fica a esfera luminosa da magia)
          rawScene.position.x -= finalCenter.x;
          rawScene.position.y -= finalCenter.y;
          rawScene.position.z += -0.275 - finalBox.min.z;
        }

        normalizedGroup.add(rawScene);
        resolve(normalizedGroup);
      },
      undefined,
      (err) => reject(err)
    );
  });

  wandModelCache.set(glbUrl, promise);
  return promise.then((template) => template.clone(true));
}

function loadClassroomTexture(loader, filename, repeatX = 1, repeatY = 1, onLoad) {
  const texture = loader.load(`/assets/classroom/${filename}`, onLoad);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  return texture;
}

function createSoftEdgeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.47)');
  gradient.addColorStop(0.72, 'rgba(255,255,255,0.12)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Textura original da cadeira central.
 */
function createPlayerChairTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#583118';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 48; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(22, 10, 4, 0.26)' : 'rgba(115, 68, 32, 0.18)';
    ctx.fillRect(0, i * 5.3, 256, 2.8);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Desenha o Emblema Heráldico do Leão Dourado (usado no tapete vermelho e nos estandartes)
 */
function drawGoldenLionCrest(ctx, cx, cy, radius) {
  ctx.save();
  ctx.translate(cx, cy);
  const s = radius / 100;
  ctx.scale(s, s);

  ctx.fillStyle = '#eab839';
  // O leão rampante e a cauda recortada funcionam tanto no tecido quanto no escudo.
  ctx.fill(new Path2D(
    'M-11 -36 C-2 -54 -6 -70 -18 -72 L-31 -86 L-36 -74 L-47 -71 L-51 -64 L-68 -60 L-65 -51 ' +
    'L-48 -50 L-47 -46 L-64 -43 L-59 -36 L-43 -37 L-32 -30 L-41 -21 L-61 -32 L-73 -44 ' +
    'L-79 -43 L-79 -31 L-87 -34 L-85 -24 L-64 -15 L-38 -8 L-29 -11 L-33 2 L-51 8 L-65 0 ' +
    'L-72 1 L-69 10 L-76 10 L-69 21 L-53 22 L-29 15 L-9 19 L-10 29 L-35 39 L-40 59 ' +
    'L-61 63 L-68 72 L-40 74 L-25 65 L-24 53 L-2 49 L3 58 L-3 74 L-20 80 L-23 90 ' +
    'L6 89 L16 80 L20 58 L29 45 C46 28 30 13 16 3 C10 -4 4 -16 2 -33 L-5 -43 Z'
  ));
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#eab839';
  ctx.stroke(new Path2D('M24 43 C70 50 92 10 65 -8 C48 -20 36 -5 42 8 C48 21 76 17 85 -5 C95 -26 79 -57 63 -66'));
  ctx.fill(new Path2D('M63 -66 C47 -65 41 -77 45 -87 C51 -80 62 -82 65 -74 L68 -81 C75 -75 71 -64 63 -66 Z'));
  ctx.fillStyle = '#8e5519';
  ctx.fill(new Path2D('M-48 -64 L-39 -66 L-41 -59 Z M-24 -58 Q-17 -41 -29 -30 L-20 -32 Q-10 -51 -24 -58 Z'));

  ctx.restore();
}

/**
 * Cria a textura do Tapete Vermelho Real com borda dupla dourada e os 3 Leões Dourados (Fotos 1, 3 e 4)
 */
function createRoyalRedCarpetTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Veludo carmesim imperial
  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, '#6e0e14');
  grad.addColorStop(0.5, '#8c161e');
  grad.addColorStop(1, '#6e0e14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 1024);

  // Borda dupla dourada em todo o perímetro do tapete
  ctx.strokeStyle = '#e5b842';
  ctx.lineWidth = 14;
  ctx.strokeRect(24, 24, 512 - 48, 1024 - 48);

  ctx.strokeStyle = '#e5b842';
  ctx.lineWidth = 8;
  ctx.strokeRect(48, 48, 512 - 96, 1024 - 96);

  // 3 Brasões de Leão Dourado distribuídos ao longo do tapete (exatamente como nas imagens!)
  [230, 512, 794].forEach((cy) => {
    drawGoldenLionCrest(ctx, 256, cy, 92);
  });

  // A trama atravessa o campo vermelho e o bordado. O ruído é determinístico.
  const carpetPixels = ctx.getImageData(0, 0, 512, 1024);
  for (let y = 0; y < 1024; y++) {
    for (let x = 0; x < 512; x++) {
      const fiber = ((x * 17 + y * 11 + x * y * 7) % 13) - 6 + (y % 3 === 0 ? 4 : -2);
      const p = (y * 512 + x) * 4;
      carpetPixels.data[p] += fiber;
      carpetPixels.data[p + 1] += fiber * 0.65;
      carpetPixels.data[p + 2] += fiber * 0.55;
    }
  }
  ctx.putImageData(carpetPixels, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Cria textura de vitral gótico azul noturno com losangos de chumbo e silhueta de pinheiros (Fotos 2 e 4)
 */
function createGothicWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#182956');
  sky.addColorStop(0.45, '#345eaf');
  sky.addColorStop(0.83, '#577ab6');
  sky.addColorStop(1, '#233d68');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 256, 512);

  // Camadas de pinheiros e a trama de chumbo vista através do vidro azul.
  for (let layer = 0; layer < 2; layer++) {
    ctx.fillStyle = layer === 0 ? '#294367' : '#172b49';
    for (let i = 0; i < 9; i++) {
      const x = i * 34 - 10 + layer * 13;
      const treeTop = 277 + (i * i * 17 + layer * 19) % 116;
      ctx.beginPath();
      ctx.moveTo(x, treeTop);
      for (let branch = 1; branch <= 5; branch++) {
        const y = treeTop + branch * 19;
        const spread = 4 + branch * 4;
        ctx.lineTo(x - spread, y + 10);
        ctx.lineTo(x - spread * 0.50, y + 8);
      }
      ctx.lineTo(x - 3, 512);
      ctx.lineTo(x + 3, 512);
      for (let branch = 5; branch >= 1; branch--) {
        const y = treeTop + branch * 19;
        const spread = 4 + branch * 4;
        ctx.lineTo(x + spread * 0.50, y + 8);
        ctx.lineTo(x + spread, y + 10);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#243047';
  const step = 54;
  for (let y = -256; y < 512 + 256; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + 256);
    ctx.moveTo(256, y);
    ctx.lineTo(0, y + 256);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Cria textura do Quadro-Negro com fórmulas arcanas e pentagrama geométrico (Foto 3)
 */
function createBlackboardTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 340;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#181c1b';
  ctx.fillRect(0, 0, 512, 340);

  // Poeira de giz sutil
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.fillRect(24, 20, 464, 300);

  ctx.strokeStyle = 'rgba(235, 232, 220, 0.82)';
  ctx.fillStyle = 'rgba(235, 232, 220, 0.85)';
  ctx.lineWidth = 2.2;

  // Título e anotações de feitiço em giz
  ctx.font = 'italic 22px Georgia, serif';
  ctx.fillText('Wingardium Leviosa — Levitação', 32, 48);

  ctx.font = '15px Georgia, serif';
  const formulas = [
    'I.   Swish & Flick  →  ΔF = m · g · ψ(t)',
    'II.  Pronúncia: Win-GAR-di-um Le-vi-O-sa',
    'III. Estabilidade Etérea: ∮ E · dl = -dΦ/dt',
    'IV.  Foco Luminoso: λ = h / (m · v_mágica)',
    'V.   Harmonia da Pena: ω₀ = √(k_aura / I)'
  ];
  formulas.forEach((line, idx) => {
    ctx.fillText(line, 32, 92 + idx * 42);
  });

  // Diagrama geométrico / estrela alquímica à direita (como na foto 3)
  const cx = 405;
  const cy = 215;
  const r = 68;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
  ctx.stroke();

  // Estrela de 5 pontas inscrita
  ctx.beginPath();
  for (let i = 0; i <= 5; i++) {
    const idx = (i * 2) % 5;
    const ang = -Math.PI / 2 + (idx * Math.PI * 2) / 5;
    const px = cx + Math.cos(ang) * (r * 0.84);
    const py = cy + Math.sin(ang) * (r * 0.84);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Pequenos círculos orbitais no topo direito
  ctx.beginPath();
  ctx.arc(385, 85, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(435, 78, 14, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 *Constrói uma Pena de Pássaro Branca Grande em 3D (para o feitiço Wingardium Leviosa)
 */
function createLargeWhiteFeather() {
  const featherGroup = new THREE.Group();

  // Haste central branca perolada (calamus/rachis)
  const shaftGeo = new THREE.CylinderGeometry(0.005, 0.009, 0.44, 12);
  shaftGeo.rotateZ(Math.PI / 2);
  const shaftMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0.1,
    emissive: 0xfff6d6,
    emissiveIntensity: 0.28
  });
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  featherGroup.add(shaft);

  // Pluma branca macia em camadas (formato orgânico de pena grande)
  const vaneShape = new THREE.Shape();
  vaneShape.moveTo(-0.18, 0);
  vaneShape.quadraticCurveTo(-0.05, 0.085, 0.20, 0.015);
  vaneShape.quadraticCurveTo(0.23, 0, 0.20, -0.015);
  vaneShape.quadraticCurveTo(-0.05, -0.085, -0.18, 0);

  const vaneGeo = new THREE.ShapeGeometry(vaneShape, 24);
  vaneGeo.rotateX(-Math.PI / 2);

  const vaneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.4,
    side: THREE.DoubleSide,
    emissive: 0xffe89e,
    emissiveIntensity: 0.24
  });

  const vaneMain = new THREE.Mesh(vaneGeo, vaneMat);
  vaneMain.position.y = 0.003;
  featherGroup.add(vaneMain);

  const vaneTop = new THREE.Mesh(vaneGeo, vaneMat);
  vaneTop.scale.set(0.88, 1, 0.72);
  vaneTop.position.y = 0.008;
  vaneTop.rotation.z = 0.04;
  featherGroup.add(vaneTop);

  // Halo mágico sob a pena para deixá-la bem visível sobre a mesa da professora
  const auraGeo = new THREE.RingGeometry(0.16, 0.22, 32);
  auraGeo.rotateX(-Math.PI / 2);
  const auraMat = new THREE.MeshBasicMaterial({
    color: 0xf5d061,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.65
  });
  const auraRing = new THREE.Mesh(auraGeo, auraMat);
  auraRing.position.y = -0.01;
  featherGroup.add(auraRing);

  return { featherGroup, auraRing, vaneMat };
}

/**
 * Cria um modelo 3D de Varinha Mágica (carregando o arquivo .glb correspondente e mantendo
 * a esfera luminosa na ponta z = -0.275 para os feitiços!)
 */
export function createWandMesh(woodColor = 0x5c3317, glowColor = 0xffd700, glbUrl = '/models/varinha_1.glb') {
  const wand = new THREE.Group();

  // Grupo interno para a geometria procedural de fallback (visível apenas até o .glb carregar)
  const fallbackBody = new THREE.Group();
  wand.add(fallbackBody);

  // Cabo entalhado (fallback)
  const handleGeo = new THREE.CylinderGeometry(0.014, 0.018, 0.12, 14);
  handleGeo.rotateX(Math.PI / 2);
  const handleMat = new THREE.MeshStandardMaterial({
    color: woodColor,
    roughness: 0.45,
    metalness: 0.2
  });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.z = 0.05;
  fallbackBody.add(handle);

  // Anel dourado decorativo entre o cabo e a haste (fallback)
  const ringGeo = new THREE.TorusGeometry(0.0145, 0.003, 8, 16);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xf5d061,
    roughness: 0.3,
    metalness: 0.7,
    emissive: 0xf5d061,
    emissiveIntensity: 0.2
  });
  const guardRing = new THREE.Mesh(ringGeo, ringMat);
  guardRing.position.z = -0.01;
  fallbackBody.add(guardRing);

  // Haste afilada da varinha (fallback)
  const tipGeo = new THREE.CylinderGeometry(0.0045, 0.012, 0.27, 14);
  tipGeo.rotateX(Math.PI / 2);
  const tipMat = new THREE.MeshStandardMaterial({
    color: woodColor,
    roughness: 0.35
  });
  const shaft = new THREE.Mesh(tipGeo, tipMat);
  shaft.position.z = -0.135;
  fallbackBody.add(shaft);

  // Container para o modelo 3D .glb carregado
  const glbHolder = new THREE.Group();
  wand.add(glbHolder);

  // Esfera luminosa na ponta da varinha
  const orbGeo = new THREE.SphereGeometry(0.011, 16, 16);
  const orbMat = new THREE.MeshBasicMaterial({
    color: glowColor
  });
  const orb = new THREE.Mesh(orbGeo, orbMat);
  orb.position.z = -0.275;
  wand.add(orb);

  // Halo mágico suave ao redor da ponta
  const haloGeo = new THREE.SphereGeometry(0.022, 16, 16);
  const haloMat = new THREE.MeshBasicMaterial({
    color: glowColor,
    transparent: true,
    opacity: 0.35
  });
  const orbHalo = new THREE.Mesh(haloGeo, haloMat);
  orb.add(orbHalo);

  let currentLoadToken = 0;

  const setColors = (newWood, newGlow) => {
    wand.userData.woodColor = newWood;
    wand.userData.glowColor = newGlow;
    handleMat.color.setHex(newWood);
    tipMat.color.setHex(newWood);
    orbMat.color.setHex(newGlow);
    haloMat.color.setHex(newGlow);
  };

  const setWandModel = (newGlbUrl, newWood = wand.userData.woodColor, newGlow = wand.userData.glowColor) => {
    setColors(newWood, newGlow);
    if (!newGlbUrl) return;
    wand.userData.glbUrl = newGlbUrl;
    const token = ++currentLoadToken;

    loadNormalizedWandGlb(newGlbUrl)
      .then((modelGroup) => {
        if (token !== currentLoadToken) return;
        glbHolder.clear();
        glbHolder.add(modelGroup);
        fallbackBody.visible = false;
      })
      .catch(() => {
        if (token !== currentLoadToken) return;
        fallbackBody.visible = true;
      });
  };

  wand.userData = {
    woodColor,
    glowColor,
    glbUrl,
    orb,
    orbHalo,
    handleMat,
    tipMat,
    orbMat,
    haloMat,
    setColors,
    setWandModel,
    isHovered: false
  };

  if (glbUrl) {
    setWandModel(glbUrl, woodColor, glowColor);
  }

  return wand;
}

/**
 * Constrói uma Estante de Livros Gótica de Madeira cheia de livros coloridos, globo astrológico, caveira/ampulheta e velas no topo (Fotos 1, 3 e 4)
 */
function createBookcaseWithProps(woodMat, darkWoodMat, bookMat, brassMat, candleMat, flameMat, side, index) {
  const group = new THREE.Group();
  const width = 1.45;
  const height = 2.65;
  const depth = 0.42;

  // Estrutura externa da estante
  const backPanel = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.04), darkWoodMat);
  backPanel.position.set(0, height / 2, -depth / 2 + 0.02);
  group.add(backPanel);

  const leftSide = new THREE.Mesh(new THREE.BoxGeometry(0.06, height, depth), woodMat);
  leftSide.position.set(-width / 2 + 0.03, height / 2, 0);
  const rightSide = new THREE.Mesh(new THREE.BoxGeometry(0.06, height, depth), woodMat);
  rightSide.position.set(width / 2 - 0.03, height / 2, 0);
  const topCrown = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, 0.09, depth + 0.06), woodMat);
  topCrown.position.set(0, height + 0.02, 0);
  group.add(leftSide, rightSide, topCrown);

  // 5 Prateleiras horizontais
  const shelfHeights = [0.08, 0.60, 1.12, 1.64, 2.14];
  const bookPalette = [0x934137, 0x4b6258, 0x465b73, 0x846142, 0x64434a, 0x916a39];
  const volumes = [];

  shelfHeights.forEach((sy, sIdx) => {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(width - 0.06, 0.04, depth - 0.02), woodMat);
    shelf.position.set(0, sy, 0);
    group.add(shelf);

    // No 2º e 3º níveis da estante frontal, deixa espaço para objetos especiais (Globo Astrológico, Caveira, Ampulheta, Cálice)
    const isPropShelf = index === 0 && (sIdx === 1 || sIdx === 2);
    if (isPropShelf) {
      if (side === 'left' && sIdx === 2) {
        // Esfera armilar / globo astrológico de latão (Foto 1 esquerda)
        const armillary = new THREE.Group();
        const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.008, 8, 24), brassMat);
        const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.007, 8, 24), brassMat);
        r2.rotation.y = Math.PI / 2;
        const r3 = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.006, 8, 24), brassMat);
        r3.rotation.x = Math.PI / 3;
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), brassMat);
        const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.06, 0.08, 12), brassMat);
        stand.position.y = -0.15;
        armillary.add(r1, r2, r3, core, stand);
        armillary.position.set(0, sy + 0.22, 0.02);
        group.add(armillary);
      } else if (side === 'left' && sIdx === 1) {
        // Caveira de estudos na prateleira esquerda (Foto 1 e 4)
        const skullMat = new THREE.MeshStandardMaterial({ color: 0xdfd3bd, roughness: 0.7 });
        const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 14), skullMat);
        cranium.position.set(0.18, sy + 0.11, 0.04);
        const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.09), skullMat);
        jaw.position.set(0.18, sy + 0.05, 0.06);
        group.add(cranium, jaw);
      } else if (side === 'right' && sIdx === 2) {
        // Ampulheta dourada na estante direita (Foto 1)
        const hgGroup = new THREE.Group();
        const glassMat = new THREE.MeshStandardMaterial({ color: 0xe8dec8, transparent: true, opacity: 0.75 });
        const topBulb = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.11, 12), glassMat);
        topBulb.rotation.x = Math.PI;
        topBulb.position.y = 0.06;
        const botBulb = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.11, 12), glassMat);
        botBulb.position.y = -0.06;
        const topCap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.015, 12), brassMat);
        topCap.position.y = 0.12;
        const botCap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.015, 12), brassMat);
        botCap.position.y = -0.12;
        hgGroup.add(topBulb, botBulb, topCap, botCap);
        hgGroup.position.set(0, sy + 0.16, 0.02);
        group.add(hgGroup);
      } else if (side === 'right' && sIdx === 1) {
        // Urna/cálice metálico e globo (Foto 1 direita)
        const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.22, 12), brassMat);
        urn.position.set(-0.15, sy + 0.13, 0.02);
        group.add(urn);
      }
      return;
    }

    // Fileira de livros encadernados na prateleira
    let curX = -width / 2 + 0.10;
    let bIdx = 0;
    while (curX < width / 2 - 0.12) {
      const bw = 0.045 + ((bIdx * 7 + sIdx * 3) % 4) * 0.012;
      const bh = 0.30 + ((bIdx * 5 + sIdx) % 4) * 0.03;
      const bd = 0.24;
      const bColor = bookPalette[(bIdx + sIdx * 2 + index) % bookPalette.length];
      volumes.push({ x: curX + bw / 2, y: sy + 0.02 + bh / 2, bw, bh, bd, bColor });
      curX += bw + 0.008;
      bIdx++;
    }
  });

  const books = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bookMat, volumes.length);
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  volumes.forEach(({ x, y, bw, bh, bd, bColor }, i) => {
    transform.position.set(x, y, 0.02);
    transform.scale.set(bw, bh, bd);
    transform.updateMatrix();
    books.setMatrixAt(i, transform.matrix);
    books.setColorAt(i, tint.setHex(bColor));
  });
  group.add(books);

  // Duas velas acesas no topo da estante (como nas fotos 1 e 4)
  [-0.12, 0.12].forEach((cx, cIdx) => {
    const h = cIdx === 0 ? 0.18 : 0.14;
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, h, 8), candleMat);
    candle.position.set(cx, height + 0.06 + h / 2, 0.08);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), flameMat);
    flame.scale.set(0.8, 1.6, 0.8);
    flame.position.set(cx, height + 0.06 + h + 0.02, 0.08);
    group.add(candle, flame);
  });

  return batchStaticMeshes(group);
}

function createBookSpineMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const binding = ctx.createLinearGradient(0, 0, 64, 0);
  binding.addColorStop(0, '#635b50');
  binding.addColorStop(0.20, '#c7bba3');
  binding.addColorStop(0.65, '#e1d5bd');
  binding.addColorStop(1, '#867868');
  ctx.fillStyle = binding;
  ctx.fillRect(0, 0, 64, 128);
  for (const y of [8, 17, 46, 88, 111, 119]) {
    ctx.fillStyle = '#7b6954';
    ctx.fillRect(0, y, 64, 4);
    ctx.fillStyle = '#f6df9e';
    ctx.fillRect(6, y + 1, 52, 1.5);
  }
  ctx.strokeStyle = '#ebe0c1';
  ctx.strokeRect(16, 25, 32, 13);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.8 });
}

/**
 * Constrói uma Carteira Dupla de Estudante com 2 Cadeiras, 2 Livros e 2 Tinteiros com Penas (Fotos 1, 3 e 4)
 */
function createStudentDoubleDeskWithChairs(woodMat, darkWoodMat, chairFaceSign) {
  const group = new THREE.Group();
  const deskW = 1.24;
  const deskH = 0.74;
  const deskD = 0.68;

  // Tampo e saia da mesa
  const top = new THREE.Mesh(new RoundedBoxGeometry(deskW, 0.05, deskD, 1, 0.018), woodMat);
  top.position.y = deskH;
  const apron = new THREE.Mesh(new THREE.BoxGeometry(deskW - 0.10, 0.14, deskD - 0.10), darkWoodMat);
  apron.position.y = deskH - 0.09;
  const rim = new THREE.Mesh(new THREE.BoxGeometry(deskW - 0.03, 0.027, deskD - 0.03), darkWoodMat);
  rim.position.y = deskH - 0.031;
  const stretcher = new THREE.Mesh(new THREE.BoxGeometry(deskW - 0.16, 0.06, 0.065), darkWoodMat);
  stretcher.position.y = 0.24;
  group.add(top, apron, rim, stretcher);

  // 4 Pernas robustas com travessas laterais
  [
    [-deskW / 2 + 0.07, -deskD / 2 + 0.07],
    [deskW / 2 - 0.07, -deskD / 2 + 0.07],
    [-deskW / 2 + 0.07, deskD / 2 - 0.07],
    [deskW / 2 - 0.07, deskD / 2 - 0.07]
  ].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, deskH, 0.07), woodMat);
    leg.position.set(lx, deskH / 2, lz);
    group.add(leg);
  });

  // 2 Livros sobre a carteira (um vermelho carmesim e um verde/marrom escuro como nas fotos 1 e 3)
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xc4ad83, roughness: 0.95 });
  const foilMat = new THREE.MeshStandardMaterial({ color: 0xaa8447, roughness: 0.60 });
  const pageGeo = new THREE.BoxGeometry(0.222, 0.033, 0.268);
  const coverGeo = new THREE.BoxGeometry(0.24, 0.007, 0.284);
  for (const [x, z, yaw, coverColor] of [[-0.28, 0.02, 0.18, 0x77242a], [0.24, -0.02, -0.15, 0x374439]]) {
    const book = new THREE.Group();
    const coverMat = new THREE.MeshStandardMaterial({ color: coverColor, roughness: 0.70 });
    const pages = new THREE.Mesh(pageGeo, paperMat);
    const topCover = new THREE.Mesh(coverGeo, coverMat);
    topCover.position.y = 0.019;
    const bottomCover = topCover.clone();
    bottomCover.position.y = -0.019;
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.041, 0.284), coverMat);
    spine.position.x = -0.113;
    const stamp = new THREE.Mesh(new THREE.RingGeometry(0.024, 0.028, 4).rotateX(-Math.PI / 2), foilMat);
    stamp.position.y = 0.023;
    book.add(pages, topCover, bottomCover, spine, stamp);
    book.position.set(x, deskH + 0.047, z);
    book.rotation.y = yaw;
    group.add(book);
  }

  // 2 Tinteiros com penas escuras nas extremidades da mesa
  const inkMat = new THREE.MeshStandardMaterial({ color: 0x151518, roughness: 0.3, metalness: 0.5 });
  const quillMat = new THREE.MeshStandardMaterial({ color: 0x1e1b18, roughness: 0.6, side: THREE.DoubleSide });
  [-0.48, 0.48].forEach((ix) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.032, 0.05, 10), inkMat);
    pot.position.set(ix, deskH + 0.05, -0.14 * chairFaceSign);
    const quill = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.22, 5), quillMat);
    quill.position.set(ix + 0.02, deskH + 0.15, -0.14 * chairFaceSign);
    quill.rotation.z = -0.22;
    group.add(pot, quill);
  });

  // 2 Cadeiras de madeira atrás da carteira
  [-0.31, 0.31].forEach((cx) => {
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.40), woodMat);
    seat.position.y = 0.44;
    chair.add(seat);
    for (const height of [0.59, 0.84]) {
      const backRail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.049, 0.047), woodMat);
      backRail.position.set(0, height, 0.18 * chairFaceSign);
      chair.add(backRail);
    }
    const spindleGeo = new THREE.BoxGeometry(0.034, 0.29, 0.036);
    for (const x of [-0.18, -0.09, 0, 0.09, 0.18]) {
      const spindle = new THREE.Mesh(spindleGeo, woodMat);
      spindle.position.set(x, 0.71, 0.18 * chairFaceSign);
      chair.add(spindle);
    }

    [
      [-0.17, -0.16],
      [0.17, -0.16],
      [-0.17, 0.16],
      [0.17, 0.16]
    ].forEach(([clx, clz]) => {
      const cLeg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.44, 0.04), darkWoodMat);
      cLeg.position.set(clx, 0.22, clz);
      chair.add(cLeg);
    });

    chair.position.set(cx, 0, 0.42 * chairFaceSign);
    group.add(chair);
  });

  return batchStaticMeshes(group);
}

/**
 * Constrói uma Estátua de Leão de Pedra Sentado sobre Pedestal Clássico (Fotos 1 e 4)
 */
function createLionStatueOnPedestal(stoneMat) {
  const group = new THREE.Group();

  // Pedestal de pedra com base e cornija
  const pedBase = new THREE.Mesh(new RoundedBoxGeometry(0.76, 0.14, 0.76, 1, 0.026), stoneMat);
  pedBase.position.y = 0.07;
  const pedBody = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.78, 0.64), stoneMat);
  pedBody.position.y = 0.53;
  const pedCap = new THREE.Mesh(new RoundedBoxGeometry(0.74, 0.12, 0.74, 1, 0.018), stoneMat);
  pedCap.position.y = 0.98;
  group.add(pedBase, pedBody, pedCap);

  // Leão esculpido sentado sobre o pedestal
  const lionMat = stoneMat.clone();
  lionMat.color.setHex(0xc9b69d);
  const recessMat = lionMat.clone();
  recessMat.color.setHex(0x8c7258);
  const carveGeo = new THREE.SphereGeometry(1, 12, 9);
  const addCarving = (x, y, z, width, height, depth, material = lionMat) => {
    const piece = new THREE.Mesh(carveGeo, material);
    piece.position.set(x, y, z);
    piece.scale.set(width, height, depth);
    group.add(piece);
  };
  addCarving(0, 1.32, -0.05, 0.20, 0.28, 0.25);
  addCarving(0, 1.5, 0.05, 0.16, 0.32, 0.163);
  addCarving(0, 1.74, 0.095, 0.19, 0.236, 0.163);
  addCarving(0, 1.80, 0.207, 0.125, 0.136, 0.105);
  addCarving(0, 1.726, 0.28, 0.076, 0.035, 0.065);
  addCarving(0, 1.781, 0.339, 0.052, 0.023, 0.03, recessMat);
  for (const side of [-1, 1]) {
    addCarving(side * 0.126, 1.27, -0.07, 0.099, 0.20, 0.20);
    addCarving(side * 0.10, 1.31, 0.156, 0.053, 0.263, 0.058);
    addCarving(side * 0.106, 1.082, 0.207, 0.067, 0.045, 0.106);
    addCarving(side * 0.135, 1.899, 0.177, 0.048, 0.054, 0.031);
    addCarving(side * 0.07, 1.824, 0.291, 0.030, 0.014, 0.019, recessMat);
    addCarving(side * 0.038, 1.758, 0.308, 0.049, 0.035, 0.050);
  }
  const mane = new THREE.InstancedMesh(carveGeo, lionMat, 12);
  const tuft = new THREE.Object3D();
  tuft.scale.set(0.059, 0.087, 0.061);
  for (let i = 0; i < mane.count; i++) {
    const angle = i * Math.PI / 6;
    tuft.position.set(Math.cos(angle) * 0.136, 1.74 + Math.sin(angle) * 0.150, 0.15);
    tuft.rotation.z = angle - Math.PI / 2;
    tuft.updateMatrix();
    mane.setMatrixAt(i, tuft.matrix);
  }
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.13, 1.14, -0.23),
    new THREE.Vector3(-0.26, 1.08, -0.09),
    new THREE.Vector3(-0.27, 1.085, 0.12),
    new THREE.Vector3(-0.20, 1.09, 0.23),
    new THREE.Vector3(-0.11, 1.115, 0.26)
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 18, 0.026, 6), lionMat);
  group.add(mane, tail);
  return batchStaticMeshes(group);
}

/**
 * Constrói um Candelabro Alto de Chão em Ferro Forjado com 5 Velas Acesas (Fotos 1 e 4)
 */
function createTallIronCandelabra(ironMat, candleMat, flameMat) {
  const group = new THREE.Group();

  // Base em tripé de ferro forjado
  for (let i = 0; i < 3; i++) {
    const ang = (i * Math.PI * 2) / 3;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.28), ironMat);
    foot.position.set(Math.sin(ang) * 0.14, 0.14, Math.cos(ang) * 0.14);
    foot.rotation.y = ang;
    group.add(foot);
  }

  // Haste vertical esbelta
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.032, 1.88, 12), ironMat);
  pole.position.y = 0.96;
  group.add(pole);

  // Coroa superior de ferro
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.015, 8, 20), ironMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.88;
  group.add(ring);

  // 5 Velas acesas na coroa do candelabro
  const offsets = [
    [0, 0, 0.04],
    [-0.17, 0, 0],
    [0.17, 0, 0],
    [0, -0.17, 0],
    [0, 0.17, 0]
  ];
  offsets.forEach(([ox, oz, extraY]) => {
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.20, 8), candleMat);
    wax.position.set(ox, 1.98 + extraY, oz);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), flameMat);
    flame.scale.set(0.8, 1.65, 0.8);
    flame.position.set(ox, 2.10 + extraY, oz);
    group.add(wax, flame);
  });

  return batchStaticMeshes(group);
}

/**
 * Constrói o Lustre Circular Medieval de Ferro Forjado no Teto com 8 Velas e Correntes (Fotos 2 e 4)
 */
function createCeilingRingChandelier(ironMat, candleMat, flameMat, ceilingY, chandelierY) {
  const group = new THREE.Group();

  // Anel grande de ferro forjado
  const radius = 0.78;
  const ironRing = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.036, 12, 36), ironMat);
  ironRing.rotation.x = Math.PI / 2;
  ironRing.position.y = chandelierY;
  group.add(ironRing);

  const crownY = chandelierY + (ceilingY - chandelierY) * 0.67;
  const junction = new THREE.Vector3(0, crownY, 0);
  const chains = [[junction, new THREE.Vector3(0, ceilingY, 0)]];
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI * 2) / 8;
    const cx = Math.cos(ang) * radius;
    const cz = Math.sin(ang) * radius;
    if (i % 2 === 0) {
      chains.push([new THREE.Vector3(cx, chandelierY + 0.02, cz), junction]);
    }

    // Suporte fleur-de-lis e vela
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.025, 0.06, 8), ironMat);
    holder.position.set(cx, chandelierY + 0.03, cz);

    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 8), candleMat);
    wax.position.set(cx, chandelierY + 0.16, cz);

    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), flameMat);
    flame.scale.set(0.63, 1.48, 0.63);
    flame.position.set(cx, chandelierY + 0.31, cz);

    group.add(holder, wax, flame);
  }

  const linksPerChain = chains.map(([start, end]) => Math.ceil(start.distanceTo(end) / 0.052));
  const links = new THREE.InstancedMesh(
    new THREE.TorusGeometry(0.026, 0.006, 5, 10),
    ironMat,
    linksPerChain.reduce((total, n) => total + n, 0)
  );
  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const transform = new THREE.Object3D();
  transform.scale.y = 1.33;
  let index = 0;
  chains.forEach(([start, end], chainIndex) => {
    const count = linksPerChain[chainIndex];
    direction.subVectors(end, start).normalize();
    for (let i = 0; i < count; i++) {
      transform.position.lerpVectors(start, end, (i + 0.5) / count);
      transform.quaternion.setFromUnitVectors(up, direction);
      transform.rotateY(i % 2 === 0 ? 0 : Math.PI / 2);
      transform.updateMatrix();
      links.setMatrixAt(index++, transform.matrix);
    }
  });
  group.add(links);
  return batchStaticMeshes(group);
}

/**
 * Constrói a Sala de Escola de Bruxos 3D completa baseada nas 4 imagens anexadas:
 * - Salão gótico amplo (6,8m de largura x 8,6m de comprimento x 5,2m de altura)
 * - O usuário só pode caminhar no Tapete Vermelho central (1,5m de largura x 4,0m de comprimento: X de -0.75 a +0.75, Z de -2.0 a +2.0)
 * - Usuário inicia sentado no meio da sala (X = 0, Z = 0) em uma cadeira que desaparece 10s após o movimento
 * - Parte de trás da sala (Z < -2.0m): Mesa gótica entalhada com as 3 Varinhas, Portas Duplas em Arco, Leões de Pedra, Candelabros e Estandartes, com a Letícia ao lado da mesa (fora da área acessível)
 * - Parte da frente da sala (Z > +2.0m): Plataforma com degraus, Mesa da Professora com a Grande Pena Branca, Poções, Livros, Cadeira da Professora, Quadro-Negro e Estante, com o Luigi ao lado da mesa (fora da área acessível)
 */
export function createWizardClassroom(scene) {
  const roomGroup = new THREE.Group();
  scene.add(roomGroup);

  // Dimensões do Salão 3D Maior e do Tapete Vermelho Central Caminhável
  const walkableWidth = 1.5;   // X: -0.75m a +0.75m (Tapete Vermelho)
  const walkableLength = 4.0;  // Z: -2.00m a +2.00m (Tapete Vermelho)
  const visualWidth = 6.8;     // X: -3.40m a +3.40m (Salão completo com carteiras e estantes nas laterais)
  const roomLength = 8.6;      // Z: -4.30m a +4.30m (Fundo com Portas Duplas até Frente com Plataforma da Professora)
  const roomHeight = 5.2;      // Altura até o teto abobadado com lustre circular
  const vaultSpring = 3.44;

  const textureLoader = new THREE.TextureLoader();
  const stoneGrainCanvas = document.createElement('canvas');
  stoneGrainCanvas.width = stoneGrainCanvas.height = 256;
  const stoneGrainCtx = stoneGrainCanvas.getContext('2d');
  stoneGrainCtx.fillStyle = '#c0ac8e';
  stoneGrainCtx.fillRect(0, 0, 256, 256);
  const stoneGrainTex = new THREE.CanvasTexture(stoneGrainCanvas);
  stoneGrainTex.colorSpace = THREE.SRGBColorSpace;
  const wallStoneTex = loadClassroomTexture(textureLoader, 'limestone.webp', 4.2, 2.55, ({ image }) => {
    // Reutiliza a superfície de um único bloco nas molduras e pedras esculpidas.
    const size = image.width;
    stoneGrainCtx.drawImage(image, size * 0.026, size * 0.019, size * 0.188, size * 0.11, 0, 0, 256, 256);
    stoneGrainTex.needsUpdate = true;
  });
  const endStoneTex = wallStoneTex.clone();
  endStoneTex.repeat.x *= visualWidth / roomLength;
  const vaultStoneTex = endStoneTex.clone();
  vaultStoneTex.repeat.y = endStoneTex.repeat.x;
  const floorStoneTex = loadClassroomTexture(textureLoader, 'flagstones.webp', 3.75, 4.7);
  const woodTex = loadClassroomTexture(textureLoader, 'walnut.webp');
  const doorWoodTex = woodTex.clone();
  doorWoodTex.rotation = Math.PI / 2;
  const carpetTex = createRoyalRedCarpetTexture();
  const windowTex = createGothicWindowTexture();
  const blackboardTex = createBlackboardTexture();

  const wallMat = new THREE.MeshStandardMaterial({
    map: wallStoneTex,
    bumpMap: wallStoneTex,
    bumpScale: 0.022,
    roughness: 0.93
  });
  const endWallMat = wallMat.clone();
  endWallMat.map = endWallMat.bumpMap = endStoneTex;
  const vaultMat = wallMat.clone();
  vaultMat.map = vaultMat.bumpMap = vaultStoneTex;
  const stoneDetailMat = new THREE.MeshStandardMaterial({
    color: 0xd7c9ba,
    map: stoneGrainTex,
    roughness: 0.92
  });
  const traceryMat = stoneDetailMat.clone();
  traceryMat.color.setHex(0xe0c8a4);
  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.46
  });
  const darkWoodMat = woodMat.clone();
  darkWoodMat.color.setHex(0xc6aa96);
  const bookSpineMat = createBookSpineMaterial();
  const doorWoodMat = darkWoodMat.clone();
  doorWoodMat.map = doorWoodTex;
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x323233,
    roughness: 0.62,
    metalness: 0.28
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xcda04f,
    roughness: 0.33,
    metalness: 0.48
  });
  const candleMat = new THREE.MeshStandardMaterial({
    color: 0xf7dfa8,
    emissive: 0xc47527,
    emissiveIntensity: 0.19,
    roughness: 0.62
  });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffdf9d });
  const softEdgeTex = createSoftEdgeTexture();
  const softPlane = new THREE.PlaneGeometry(1, 1);
  const wallGlowMat = new THREE.MeshBasicMaterial({
    map: softEdgeTex, color: 0xffa34b, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.43
  });
  const floorShadowMat = new THREE.MeshBasicMaterial({
    map: softEdgeTex, color: 0x160c08, transparent: true, depthWrite: false, opacity: 0.65
  });
  const flameGlowMat = new THREE.SpriteMaterial({
    map: softEdgeTex, color: 0xffa83b, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.61
  });

  // ============================================================================
  // 1. PISO DE LAJES DE PEDRA E TAPETE VERMELHO CENTRAL (ÁREA CAMINHÁVEL)
  // ============================================================================
  const floorGeo = new THREE.PlaneGeometry(visualWidth, roomLength);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorStoneTex,
    bumpMap: floorStoneTex,
    bumpScale: 0.016,
    roughness: 0.92
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  roomGroup.add(floor);

  // Tapete Vermelho Real com borda dupla dourada e 3 Leões Dourados (X: -0.75..+0.75, Z: -2.0..+2.0)
  const carpetGroup = new THREE.Group();
  const carpetGeo = new THREE.PlaneGeometry(walkableWidth, walkableLength);
  carpetGeo.rotateX(-Math.PI / 2);
  const carpetMat = new THREE.MeshStandardMaterial({
    map: carpetTex,
    roughness: 0.88
  });
  const carpet = new THREE.Mesh(carpetGeo, carpetMat);
  carpet.position.y = 0.006;
  carpetGroup.add(carpet);

  // Selos discretos nos 4 cantos do tapete (20cm x 20cm) correspondentes aos 4 QR Codes físicos de chão
  const qrCornerMeshes = [];
  FLOOR_QR_CORNERS.forEach((corner) => {
    const cornerGroup = new THREE.Group();
    cornerGroup.position.set(corner.roomX, 0.009, corner.roomZ);

    const qrTex = new THREE.CanvasTexture(generateCornerQrCanvas(corner.index, 256));
    qrTex.colorSpace = THREE.SRGBColorSpace;

    const sealPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(QR_PHYSICAL_SIZE_METERS, QR_PHYSICAL_SIZE_METERS).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: qrTex,
        color: 0xd4af37,
        transparent: true,
        opacity: 0.20
      })
    );

    const glowRing = new THREE.Mesh(
      new THREE.RingGeometry(QR_PHYSICAL_SIZE_METERS * 0.52, QR_PHYSICAL_SIZE_METERS * 0.62, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xf5d061,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.22
      })
    );
    glowRing.position.y = 0.001;

    cornerGroup.add(sealPlane, glowRing);
    cornerGroup.userData = { sealPlane, glowRing, detected: false };
    carpetGroup.add(cornerGroup);
    qrCornerMeshes.push(cornerGroup);
  });

  roomGroup.add(carpetGroup);

  // ============================================================================
  // 2. PAREDES DE PEDRA, PILARES, JANELAS GÓTICAS E TETO ABOBADADO COM LUSTRE
  // ============================================================================
  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(roomLength, roomHeight), wallMat);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-visualWidth / 2, roomHeight / 2, 0);
  roomGroup.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(roomLength, roomHeight), wallMat);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(visualWidth / 2, roomHeight / 2, 0);
  roomGroup.add(rightWall);

  const endWallGeo = new THREE.PlaneGeometry(visualWidth, roomHeight);
  const backWall = new THREE.Mesh(endWallGeo, endWallMat);
  backWall.position.set(0, roomHeight / 2, -roomLength / 2);
  const frontWall = new THREE.Mesh(endWallGeo, endWallMat);
  frontWall.rotation.y = Math.PI;
  frontWall.position.set(0, roomHeight / 2, roomLength / 2);
  roomGroup.add(backWall, frontWall);
  roomGroup.add(createVaultedCeiling(
    visualWidth, roomLength, vaultSpring, roomHeight, vaultMat, stoneDetailMat, darkWoodMat
  ));

  // Os halos fixos na alvenaria dão luz localizada às arandelas sem luzes extras por vela.
  const addWallGlow = (x, y, z, yaw, width, height) => {
    const glow = new THREE.Mesh(softPlane, wallGlowMat);
    glow.position.set(x, y, z);
    glow.rotation.y = yaw;
    glow.scale.set(width, height, 1);
    roomGroup.add(glow);
  };
  const addFloorShadow = (x, z, width, length, y = 0.003) => {
    const shadow = new THREE.Mesh(softPlane, floorShadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, y, z);
    shadow.scale.set(width, length, 1);
    roomGroup.add(shadow);
  };
  const addFlameGlow = (parent, x, y, z, width, height) => {
    const glow = new THREE.Sprite(flameGlowMat);
    glow.position.set(x, y, z);
    glow.scale.set(width, height, 1);
    parent.add(glow);
  };

  const windowMat = new THREE.MeshBasicMaterial({ map: windowTex });
  const lowerWindow = createGothicWindow(1.09, 1.88, windowMat, stoneDetailMat, traceryMat);
  const upperWindow = createGothicWindow(1.18, 1.47, windowMat, stoneDetailMat, traceryMat);
  const bayLength = roomLength / 3;
  const plinthGeo = new THREE.BoxGeometry(0.15, 0.16, roomLength);
  const pillarGeo = new THREE.BoxGeometry(0.23, vaultSpring, 0.34);
  const corbelGeo = new THREE.BoxGeometry(0.39, 0.14, 0.46);
  const bracketGeo = new THREE.BoxGeometry(0.21, 0.045, 0.23);
  const cupGeo = new THREE.CylinderGeometry(0.042, 0.023, 0.036, 10);
  const waxGeo = new THREE.CylinderGeometry(0.014, 0.017, 0.15, 8);
  const wickFlameGeo = new THREE.SphereGeometry(0.018, 8, 6);
  for (const sign of [-1, 1]) {
    const xWall = sign * visualWidth / 2;
    const yaw = -sign * Math.PI / 2;
    const plinth = new THREE.Mesh(plinthGeo, stoneDetailMat);
    plinth.position.set(xWall - sign * 0.06, 0.08, 0);
    roomGroup.add(plinth);

    for (const z of [-bayLength, 0, bayLength]) {
      const lowWindow = lowerWindow.clone();
      lowWindow.position.set(xWall, 0.88, z);
      lowWindow.rotation.y = yaw;
      const highWindow = upperWindow.clone();
      highWindow.position.set(xWall, 3.23, z);
      highWindow.rotation.y = yaw;
      roomGroup.add(lowWindow, highWindow);
    }

    for (const z of [-roomLength / 2 + 0.16, -bayLength / 2, bayLength / 2, roomLength / 2 - 0.16]) {
      const pillar = new THREE.Mesh(pillarGeo, stoneDetailMat);
      pillar.position.set(xWall - sign * 0.09, vaultSpring / 2, z);
      const corbel = new THREE.Mesh(corbelGeo, stoneDetailMat);
      corbel.position.set(xWall - sign * 0.14, vaultSpring - 0.05, z);
      const neck = corbel.clone();
      neck.scale.set(0.82, 0.66, 0.85);
      neck.position.y -= 0.12;
      roomGroup.add(pillar, corbel, neck);

      const sconce = new THREE.Group();
      const bracket = new THREE.Mesh(bracketGeo, ironMat);
      bracket.position.x = -sign * 0.075;
      sconce.add(bracket);
      for (const [j, zOffset] of [-0.092, 0.092].entries()) {
        const height = j * 0.055;
        const x = -sign * 0.15;
        const cup = new THREE.Mesh(cupGeo, ironMat);
        cup.position.set(x, 0.027 + height, zOffset);
        const wax = new THREE.Mesh(waxGeo, candleMat);
        wax.position.set(x, 0.116 + height, zOffset);
        const flame = new THREE.Mesh(wickFlameGeo, flameMat);
        flame.position.set(x, 0.214 + height, zOffset);
        flame.scale.set(0.57, 1.47, 0.57);
        sconce.add(cup, wax, flame);
      }
      sconce.position.set(xWall - sign * 0.22, 2.77, z);
      addFlameGlow(sconce, -sign * 0.15, 0.24, 0, 0.36, 0.43);
      addWallGlow(xWall - sign * 0.004, 2.85, z, yaw, 2.08, 2.36);
      roomGroup.add(batchStaticMeshes(sconce));
    }
  }

  const chandelierY = 3.72;
  roomGroup.add(createCeilingRingChandelier(ironMat, candleMat, flameMat, roomHeight - 0.15, chandelierY));
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    addFlameGlow(roomGroup, 0.78 * Math.cos(angle), chandelierY + 0.31, 0.78 * Math.sin(angle), 0.33, 0.51);
  }

  // ============================================================================
  // 3. LATERAIS INACESSÍVEIS AO USUÁRIO: 4 CARTEIRAS DUPLAS + 4 ESTANTES DE LIVROS
  // ============================================================================
  const deskTemplate = createStudentDoubleDeskWithChairs(woodMat, darkWoodMat, -1);
  const deskZPositions = [-0.82, 0.74];
  deskZPositions.forEach((zDesk) => {
    [-1.78, 1.78].forEach((xDesk) => {
      // Cadeiras em Z menor (-Z) e frente da carteira voltada para a Mesa da Professora (+Z)
      const studentDesk = deskTemplate.clone();
      studentDesk.position.set(xDesk, 0, zDesk);
      roomGroup.add(studentDesk);
      addFloorShadow(xDesk, zDesk - 0.11, 1.65, 1.45);
    });
  });

  // 4 Estantes Altas de Madeira encostadas nas paredes laterais (2 de cada lado, Fotos 1, 3 e 4)
  const bookcaseZPositions = [-bayLength / 2, bayLength / 2];
  const bookcaseX = visualWidth / 2 - 0.50;
  bookcaseZPositions.forEach((zBook, idx) => {
    const leftBookcase = createBookcaseWithProps(
      woodMat,
      darkWoodMat,
      bookSpineMat,
      brassMat,
      candleMat,
      flameMat,
      'left',
      idx
    );
    leftBookcase.rotation.y = Math.PI / 2;
    leftBookcase.position.set(-bookcaseX, 0, zBook);
    roomGroup.add(leftBookcase);

    const rightBookcase = createBookcaseWithProps(
      woodMat,
      darkWoodMat,
      bookSpineMat,
      brassMat,
      candleMat,
      flameMat,
      'right',
      idx
    );
    rightBookcase.rotation.y = -Math.PI / 2;
    rightBookcase.position.set(bookcaseX, 0, zBook);
    roomGroup.add(rightBookcase);
    for (const side of [-1, 1]) {
      addFloorShadow(side * bookcaseX, zBook, 0.99, 1.83);
    }
  });

  // ============================================================================
  // 4. CADEIRA CENTRAL DO USUÁRIO (X = 0, Z = 0 — Desaparece 10s após movimento!)
  // ============================================================================
  const playerChair = new THREE.Group();
  const chairWoodMat = new THREE.MeshStandardMaterial({
    map: createPlayerChairTexture(),
    roughness: 0.62,
    metalness: 0.06,
    transparent: true
  });

  const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.05, 0.48), chairWoodMat);
  chairSeat.position.y = 0.46;
  const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.58, 0.05), chairWoodMat);
  chairBack.position.set(0, 0.76, 0.22);
  // Topo em arco gótico do encosto da cadeira (como na Foto 1)
  const chairCrest = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.14, 4), chairWoodMat);
  chairCrest.rotation.y = Math.PI / 4;
  chairCrest.scale.set(1.35, 1, 0.22);
  chairCrest.position.set(0, 1.11, 0.22);
  playerChair.add(chairSeat, chairBack, chairCrest);

  [
    [-0.21, -0.20],
    [0.21, -0.20],
    [-0.21, 0.20],
    [0.21, 0.20]
  ].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.46, 0.05), chairWoodMat);
    leg.position.set(lx, 0.23, lz);
    playerChair.add(leg);
  });

  // Inicia exatamente no MEIO do tapete vermelho!
  playerChair.position.set(0, 0, 0);
  roomGroup.add(playerChair);

  const setChairState = (visible, opacity = 1.0) => {
    playerChair.visible = visible;
    chairWoodMat.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
    const s = visible ? 0.85 + 0.15 * chairWoodMat.opacity : 0.001;
    playerChair.scale.setScalar(s);
  };

  // ============================================================================
  // 5. PARTE DE TRÁS DA SALA (Z < -2.0m): MESA DAS VARINHAS, PORTAS DUPLAS, LEÕES E ESTANDARTES
  // ============================================================================
  // Mesa Gótica Entalhada das Varinhas na ponta traseira do tapete vermelho (Fotos 1, 3 e 4)
  const wandTable = new THREE.Group();
  const wtWidth = 1.38;
  const wtHeight = 0.84;
  const wtDepth = 0.62;

  const wtTop = new THREE.Mesh(new RoundedBoxGeometry(wtWidth + 0.08, 0.06, wtDepth + 0.08, 1, 0.018), woodMat);
  wtTop.position.y = wtHeight;
  const wtBody = new THREE.Mesh(new THREE.BoxGeometry(wtWidth, wtHeight - 0.06, wtDepth), darkWoodMat);
  wtBody.position.y = (wtHeight - 0.06) / 2;
  const wtBase = new THREE.Mesh(new THREE.BoxGeometry(wtWidth + 0.06, 0.08, wtDepth + 0.06), woodMat);
  wtBase.position.y = 0.04;
  wandTable.add(wtTop, wtBody, wtBase);

  // Entalhes frontais com arcos e uma roseta central.
  [-0.46, -0.22, 0.22, 0.46].forEach((ax) => {
    const archFrame = createCarvedPanel(0.16, 0.48, woodMat, darkWoodMat);
    archFrame.position.set(ax, 0.14, wtDepth / 2);
    wandTable.add(archFrame);
  });
  const petalGeo = new THREE.TorusGeometry(0.043, 0.007, 5, 11);
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    const petal = new THREE.Mesh(petalGeo, woodMat);
    petal.position.set(Math.cos(angle) * 0.052, 0.39 + Math.sin(angle) * 0.052, wtDepth / 2 + 0.015);
    petal.rotation.z = angle;
    petal.scale.y = 0.65;
    wandTable.add(petal);
  }

  // Objetos decorativos nas laterais da mesa de trás (Foto 4: castiçais à esquerda e poções à direita)
  [-0.54, -0.44].forEach((cx, idx) => {
    const h = idx === 0 ? 0.16 : 0.12;
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.08, 10), brassMat);
    holder.position.set(cx, wtHeight + 0.07, -0.10);
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, h, 8), candleMat);
    wax.position.set(cx, wtHeight + 0.11 + h / 2, -0.10);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), flameMat);
    fl.position.set(cx, wtHeight + 0.11 + h + 0.02, -0.10);
    wandTable.add(holder, wax, fl);
  });

  const greenPotionBack = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.88 })
  );
  greenPotionBack.position.set(0.46, wtHeight + 0.08, -0.08);
  const purplePotionBack = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.045, 0.13, 12),
    new THREE.MeshStandardMaterial({ color: 0x6d28d9, roughness: 0.2, transparent: true, opacity: 0.88 })
  );
  purplePotionBack.position.set(0.58, wtHeight + 0.095, -0.06);
  wandTable.add(greenPotionBack, purplePotionBack);

  // Almofada real discreta no centro da mesa para as 3 varinhas mágicas
  const cushion = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.03, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x6e0d16, roughness: 0.85 })
  );
  cushion.position.set(0, wtHeight + 0.04, 0.06);
  wandTable.add(cushion);

  wandTable.position.set(0, 0, -2.14);
  roomGroup.add(batchStaticMeshes(wandTable));
  addFloorShadow(0, wandTable.position.z - 0.04, 1.80, 1.18);

  // As 3 Varinhas Mágicas selecionáveis sobre a mesa da parte de trás da sala
  const wandsOnTable = [];
  const wandConfigs = [
    {
      wood: 0x5c3317,
      glow: 0xffd700,
      offsetX: -0.22,
      glbUrl: '/models/varinha_1.glb',
      name: 'Varinha 1 — Fênix Dourada'
    },
    {
      wood: 0x2b1b12,
      glow: 0x60a5fa,
      offsetX: 0.0,
      glbUrl: '/models/varinha_2.glb',
      name: 'Varinha 2 — Estelar Azul'
    },
    {
      wood: 0x8b4513,
      glow: 0xf472b6,
      offsetX: 0.22,
      glbUrl: '/models/varinha_3.glb',
      name: 'Varinha 3 — Encantada Rubi'
    }
  ];

  const wandRestBaseY = wtHeight + 0.095;
  wandConfigs.forEach((cfg, idx) => {
    const wMesh = createWandMesh(cfg.wood, cfg.glow, cfg.glbUrl);
    wMesh.position.set(
      wandTable.position.x + cfg.offsetX,
      wandRestBaseY,
      wandTable.position.z + 0.16
    );
    wMesh.rotation.y = Math.PI;
    wMesh.userData.config = cfg;
    wMesh.userData.index = idx;
    wMesh.userData.baseY = wandRestBaseY;
    roomGroup.add(wMesh);
    wandsOnTable.push(wMesh);
  });

  // Portal ogival em camadas, folhas de madeira e escudo acima da moldura.
  const backDoorZ = -roomLength / 2;
  const door = createGothicDoor(stoneDetailMat, doorWoodMat, ironMat);
  door.position.z = backDoorZ;

  const shield = new THREE.Shape();
  shield.moveTo(-0.29, 0.24);
  shield.quadraticCurveTo(0, 0.31, 0.29, 0.24);
  shield.lineTo(0.26, -0.025);
  shield.quadraticCurveTo(0.22, -0.21, 0, -0.31);
  shield.quadraticCurveTo(-0.22, -0.21, -0.26, -0.025);
  shield.closePath();
  const shieldGeo = new THREE.ExtrudeGeometry(shield, {
    depth: 0.058, bevelSize: 0.016, bevelThickness: 0.013, bevelSegments: 2
  });
  const crestShield = new THREE.Mesh(shieldGeo, stoneDetailMat);
  crestShield.position.set(0, 3.74, 0.065);
  const crestCanvas = document.createElement('canvas');
  crestCanvas.width = crestCanvas.height = 256;
  drawGoldenLionCrest(crestCanvas.getContext('2d'), 128, 134, 92);
  const crestTex = new THREE.CanvasTexture(crestCanvas);
  crestTex.colorSpace = THREE.SRGBColorSpace;
  const relief = new THREE.Mesh(
    new THREE.PlaneGeometry(0.47, 0.47),
    new THREE.MeshStandardMaterial({
      map: crestTex, color: 0xe0c7ad, roughness: 0.86, alphaTest: 0.4, transparent: false
    })
  );
  relief.position.z = 0.074;
  crestShield.add(relief);
  door.add(crestShield);
  roomGroup.add(door);

  // 2 Estátuas de Leão de Pedra sobre Pedestais + 2 Candelabros Altos + 2 Estandartes Vermelhos/Dourados (Fotos 1 e 4)
  const bannerCanvas = document.createElement('canvas');
  bannerCanvas.width = 256;
  bannerCanvas.height = 512;
  const bCtx = bannerCanvas.getContext('2d');
  const velvet = bCtx.createLinearGradient(0, 0, 256, 0);
  velvet.addColorStop(0, '#580f17');
  velvet.addColorStop(0.28, '#861d29');
  velvet.addColorStop(0.51, '#700f18');
  velvet.addColorStop(0.76, '#8b1b28');
  velvet.addColorStop(1, '#570e18');
  bCtx.fillStyle = velvet;
  bCtx.fillRect(0, 0, 256, 512);
  bCtx.strokeStyle = '#e5b842';
  bCtx.lineWidth = 9;
  bCtx.strokeRect(10, 9, 236, 497);
  drawGoldenLionCrest(bCtx, 128, 240, 96);
  const bannerTex = new THREE.CanvasTexture(bannerCanvas);
  bannerTex.colorSpace = THREE.SRGBColorSpace;
  const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.8, side: THREE.DoubleSide });
  const bannerGeo = new THREE.PlaneGeometry(0.76, 1.54, 16, 8);
  const fabric = bannerGeo.getAttribute('position');
  for (let i = 0; i < fabric.count; i++) {
    const x = fabric.getX(i);
    const fold = Math.sin(x * 24) * 0.012;
    const fromTop = 0.5 - fabric.getY(i) / 1.54;
    const notch = (1 - Math.abs(x / 0.38)) * 0.24;
    fabric.setY(i, fabric.getY(i) + notch * fromTop);
    fabric.setZ(i, fold * (0.25 + fromTop * 0.75));
  }
  bannerGeo.computeVertexNormals();

  [-1, 1].forEach((sideSign) => {
    // Estátua de Leão sobre pedestal
    const lionStatue = createLionStatueOnPedestal(stoneDetailMat);
    lionStatue.position.set(sideSign * 1.62, 0, -3.72);
    lionStatue.rotation.y = -sideSign * 0.12;
    roomGroup.add(lionStatue);
    addFloorShadow(lionStatue.position.x, lionStatue.position.z, 1.12, 1.12);

    // Candelabro alto de ferro forjado ao lado da porta
    const candelabra = createTallIronCandelabra(ironMat, candleMat, flameMat);
    candelabra.position.set(sideSign * 1.12, 0, -3.48);
    roomGroup.add(candelabra);
    addFloorShadow(candelabra.position.x, candelabra.position.z, 0.72, 0.68);
    addFlameGlow(candelabra, 0, 2.10, 0, 0.55, 0.48);
    addWallGlow(sideSign * 1.23, 2.18, backDoorZ + 0.005, 0, 2.4, 2.62);

    // Estandarte Vermelho e Dourado pendurado na parede de fundo acima do leão
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(sideSign * 1.72, 3.22, backDoorZ + 0.10);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.96, 12), ironMat);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(sideSign * 1.72, 4.00, backDoorZ + 0.11);
    roomGroup.add(banner, rod);
  });

  // ============================================================================
  // 6. PARTE DA FRENTE DA SALA (Z > +2.0m): PLATAFORMA, MESA DA PROFESSORA, PENA, QUADRO-NEGRO E ESTANTE
  // ============================================================================
  // Plataforma elevada de pedra com 2 degraus (como na vista superior da Foto 3)
  const step1 = new THREE.Mesh(new THREE.BoxGeometry(visualWidth - 0.1, 0.08, 2.24), stoneDetailMat);
  step1.position.set(0, 0.04, 3.16);
  const step2 = new THREE.Mesh(new THREE.BoxGeometry(visualWidth - 0.1, 0.08, 1.96), stoneDetailMat);
  step2.position.set(0, 0.12, 3.30);
  roomGroup.add(step1, step2);

  // Mesa da Professora posicionada na frente do tapete vermelho (X = 0, Z = +2.22m, Fotos 1 e 3)
  const teacherDesk = new THREE.Group();
  const tdWidth = 1.68;
  const tdHeight = 0.80;
  const tdDepth = 0.72;

  const tdTop = new THREE.Mesh(new RoundedBoxGeometry(tdWidth + 0.08, 0.06, tdDepth + 0.08, 1, 0.018), woodMat);
  tdTop.position.y = tdHeight;
  const tdBody = new THREE.Mesh(new THREE.BoxGeometry(tdWidth, tdHeight - 0.06, tdDepth), darkWoodMat);
  tdBody.position.y = (tdHeight - 0.06) / 2;
  teacherDesk.add(tdTop, tdBody);

  // Molduras entalhadas na frente da Mesa da Professora
  [-0.52, 0, 0.52].forEach((px) => {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.03), woodMat);
    panel.position.set(px, 0.40, -tdDepth / 2 - 0.015);
    teacherDesk.add(panel);
  });

  // Objetos da Mesa da Professora (Foto 1 e Foto 3):
  // - Poção verde em suporte dourado e orbe de cristal (lado direito da visão frontal)
  const greenPotion = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 14, 14),
    new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.15, transparent: true, opacity: 0.88 })
  );
  greenPotion.position.set(0.66, tdHeight + 0.10, -0.05);
  const greenNeck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.028, 0.08, 10),
    new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.15, transparent: true, opacity: 0.88 })
  );
  greenNeck.position.set(0.66, tdHeight + 0.18, -0.05);
  const potionStand = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.04, 12), brassMat);
  potionStand.position.set(0.66, tdHeight + 0.04, -0.05);

  const crystalOrb = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xfff3d1, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 })
  );
  crystalOrb.position.set(0.46, tdHeight + 0.10, -0.08);
  const orbBase = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.05, 12), brassMat);
  orbBase.position.set(0.46, tdHeight + 0.045, -0.08);
  teacherDesk.add(greenPotion, greenNeck, potionStand, crystalOrb, orbBase);

  // - Livros de feitiços empilhados com brasão dourado e pergaminhos abertos (Foto 1)
  const bookStack1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.055, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x262936, roughness: 0.65 })
  );
  bookStack1.position.set(0.42, tdHeight + 0.055, 0.14);
  bookStack1.rotation.y = 0.22;

  const bookStack2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.05, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x4a2416, roughness: 0.7 })
  );
  bookStack2.position.set(-0.46, tdHeight + 0.05, 0.12);
  bookStack2.rotation.y = -0.28;

  const parchmentMat = new THREE.MeshStandardMaterial({ color: 0xe8d8b5, roughness: 0.85 });
  const scroll1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.008, 0.28), parchmentMat);
  scroll1.position.set(0.16, tdHeight + 0.035, 0.15);
  scroll1.rotation.y = 0.08;
  const scroll2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.008, 0.28), parchmentMat);
  scroll2.position.set(-0.16, tdHeight + 0.035, 0.15);
  scroll2.rotation.y = -0.06;
  teacherDesk.add(bookStack1, bookStack2, scroll1, scroll2);

  // - Trio de castiçais de latão com velas acesas e frasco azul (lado esquerdo da mesa, Foto 1)
  [
    [-0.58, -0.06, 0.12],
    [-0.65, -0.14, 0.18],
    [-0.72, -0.04, 0.24]
  ].forEach(([cx, cz, ch]) => {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.048, 0.10, 10), brassMat);
    stick.position.set(cx, tdHeight + 0.08, cz);
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, ch, 8), candleMat);
    wax.position.set(cx, tdHeight + 0.13 + ch / 2, cz);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), flameMat);
    fl.position.set(cx, tdHeight + 0.13 + ch + 0.02, cz);
    teacherDesk.add(stick, wax, fl);
  });

  // Tinteiro dourado junto à Grande Pena Branca
  const teacherInkwell = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, 0.07, 12), brassMat);
  teacherInkwell.position.set(-0.22, tdHeight + 0.065, -0.16);
  teacherDesk.add(teacherInkwell);

  teacherDesk.position.set(0, 0.08, 2.22);
  roomGroup.add(batchStaticMeshes(teacherDesk));
  addFloorShadow(0, 2.48, 1.96, 1.38, 0.163);

  // A GRANDE PENA DE PÁSSARO BRANCA pousada no centro-frontal da Mesa da Professora (acessível do tapete!)
  const { featherGroup, auraRing, vaneMat } = createLargeWhiteFeather();
  const featherRestPos = new THREE.Vector3(0, 0.92, 1.98);
  featherGroup.position.copy(featherRestPos);
  roomGroup.add(featherGroup);

  // Cadeira Alta da Professora atrás da Mesa da Professora (Fotos 1 e 3)
  const teacherChair = new THREE.Group();
  const tcSeat = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.06, 0.54), woodMat);
  tcSeat.position.y = 0.48;
  const tcBack = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.95, 0.06), darkWoodMat);
  tcBack.position.set(0, 0.96, 0.24);
  const tcCrown = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.20, 4), woodMat);
  tcCrown.rotation.y = Math.PI / 4;
  tcCrown.scale.set(1.3, 1, 0.22);
  tcCrown.position.set(0, 1.52, 0.24);
  teacherChair.add(tcSeat, tcBack, tcCrown);
  teacherChair.position.set(0, 0.16, 2.86);
  roomGroup.add(teacherChair);

  // Janela Gótica atrás da Cadeira da Professora na parede frontal (Foto 3)
  const frontWindow = createGothicWindow(1.62, 2.28, windowMat, stoneDetailMat, traceryMat);
  frontWindow.rotation.y = Math.PI;
  frontWindow.position.set(0, 1.60, roomLength / 2);
  roomGroup.add(frontWindow);

  // Quadro-Negro de Madeira com fórmulas arcanas na plataforma frontal (Foto 3)
  const blackboardGroup = new THREE.Group();
  const bbBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(1.55, 1.05),
    new THREE.MeshBasicMaterial({ map: blackboardTex, side: THREE.DoubleSide })
  );
  bbBoard.position.set(0, 1.42, 0.03);
  const bbBacking = new THREE.Mesh(new THREE.BoxGeometry(1.65, 1.15, 0.05), darkWoodMat);
  bbBacking.position.set(0, 1.42, 0);
  const bbLegL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.10, 0.08), woodMat);
  bbLegL.position.set(-0.82, 1.05, 0);
  const bbLegR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.10, 0.08), woodMat);
  bbLegR.position.set(0.82, 1.05, 0);
  blackboardGroup.add(bbBoard, bbBacking, bbLegL, bbLegR);
  blackboardGroup.position.set(-1.95, 0.16, 3.18);
  blackboardGroup.rotation.y = Math.PI - 0.32;
  roomGroup.add(blackboardGroup);

  // Estante da Professora e Barril de Madeira no canto oposto da plataforma frontal (Foto 3)
  const frontBookcase = createBookcaseWithProps(
    woodMat,
    darkWoodMat,
    bookSpineMat,
    brassMat,
    candleMat,
    flameMat,
    'right',
    2
  );
  frontBookcase.position.set(1.92, 0.16, 3.68);
  frontBookcase.rotation.y = Math.PI + 0.22;
  roomGroup.add(frontBookcase);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.20, 0.56, 14), darkWoodMat);
  barrel.position.set(2.82, 0.44, 3.75);
  roomGroup.add(barrel);

  // ============================================================================
  // 7. MARCADORES LUMINOSOS NO TAPETE E ILUMINAÇÃO QUENTE DE CASTELO
  // ============================================================================
  const pathMarkers = [];
  for (let i = 0; i < 7; i++) {
    const z = 1.50 - i * 0.50;
    const markerGeo = new THREE.RingGeometry(0.08, 0.12, 24);
    markerGeo.rotateX(-Math.PI / 2);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xf5d061,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(0, 0.014, z);
    roomGroup.add(marker);
    pathMarkers.push(marker);
  }

  // Velas mágicas sutis no alto para manter o brilho encantado
  const candles = [];
  const floatCandleGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.20, 8);
  const floatFlameGeo = new THREE.SphereGeometry(0.022, 8, 8);
  for (let i = 0; i < 6; i++) {
    const cGroup = new THREE.Group();
    const wax = new THREE.Mesh(floatCandleGeo, candleMat);
    const flame = new THREE.Mesh(floatFlameGeo, flameMat);
    flame.position.y = 0.125;
    flame.scale.set(0.8, 1.6, 0.8);
    cGroup.add(wax, flame);

    const cx = (i % 2 === 0 ? -1 : 1) * (2.08 + (i % 3) * 0.08);
    const cy = 2.67 + (i % 3) * 0.20;
    const cz = -2.7 + Math.floor(i / 2) * 2.7;
    cGroup.position.set(cx, cy, cz);
    cGroup.userData = { baseY: cy, phase: i * 0.7 };
    roomGroup.add(cGroup);
    candles.push(cGroup);
  }

  // Iluminação quente de velas do salão gótico
  const ambientLight = new THREE.HemisphereLight(0xffeed8, 0x584130, 0.88);
  roomGroup.add(ambientLight);

  const mainCandleLight = new THREE.PointLight(0xffc389, 16, 10);
  mainCandleLight.position.set(0, 3.68, 0);
  roomGroup.add(mainCandleLight);

  const backLight = new THREE.PointLight(0xffc18a, 11, 7.5);
  backLight.position.set(0, 2.82, -3.06);
  roomGroup.add(backLight);

  const frontLight = new THREE.PointLight(0xffd19f, 10, 7.5);
  frontLight.position.set(0, 2.66, 2.75);
  roomGroup.add(frontLight);

  const setRoomBrightness = (factor) => {
    const f = THREE.MathUtils.clamp(factor, 0, 1);
    ambientLight.intensity = 0.88 * f;
    mainCandleLight.intensity = 16 * f;
    backLight.intensity = 11 * f;
    frontLight.intensity = 10 * f;
    wallGlowMat.opacity = 0.43 * f;
    flameGlowMat.opacity = 0.61 * f;
    candles.forEach((c) => {
      c.visible = f > 0.05;
    });
  };

  return {
    roomGroup,
    playerChair,
    setChairState,
    teacherDesk,
    wandTable,
    wandsOnTable,
    featherGroup,
    featherRestPos,
    featherAura: auraRing,
    featherMat: vaneMat,
    pathMarkers,
    candles,
    qrCornerMeshes,
    setRoomBrightness,
    setQrCornerStates(detectedFlags = [false, false, false, false]) {
      qrCornerMeshes.forEach((cg, idx) => {
        const isDetected = Boolean(detectedFlags[idx]);
        cg.userData.detected = isDetected;
        cg.userData.sealPlane.material.color.setHex(isDetected ? 0xa7f3d0 : 0xd4af37);
        cg.userData.sealPlane.material.opacity = isDetected ? 0.65 : 0.20;
        cg.userData.glowRing.material.color.setHex(isDetected ? 0x4ade80 : 0xf5d061);
        cg.userData.glowRing.material.opacity = isDetected ? 0.85 : 0.22;
      });
    },
    update(elapsed, activePathDirection = 0) {
      // Anima velas flutuantes
      candles.forEach((c) => {
        c.position.y = c.userData.baseY + Math.sin(elapsed * 1.8 + c.userData.phase) * 0.04;
      });

      // Anima varinhas disponíveis na mesa traseira (destaca a varinha apontada pelo controle)
      wandsOnTable.forEach((w, idx) => {
        if (w.visible) {
          const hovered = Boolean(w.userData.isHovered);
          const baseY = w.userData.baseY || 0.935;
          const targetBaseY = hovered ? baseY + 0.055 : baseY;
          const bob = Math.sin(elapsed * (hovered ? 4.5 : 2.8) + idx) * (hovered ? 0.018 : 0.02);
          w.position.y = THREE.MathUtils.lerp(w.position.y, targetBaseY + bob, 0.25);

          const targetScale = hovered ? 1.18 : 1.0;
          const nextScale = THREE.MathUtils.lerp(w.scale.x, targetScale, 0.25);
          w.scale.setScalar(nextScale);

          if (w.userData.orbHalo) {
            w.userData.orbHalo.scale.setScalar(hovered ? 1.65 : 1.0);
            w.userData.haloMat.opacity = hovered ? 0.75 : 0.35;
          }
        }
      });

      // Anima caminho luminoso no tapete vermelho (1 = indo para Letícia na parte de trás, -1 = indo para Luigi na parte da frente)
      pathMarkers.forEach((m, idx) => {
        if (activePathDirection === 0) {
          m.material.opacity = 0;
        } else {
          const waveIndex = activePathDirection > 0 ? idx : pathMarkers.length - 1 - idx;
          const pulse = 0.5 + 0.5 * Math.sin(elapsed * 4.5 - waveIndex * 0.7);
          m.material.opacity = 0.25 + pulse * 0.65;
        }
      });
    }
  };
}
