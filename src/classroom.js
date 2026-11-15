import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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

/**
 * Textura de blocos de pedra arenito/calcário quente (como nas 4 imagens de referência)
 */
function createWarmSandstoneWallTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#6f5e4c';
  ctx.fillRect(0, 0, 512, 512);

  const rows = 8;
  const cols = 4;
  const bh = 512 / rows;
  const bw = 512 / cols;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw / 2);
    for (let c = -1; c <= cols; c++) {
      const x = c * bw + offset;
      const y = r * bh;
      const base = 132 + Math.floor(Math.random() * 24);
      const red = base + 18;
      const green = base + 4;
      const blue = base - 16;
      ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);

      // Leve variação de granulação interna na pedra
      ctx.fillStyle = 'rgba(255, 238, 210, 0.06)';
      ctx.fillRect(x + 6, y + 6, bw - 14, bh * 0.35);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 3);
  return tex;
}

/**
 * Textura de lajes quadradas de pedra para o piso do salão (como na vista superior da foto 3)
 */
function createStoneFloorTileTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#52473c';
  ctx.fillRect(0, 0, 512, 512);

  const grid = 4;
  const step = 512 / grid;
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      const x = c * step;
      const y = r * step;
      const v = 108 + ((r * 3 + c * 5) % 18);
      ctx.fillStyle = `rgb(${v + 12}, ${v + 4}, ${v - 6})`;
      ctx.fillRect(x + 3, y + 3, step - 6, step - 6);

      ctx.strokeStyle = 'rgba(40, 32, 24, 0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 4, y + 4, step - 8, step - 8);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 9);
  return tex;
}

/**
 * Textura de madeira nobre envernizada para mesas, estantes, vigas e portas
 */
function createWoodTexture(dark = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = dark ? '#341d10' : '#583118';
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
  ctx.strokeStyle = '#9c6d14';
  ctx.lineWidth = 3;

  // Corpo rampante do leão heráldico
  ctx.beginPath();
  // Cabeça e juba
  ctx.arc(-8, -52, 24, 0, Math.PI * 2);
  // Tronco
  ctx.ellipse(2, -5, 22, 38, -0.2, 0, Math.PI * 2);
  // Quadril
  ctx.arc(12, 30, 18, 0, Math.PI * 2);
  ctx.fill();

  // Pata dianteira esquerda erguida
  ctx.lineWidth = 13;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#eab839';
  ctx.beginPath();
  ctx.moveTo(-12, -26);
  ctx.lineTo(-48, -52);
  ctx.lineTo(-58, -42);
  ctx.stroke();

  // Pata dianteira direita
  ctx.beginPath();
  ctx.moveTo(-4, -12);
  ctx.lineTo(-44, -16);
  ctx.stroke();

  // Pata traseira esquerda
  ctx.beginPath();
  ctx.moveTo(4, 34);
  ctx.lineTo(-26, 68);
  ctx.lineTo(-38, 68);
  ctx.stroke();

  // Pata traseira direita
  ctx.beginPath();
  ctx.moveTo(18, 36);
  ctx.lineTo(36, 72);
  ctx.lineTo(24, 74);
  ctx.stroke();

  // Cauda real em S com tufo na ponta
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(22, 22);
  ctx.bezierCurveTo(66, 10, 62, -48, 30, -64);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(28, -66, 11, 0, Math.PI * 2);
  ctx.fill();

  // Detalhes da juba/coroa
  ctx.fillStyle = '#ffd966';
  ctx.beginPath();
  ctx.moveTo(-22, -68);
  ctx.lineTo(-8, -82);
  ctx.lineTo(6, -68);
  ctx.closePath();
  ctx.fill();

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

  // Trama sutil do tecido
  ctx.fillStyle = 'rgba(40, 0, 5, 0.12)';
  for (let y = 0; y < 1024; y += 8) {
    ctx.fillRect(0, y, 512, 3);
  }

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

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
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
  sky.addColorStop(0, '#1e3f7a');
  sky.addColorStop(0.6, '#2b58a8');
  sky.addColorStop(1, '#162c54');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 256, 512);

  // Silhuetas de pinheiros da floresta lá fora (como nas fotos 2 e 4)
  ctx.fillStyle = 'rgba(10, 20, 38, 0.65)';
  [55, 130, 205].forEach((tx, idx) => {
    for (let layer = 0; layer < 5; layer++) {
      const topY = 210 + idx * 18 + layer * 45;
      ctx.beginPath();
      ctx.moveTo(tx, topY);
      ctx.lineTo(tx - 38 - layer * 6, topY + 68);
      ctx.lineTo(tx + 38 + layer * 6, topY + 68);
      ctx.closePath();
      ctx.fill();
    }
  });

  // Grade de losangos de chumbo (leaded glass)
  ctx.strokeStyle = 'rgba(20, 24, 32, 0.78)';
  ctx.lineWidth = 3;
  const step = 32;
  for (let y = -256; y < 512 + 256; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + 256);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(256, y);
    ctx.lineTo(0, y + 256);
    ctx.stroke();
  }

  // Moldura de pedra em arco ogival
  ctx.strokeStyle = '#5c4d3c';
  ctx.lineWidth = 14;
  ctx.strokeRect(4, 4, 248, 504);

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
function createBookcaseWithProps(woodMat, darkWoodMat, brassMat, candleMat, flameMat, side = 'left', index = 0) {
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
  const bookPalette = [0x6b1d1d, 0x1e4628, 0x22385c, 0x5c3c1e, 0x4b244a, 0x7a5624];

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
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(bw, bh, bd),
        new THREE.MeshStandardMaterial({ color: bColor, roughness: 0.75 })
      );
      book.position.set(curX + bw / 2, sy + 0.02 + bh / 2, 0.02);
      group.add(book);
      curX += bw + 0.008;
      bIdx++;
    }
  });

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

  return group;
}

/**
 * Constrói uma Carteira Dupla de Estudante com 2 Cadeiras, 2 Livros e 2 Tinteiros com Penas (Fotos 1, 3 e 4)
 */
function createStudentDoubleDeskWithChairs(woodMat, darkWoodMat, brassMat, chairFaceSign = 1) {
  const group = new THREE.Group();
  const deskW = 1.24;
  const deskH = 0.74;
  const deskD = 0.68;

  // Tampo e saia da mesa
  const top = new THREE.Mesh(new THREE.BoxGeometry(deskW, 0.05, deskD), woodMat);
  top.position.y = deskH;
  const apron = new THREE.Mesh(new THREE.BoxGeometry(deskW - 0.10, 0.14, deskD - 0.10), darkWoodMat);
  apron.position.y = deskH - 0.09;
  group.add(top, apron);

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
  const book1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.04, 0.30),
    new THREE.MeshStandardMaterial({ color: 0x7d1919, roughness: 0.7 })
  );
  book1.position.set(-0.28, deskH + 0.045, 0.02);
  book1.rotation.y = 0.18;

  const book2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.04, 0.30),
    new THREE.MeshStandardMaterial({ color: 0x3b3524, roughness: 0.75 })
  );
  book2.position.set(0.24, deskH + 0.045, -0.02);
  book2.rotation.y = -0.15;
  group.add(book1, book2);

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
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.04), woodMat);
    back.position.set(0, 0.66, 0.18 * chairFaceSign);
    chair.add(seat, back);

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

  return group;
}

/**
 * Constrói uma Estátua de Leão de Pedra Sentado sobre Pedestal Clássico (Fotos 1 e 4)
 */
function createLionStatueOnPedestal(stoneMat) {
  const group = new THREE.Group();

  // Pedestal de pedra com base e cornija
  const pedBase = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.14, 0.76), stoneMat);
  pedBase.position.y = 0.07;
  const pedBody = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.78, 0.64), stoneMat);
  pedBody.position.y = 0.53;
  const pedCap = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.12, 0.74), stoneMat);
  pedCap.position.y = 0.98;
  group.add(pedBase, pedBody, pedCap);

  // Leão esculpido sentado sobre o pedestal
  const lionMat = new THREE.MeshStandardMaterial({ color: 0x9e886c, roughness: 0.78 });
  const haunches = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 14), lionMat);
  haunches.scale.set(0.95, 1.25, 1.1);
  haunches.position.set(0, 1.26, -0.05);

  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.52, 14), lionMat);
  chest.position.set(0, 1.44, 0.04);
  chest.rotation.x = -0.15;

  const mane = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 14), lionMat);
  mane.scale.set(1.0, 1.15, 0.95);
  mane.position.set(0, 1.76, 0.08);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.18), lionMat);
  snout.position.set(0, 1.73, 0.24);

  // Patas dianteiras
  [-0.11, 0.11].forEach((px) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.50, 10), lionMat);
    leg.position.set(px, 1.29, 0.18);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 10), lionMat);
    paw.scale.set(1, 0.6, 1.3);
    paw.position.set(px, 1.06, 0.23);
    group.add(leg, paw);
  });

  group.add(haunches, chest, mane, snout);
  return group;
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

  return group;
}

/**
 * Constrói o Lustre Circular Medieval de Ferro Forjado no Teto com 8 Velas e Correntes (Fotos 2 e 4)
 */
function createCeilingRingChandelier(ironMat, candleMat, flameMat, ceilingY, chandelierY) {
  const group = new THREE.Group();

  // Corrente central desde a roseta do teto até o lustre
  const chainLen = ceilingY - chandelierY;
  const mainChain = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, chainLen, 8), ironMat);
  mainChain.position.y = chandelierY + chainLen / 2;
  group.add(mainChain);

  // Anel grande de ferro forjado
  const radius = 0.78;
  const ironRing = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.036, 12, 36), ironMat);
  ironRing.rotation.x = Math.PI / 2;
  ironRing.position.y = chandelierY;
  group.add(ironRing);

  // 4 Correntes diagonais de sustentação e 8 velas ao redor do anel
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI * 2) / 8;
    const cx = Math.cos(ang) * radius;
    const cz = Math.sin(ang) * radius;

    if (i % 2 === 0) {
      const diagLen = Math.hypot(radius, chainLen * 0.55);
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, diagLen, 6), ironMat);
      strut.position.set(cx * 0.5, chandelierY + chainLen * 0.275, cz * 0.5);
      strut.lookAt(0, chandelierY + chainLen * 0.55, 0);
      strut.rotateX(Math.PI / 2);
      group.add(strut);
    }

    // Suporte fleur-de-lis e vela
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.025, 0.06, 8), ironMat);
    holder.position.set(cx, chandelierY + 0.03, cz);

    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 8), candleMat);
    wax.position.set(cx, chandelierY + 0.16, cz);

    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), flameMat);
    flame.scale.set(0.85, 1.7, 0.85);
    flame.position.set(cx, chandelierY + 0.31, cz);

    group.add(holder, wax, flame);
  }

  return group;
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

  const wallStoneTex = createWarmSandstoneWallTexture();
  const floorStoneTex = createStoneFloorTileTexture();
  const woodTex = createWoodTexture(false);
  const darkWoodTex = createWoodTexture(true);
  const carpetTex = createRoyalRedCarpetTexture();
  const windowTex = createGothicWindowTexture();
  const blackboardTex = createBlackboardTexture();

  // Dimensões do Salão 3D Maior e do Tapete Vermelho Central Caminhável
  const walkableWidth = 1.5;   // X: -0.75m a +0.75m (Tapete Vermelho)
  const walkableLength = 4.0;  // Z: -2.00m a +2.00m (Tapete Vermelho)
  const visualWidth = 6.8;     // X: -3.40m a +3.40m (Salão completo com carteiras e estantes nas laterais)
  const roomLength = 8.6;      // Z: -4.30m a +4.30m (Fundo com Portas Duplas até Frente com Plataforma da Professora)
  const roomHeight = 5.2;      // Altura até o teto abobadado com lustre circular

  const wallMat = new THREE.MeshStandardMaterial({
    map: wallStoneTex,
    roughness: 0.88,
    metalness: 0.04
  });
  const stoneDetailMat = new THREE.MeshStandardMaterial({
    color: 0xa69076,
    roughness: 0.82
  });
  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.62,
    metalness: 0.06
  });
  const darkWoodMat = new THREE.MeshStandardMaterial({
    map: darkWoodTex,
    roughness: 0.58,
    metalness: 0.08
  });
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x1f1d1b,
    roughness: 0.45,
    metalness: 0.75
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4a843,
    roughness: 0.32,
    metalness: 0.78
  });
  const candleMat = new THREE.MeshBasicMaterial({ color: 0xfff6dc });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb72b });

  // ============================================================================
  // 1. PISO DE LAJES DE PEDRA E TAPETE VERMELHO CENTRAL (ÁREA CAMINHÁVEL)
  // ============================================================================
  const floorGeo = new THREE.PlaneGeometry(visualWidth, roomLength);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorStoneTex,
    roughness: 0.84,
    metalness: 0.05
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

  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(visualWidth, roomHeight), wallMat);
  backWall.position.set(0, roomHeight / 2, -roomLength / 2);
  roomGroup.add(backWall);

  const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(visualWidth, roomHeight), wallMat);
  frontWall.rotation.y = Math.PI;
  frontWall.position.set(0, roomHeight / 2, roomLength / 2);
  roomGroup.add(frontWall);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(visualWidth, roomLength), wallMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = roomHeight;
  roomGroup.add(ceiling);

  // Pilares de pedra, Mísulas (corbels), Arcos de Madeira do Teto Abobadado e Arandelas de Vela (Fotos 2 e 4)
  const bayZPositions = [-3.6, -1.2, 1.2, 3.6];
  bayZPositions.forEach((zPos) => {
    [-visualWidth / 2 + 0.14, visualWidth / 2 - 0.14].forEach((xPos) => {
      const signX = Math.sign(xPos);
      // Pilar de pedra
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.28, roomHeight, 0.34), stoneDetailMat);
      pillar.position.set(xPos, roomHeight / 2, zPos);
      roomGroup.add(pillar);

      // Mísula de pedra (corbel) no alto do pilar
      const corbel = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.38), stoneDetailMat);
      corbel.position.set(xPos - signX * 0.10, 3.55, zPos);
      roomGroup.add(corbel);

      // Arandela de ferro forjado com 2 velas acesas no pilar
      const sconce = new THREE.Group();
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.04), ironMat);
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.24), ironMat);
      crossbar.position.x = -signX * 0.09;
      sconce.add(bracket, crossbar);
      [-0.09, 0.09].forEach((cz) => {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 8), candleMat);
        w.position.set(-signX * 0.09, 0.09, cz);
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), flameMat);
        f.scale.set(0.8, 1.6, 0.8);
        f.position.set(-signX * 0.09, 0.19, cz);
        sconce.add(w, f);
      });
      sconce.position.set(xPos - signX * 0.14, 2.55, zPos);
      roomGroup.add(sconce);
    });

    // Viga transversal e arcos curvos de madeira escura no teto (Fotos 2 e 4)
    const transverseBeam = new THREE.Mesh(new THREE.BoxGeometry(visualWidth - 0.3, 0.24, 0.26), darkWoodMat);
    transverseBeam.position.set(0, roomHeight - 0.14, zPos);
    roomGroup.add(transverseBeam);

    // Pés-direitos curvos de madeira subindo das mísulas até o teto
    [-1, 1].forEach((sideSign) => {
      const archStrut = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.65, 0.24), darkWoodMat);
      archStrut.position.set(sideSign * (visualWidth / 2 - 0.55), 4.32, zPos);
      archStrut.rotation.z = sideSign * 0.42;
      roomGroup.add(archStrut);
    });

    // Roseta / medalhão esculpido de pedra no centro da nervura do teto
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.10, 16), stoneDetailMat);
    boss.position.set(0, roomHeight - 0.24, zPos);
    roomGroup.add(boss);
  });

  // Duas vigas longitudinais de madeira no teto e nervuras diagonais das abóbadas (Foto 2)
  [-1.95, 1.95].forEach((lx) => {
    const longBeam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, roomLength), darkWoodMat);
    longBeam.position.set(lx, roomHeight - 0.14, 0);
    roomGroup.add(longBeam);
  });

  [-2.4, 0.0, 2.4].forEach((vaultCenterZ) => {
    // Roseta central da abóbada
    const centerBoss = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 16), stoneDetailMat);
    centerBoss.position.set(0, roomHeight - 0.10, vaultCenterZ);
    roomGroup.add(centerBoss);

    // Nervuras diagonais de pedra cruzando o teto
    [1, -1].forEach((dir) => {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.10, 4.4), stoneDetailMat);
      rib.position.set(0, roomHeight - 0.06, vaultCenterZ);
      rib.rotation.y = dir * 0.72;
      roomGroup.add(rib);
    });
  });

  // Lustre Circular Medieval de Ferro Forjado com 8 Velas pendurado no centro do teto (Fotos 2 e 4)
  const chandelier = createCeilingRingChandelier(ironMat, candleMat, flameMat, roomHeight, 3.75);
  roomGroup.add(chandelier);

  // Janelas Góticas Iluminadas nas paredes laterais (inferiores entre as estantes e superiores no clerestório)
  const windowMat = new THREE.MeshBasicMaterial({ map: windowTex });
  [-2.4, 0.0, 2.4].forEach((zWin) => {
    [-1, 1].forEach((sideSign) => {
      // Janela gótica principal
      const winLower = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 2.15), windowMat);
      winLower.rotation.y = -sideSign * (Math.PI / 2);
      winLower.position.set(sideSign * (visualWidth / 2 - 0.03), 2.35, zWin);
      roomGroup.add(winLower);

      // Peitoril chanfrado de pedra sob a janela
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 1.10), stoneDetailMat);
      sill.position.set(sideSign * (visualWidth / 2 - 0.12), 1.24, zWin);
      roomGroup.add(sill);

      // Janela gótica superior (clerestório junto às abóbadas, Fotos 2 e 4)
      const winUpper = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.25), windowMat);
      winUpper.rotation.y = -sideSign * (Math.PI / 2);
      winUpper.position.set(sideSign * (visualWidth / 2 - 0.03), 4.25, zWin);
      roomGroup.add(winUpper);
    });
  });

  // ============================================================================
  // 3. LATERAIS INACESSÍVEIS AO USUÁRIO: 4 CARTEIRAS DUPLAS + 4 ESTANTES DE LIVROS
  // ============================================================================
  const deskZPositions = [-0.82, 0.74];
  deskZPositions.forEach((zDesk) => {
    [-1.78, 1.78].forEach((xDesk) => {
      // Cadeiras em Z menor (-Z) e frente da carteira voltada para a Mesa da Professora (+Z)
      const studentDesk = createStudentDoubleDeskWithChairs(woodMat, darkWoodMat, brassMat, -1);
      studentDesk.position.set(xDesk, 0, zDesk);
      roomGroup.add(studentDesk);
    });
  });

  // 4 Estantes Altas de Madeira encostadas nas paredes laterais (2 de cada lado, Fotos 1, 3 e 4)
  const bookcaseZPositions = [-1.25, 1.20];
  bookcaseZPositions.forEach((zBook, idx) => {
    const leftBookcase = createBookcaseWithProps(
      woodMat,
      darkWoodMat,
      brassMat,
      candleMat,
      flameMat,
      'left',
      idx
    );
    leftBookcase.rotation.y = Math.PI / 2;
    leftBookcase.position.set(-visualWidth / 2 + 0.24, 0, zBook);
    roomGroup.add(leftBookcase);

    const rightBookcase = createBookcaseWithProps(
      woodMat,
      darkWoodMat,
      brassMat,
      candleMat,
      flameMat,
      'right',
      idx
    );
    rightBookcase.rotation.y = -Math.PI / 2;
    rightBookcase.position.set(visualWidth / 2 - 0.24, 0, zBook);
    roomGroup.add(rightBookcase);
  });

  // ============================================================================
  // 4. CADEIRA CENTRAL DO USUÁRIO (X = 0, Z = 0 — Desaparece 10s após movimento!)
  // ============================================================================
  const playerChair = new THREE.Group();
  const chairWoodMat = woodMat.clone();
  chairWoodMat.transparent = true;
  chairWoodMat.opacity = 1.0;

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

  const wtTop = new THREE.Mesh(new THREE.BoxGeometry(wtWidth + 0.08, 0.06, wtDepth + 0.08), woodMat);
  wtTop.position.y = wtHeight;
  const wtBody = new THREE.Mesh(new THREE.BoxGeometry(wtWidth, wtHeight - 0.06, wtDepth), darkWoodMat);
  wtBody.position.y = (wtHeight - 0.06) / 2;
  const wtBase = new THREE.Mesh(new THREE.BoxGeometry(wtWidth + 0.06, 0.08, wtDepth + 0.06), woodMat);
  wtBase.position.y = 0.04;
  wandTable.add(wtTop, wtBody, wtBase);

  // Entalhes frontais: 4 arcos góticos e uma roseta central (exatamente como na Foto 1)
  [-0.46, -0.22, 0.22, 0.46].forEach((ax) => {
    const archFrame = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.52, 0.03), woodMat);
    archFrame.position.set(ax, 0.42, wtDepth / 2 + 0.015);
    wandTable.add(archFrame);
  });
  const centerRosette = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 16), woodMat);
  centerRosette.rotation.x = Math.PI / 2;
  centerRosette.position.set(0, 0.42, wtDepth / 2 + 0.02);
  wandTable.add(centerRosette);

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
  roomGroup.add(wandTable);

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

  // Portas Duplas de Madeira em Arco Gótico na parede de fundo (Z = -4.26m, Fotos 1 e 4)
  const backDoorZ = -roomLength / 2 + 0.04;
  const doorArchGroup = new THREE.Group();
  doorArchGroup.position.set(0, 0, backDoorZ);

  // Moldura monumental de pedra do arco da porta
  [-0.98, 0.98].forEach((px) => {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.65, 0.26), stoneDetailMat);
    jamb.position.set(px, 1.325, 0.08);
    doorArchGroup.add(jamb);
  });
  const archRing = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.16, 12, 28, Math.PI), stoneDetailMat);
  archRing.position.set(0, 2.65, 0.08);
  doorArchGroup.add(archRing);

  // Folhas duplas de madeira da porta com dobradiças de ferro forjado e puxadores de argola
  const doorRect = new THREE.Mesh(new THREE.BoxGeometry(1.76, 2.65, 0.10), darkWoodMat);
  doorRect.position.set(0, 1.325, 0.02);
  const doorArchTop = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.10, 24, 1, false, 0, Math.PI), darkWoodMat);
  doorArchTop.rotation.z = -Math.PI / 2;
  doorArchTop.rotation.y = Math.PI / 2;
  doorArchTop.position.set(0, 2.65, 0.02);
  const centerSeam = new THREE.Mesh(new THREE.BoxGeometry(0.03, 3.52, 0.12), ironMat);
  centerSeam.position.set(0, 1.76, 0.02);
  doorArchGroup.add(doorRect, doorArchTop, centerSeam);

  // Ferragens (dobradiças horizontais e argolas de ferro)
  [1.15, 2.25].forEach((hy) => {
    [-0.52, 0.52].forEach((hx) => {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.03), ironMat);
      strap.position.set(hx, hy, 0.08);
      doorArchGroup.add(strap);
    });
  });
  [-0.16, 0.16].forEach((rx) => {
    const ringHandle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 8, 16), ironMat);
    ringHandle.position.set(rx, 1.42, 0.09);
    doorArchGroup.add(ringHandle);
  });

  // Brasão de Pedra com Leão esculpido acima do arco da porta (Fotos 1 e 4)
  const crestShield = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.14), stoneDetailMat);
  crestShield.position.set(0, 3.95, 0.10);
  doorArchGroup.add(crestShield);

  roomGroup.add(doorArchGroup);

  // 2 Estátuas de Leão de Pedra sobre Pedestais + 2 Candelabros Altos + 2 Estandartes Vermelhos/Dourados (Fotos 1 e 4)
  const bannerCanvas = document.createElement('canvas');
  bannerCanvas.width = 256;
  bannerCanvas.height = 512;
  const bCtx = bannerCanvas.getContext('2d');
  bCtx.fillStyle = '#821219';
  bCtx.fillRect(0, 0, 256, 512);
  bCtx.strokeStyle = '#e5b842';
  bCtx.lineWidth = 14;
  bCtx.strokeRect(10, 10, 236, 492);
  drawGoldenLionCrest(bCtx, 128, 245, 88);
  const bannerTex = new THREE.CanvasTexture(bannerCanvas);
  bannerTex.colorSpace = THREE.SRGBColorSpace;
  const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.8, side: THREE.DoubleSide });

  [-1, 1].forEach((sideSign) => {
    // Estátua de Leão sobre pedestal
    const lionStatue = createLionStatueOnPedestal(stoneDetailMat);
    lionStatue.position.set(sideSign * 1.62, 0, -3.72);
    lionStatue.rotation.y = -sideSign * 0.12;
    roomGroup.add(lionStatue);

    // Candelabro alto de ferro forjado ao lado da porta
    const candelabra = createTallIronCandelabra(ironMat, candleMat, flameMat);
    candelabra.position.set(sideSign * 1.12, 0, -3.48);
    roomGroup.add(candelabra);

    // Estandarte Vermelho e Dourado pendurado na parede de fundo acima do leão
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 1.68), bannerMat);
    banner.position.set(sideSign * 1.62, 3.22, backDoorZ + 0.06);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.92, 8), darkWoodMat);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(sideSign * 1.62, 4.08, backDoorZ + 0.06);
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

  const tdTop = new THREE.Mesh(new THREE.BoxGeometry(tdWidth + 0.08, 0.06, tdDepth + 0.08), woodMat);
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
  roomGroup.add(teacherDesk);

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
  const frontWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 2.25), windowMat);
  frontWindow.rotation.y = Math.PI;
  frontWindow.position.set(0, 2.55, roomLength / 2 - 0.03);
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
  for (let i = 0; i < 12; i++) {
    const cGroup = new THREE.Group();
    const wax = new THREE.Mesh(floatCandleGeo, candleMat);
    const flame = new THREE.Mesh(floatFlameGeo, flameMat);
    flame.position.y = 0.125;
    flame.scale.set(0.8, 1.6, 0.8);
    cGroup.add(wax, flame);

    const cx = (i % 2 === 0 ? -1 : 1) * (1.2 + (i % 3) * 0.55);
    const cy = 2.95 + (i % 4) * 0.28;
    const cz = -2.5 + i * 0.45;
    cGroup.position.set(cx, cy, cz);
    cGroup.userData = { baseY: cy, phase: i * 0.7 };
    roomGroup.add(cGroup);
    candles.push(cGroup);
  }

  // Iluminação quente de velas do salão gótico
  const ambientLight = new THREE.AmbientLight(0xffe2b0, 0.85);
  roomGroup.add(ambientLight);

  const mainCandleLight = new THREE.PointLight(0xffae42, 2.8, 12.0);
  mainCandleLight.position.set(0, 3.65, 0);
  roomGroup.add(mainCandleLight);

  const backLight = new THREE.PointLight(0xffc86b, 2.2, 8.5);
  backLight.position.set(0, 2.6, -2.4);
  roomGroup.add(backLight);

  const frontLight = new THREE.PointLight(0xffc86b, 2.2, 8.5);
  frontLight.position.set(0, 2.6, 2.4);
  roomGroup.add(frontLight);

  const setRoomBrightness = (factor) => {
    const f = THREE.MathUtils.clamp(factor, 0, 1);
    ambientLight.intensity = 0.88 * f;
    mainCandleLight.intensity = 2.8 * f;
    backLight.intensity = 2.2 * f;
    frontLight.intensity = 2.2 * f;
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
