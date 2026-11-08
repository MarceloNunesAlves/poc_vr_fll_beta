import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Remove o fundo branco conectado às bordas da imagem (Flood-Fill BFS),
 * preservando detalhes brancos internos como a camisa/colarinho do uniforme!
 */
function loadCutoutTexture(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const w = canvas.width;
      const h = canvas.height;
      const visited = new Uint8Array(w * h);
      const queue = [];

      const isWhiteBg = (idx) => {
        const p = idx * 4;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        return r > 236 && g > 236 && b > 236;
      };

      // Enfileira todas as bordas da imagem
      for (let x = 0; x < w; x++) {
        queue.push(x);
        queue.push((h - 1) * w + x);
      }
      for (let y = 0; y < h; y++) {
        queue.push(y * w);
        queue.push(y * w + (w - 1));
      }

      let head = 0;
      while (head < queue.length) {
        const curr = queue[head++];
        if (visited[curr]) continue;
        visited[curr] = 1;

        if (!isWhiteBg(curr)) continue;

        // Torna o pixel do fundo transparente
        data[curr * 4 + 3] = 0;

        const cx = curr % w;
        const cy = (curr - cx) / w;
        if (cx > 0 && !visited[curr - 1]) queue.push(curr - 1);
        if (cx < w - 1 && !visited[curr + 1]) queue.push(curr + 1);
        if (cy > 0 && !visited[curr - w]) queue.push(curr - w);
        if (cy < h - 1 && !visited[curr + w]) queue.push(curr + w);
      }

      // Suaviza levemente a borda do recorte (anti-aliasing de 1px)
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (data[i * 4 + 3] > 0) {
            const neighborsTransparent =
              (data[(i - 1) * 4 + 3] === 0 ? 1 : 0) +
              (data[(i + 1) * 4 + 3] === 0 ? 1 : 0) +
              (data[(i - w) * 4 + 3] === 0 ? 1 : 0) +
              (data[(i + w) * 4 + 3] === 0 ? 1 : 0);
            if (neighborsTransparent > 0) {
              data[i * 4 + 3] = Math.max(80, 255 - neighborsTransparent * 50);
            }
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      resolve({ texture, aspect: w / h });
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Cria placa de nome mágica ou balão de diálogo 3D em CanvasTexture
 */
export function createSpeechBubbleMesh(speakerName, initialText) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 280;
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  const geometry = new THREE.PlaneGeometry(1.15, 0.42);
  const mesh = new THREE.Mesh(geometry, material);

  const updateText = (text, visible = true) => {
    mesh.visible = visible;
    if (!visible) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fundo pergaminho escuro com borda dourada
    ctx.fillStyle = 'rgba(18, 12, 28, 0.92)';
    ctx.strokeStyle = '#f5d061';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(14, 14, canvas.width - 28, canvas.height - 44, 26);
    ctx.fill();
    ctx.stroke();

    // Nome do personagem
    ctx.fillStyle = '#ffe885';
    ctx.font = 'bold 30px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`✨ ${speakerName} ✨`, canvas.width / 2, 58);

    // Quebra de linha automática da fala
    ctx.fillStyle = '#ffffff';
    ctx.font = '26px Georgia, serif';
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const w of words) {
      const test = currentLine ? `${currentLine} ${w}` : w;
      if (ctx.measureText(test).width > canvas.width - 80) {
        lines.push(currentLine);
        currentLine = w;
      } else {
        currentLine = test;
      }
    }
    if (currentLine) lines.push(currentLine);

    lines.slice(0, 4).forEach((line, idx) => {
      ctx.fillText(line, canvas.width / 2, 102 + idx * 36);
    });

    texture.needsUpdate = true;
  };

  updateText(initialText, false);
  return { mesh, updateText };
}

/**
 * Cria o personagem (Letícia ou Luigi):
 * - Usa imediatamente a imagem anexada recortada em estilo Totem 3D iluminado
 * - Se você adicionar /public/models/leticia.glb ou /public/models/luigi.glb depois,
 *   ele substitui automaticamente pelo modelo 3D!
 */
export async function createWizardCharacter({
  name,
  imageUrl,
  glbUrl,
  position,
  rotationY = 0,
  height = 1.32,
  accentColor = 0xf5d061
}) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.rotation.y = rotationY;

  // Base pedestal mágico no chão
  const ringGeo = new THREE.RingGeometry(0.28, 0.34, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: accentColor,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.75
  });
  const magicRing = new THREE.Mesh(ringGeo, ringMat);
  magicRing.position.y = 0.01;
  group.add(magicRing);

  // Corpo visual (Totem 2.5D ou Modelo GLB)
  const visualHolder = new THREE.Group();
  group.add(visualHolder);

  const cutout = await loadCutoutTexture(imageUrl);
  let characterMesh = null;

  if (cutout) {
    const planeWidth = height * cutout.aspect;
    const geo = new THREE.PlaneGeometry(planeWidth, height);
    const mat = new THREE.MeshStandardMaterial({
      map: cutout.texture,
      transparent: true,
      alphaTest: 0.15,
      side: THREE.DoubleSide,
      roughness: 0.6,
      metalness: 0.05
    });
    characterMesh = new THREE.Mesh(geo, mat);
    characterMesh.position.y = height / 2;
    VisualAddDropGlow(visualHolder, height, accentColor);
    visualHolder.add(characterMesh);
  }

  // Tenta carregar .glb opcional caso o usuário gere o modelo 3D depois
  if (glbUrl) {
    const loader = new GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const scale = height / Math.max(size.y, 0.001);
        model.scale.setScalar(scale);

        const newBox = new THREE.Box3().setFromObject(model);
        model.position.y = -newBox.min.y;

        if (characterMesh) {
          visualHolder.remove(characterMesh);
        }
        visualHolder.add(model);
      },
      undefined,
      () => {
        // Mantém o totem 3D da imagem anexada caso o arquivo .glb ainda não exista
      }
    );
  }

  // Balão de fala 3D acima da cabeça
  const speech = createSpeechBubbleMesh(name, '');
  speech.mesh.position.set(0, height + 0.34, 0.05);
  group.add(speech.mesh);

  // Luz suave dedicada para destacar o personagem na sala escura de bruxos
  const spot = new THREE.PointLight(0xffe6a3, 1.1, 2.5);
  spot.position.set(0, height * 0.85, 0.45);
  group.add(spot);

  return {
    group,
    visualHolder,
    magicRing,
    setSpeech: speech.updateText,
    update(elapsed, playerWorldPos) {
      // Respiração suave e rotação do anel mágico no chão
      visualHolder.position.y = Math.sin(elapsed * 2.2) * 0.018;
      magicRing.rotation.z = elapsed * 0.6;

      // Faz o personagem e o balão olharem suavemente na direção horizontal do jogador
      if (playerWorldPos) {
        const dx = playerWorldPos.x - group.position.x;
        const dz = playerWorldPos.z - group.position.z;
        const targetAngle = Math.atan2(dx, dz);
        group.rotation.y = targetAngle;
      }
    }
  };
}

function VisualAddDropGlow(holder, height, color) {
  const glowGeo = new THREE.CircleGeometry(0.42, 32);
  const glowMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(0, height * 0.52, -0.03);
  holder.add(glow);
}

