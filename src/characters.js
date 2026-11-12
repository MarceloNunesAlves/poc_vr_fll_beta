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
 * Opção A.2: Cria uma boca 3D curvada sobreposta (estilo Toy / Cartoon / Anime)
 * posicionada nas coordenadas exatas dos lábios da Letícia e do Luigi.
 * Fica invisível quando o personagem está em silêncio (mostrando os lábios originais do GLB)
 * e anima em 2D/3D sincronizada com as sílabas da voz quando o personagem fala.
 */
function createAnimatedMouthOverlay(characterName) {
  const isLeticia = characterName === 'Letícia';

  // Coordenadas exatas extraídas dos vértices dos lábios em leticia.glb e luigi.glb
  const mouthCenter = isLeticia
    ? new THREE.Vector3(-0.0126, 0.6462, 0.1652)
    : new THREE.Vector3(-0.0150, 0.6542, 0.1438);

  // Paleta calibrada a partir dos pixels reais da textura de cada modelo GLB
  const skinRGB = isLeticia ? '251, 208, 184' : '251, 196, 165';
  const lipColor = isLeticia ? '#dc766e' : '#d87b6b';
  const lipShadow = isLeticia ? '#b95650' : '#b55c4e';

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  // Malha subdividida e curvada em Z/Y para abraçar o contorno anatômico dos lábios/bochechas
  const width = 0.044;
  const height = 0.028;
  const geo = new THREE.PlaneGeometry(width, height, 16, 10);
  const posAttr = geo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const nx = vx / (width * 0.5);  // -1..1
    const ny = vy / (height * 0.5); // -1..1
    // Curva para trás nas laterais da boca acompanhando o rosto do modelo 3D
    const curveZ = -0.0062 * (nx * nx) - 0.0022 * (ny * ny);
    posAttr.setZ(i, curveZ);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(mouthCenter);
  mesh.visible = false;

  let lastQuantizedOpen = -1;
  let lastQuantizedShape = -1;

  const updateMouth = (mouthOpen, elapsed) => {
    if (mouthOpen < 0.025) {
      if (mesh.visible) mesh.visible = false;
      lastQuantizedOpen = 0;
      return;
    }

    mesh.visible = true;

    // Alterna sutilmente entre vogais mais arredondadas ("O/A") e mais largas ("E/I")
    const vowelRoundness = 0.5 + 0.5 * Math.sin(elapsed * 11.2);
    const qOpen = Math.round(mouthOpen * 32);
    const qShape = Math.round(vowelRoundness * 12);
    if (qOpen === lastQuantizedOpen && qShape === lastQuantizedShape) return;
    lastQuantizedOpen = qOpen;
    lastQuantizedShape = qShape;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.48;

    ctx.clearRect(0, 0, w, h);

    // 1. Base suave no tom de pele com borda esfumaçada para cobrir o risco do lábio fechado original
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1.35, 1.0);
    const skinGrad = ctx.createRadialGradient(0, 0, 12, 0, 0, 68);
    const skinAlpha = Math.min(0.95, 0.45 + mouthOpen * 0.75);
    skinGrad.addColorStop(0, `rgba(${skinRGB}, ${skinAlpha})`);
    skinGrad.addColorStop(0.62, `rgba(${skinRGB}, ${skinAlpha * 0.75})`);
    skinGrad.addColorStop(1, `rgba(${skinRGB}, 0)`);
    ctx.fillStyle = skinGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 68, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Dimensões dinâmicas da abertura bucal conforme a sílaba
    const halfW = (62 - vowelRoundness * 12) * (0.78 + mouthOpen * 0.28);
    const openH = 5 + mouthOpen * 46;
    const upperY = cy - openH * 0.34;
    const lowerY = cy + openH * 0.76;
    const cornerY = cy - 4 - (1 - mouthOpen) * 4;

    // Função auxiliar do caminho da cavidade da boca
    const traceMouthPath = () => {
      ctx.beginPath();
      ctx.moveTo(cx - halfW, cornerY);
      // Arco do lábio superior
      ctx.quadraticCurveTo(cx, upperY - 6, cx + halfW, cornerY);
      // Arco do lábio inferior (abre para baixo em formato de D/oval)
      ctx.bezierCurveTo(
        cx + halfW * 0.72,
        lowerY + 8,
        cx - halfW * 0.72,
        lowerY + 8,
        cx - halfW,
        cornerY
      );
      ctx.closePath();
    };

    // 2. Interior escuro da boca + língua + dentes superiores (recortados dentro da cavidade)
    ctx.save();
    traceMouthPath();
    ctx.fillStyle = '#2d070e';
    ctx.fill();
    ctx.clip();

    // Língua rosada na parte inferior da boca aberta
    if (mouthOpen > 0.12) {
      ctx.fillStyle = '#cf5a64';
      ctx.beginPath();
      ctx.ellipse(cx, lowerY + 4, halfW * 0.62, openH * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Filete de dentes superiores brancos no topo da abertura
    if (mouthOpen > 0.08) {
      ctx.fillStyle = '#fcf8f0';
      ctx.beginPath();
      ctx.ellipse(cx, upperY + 3, halfW * 0.76, Math.min(11, openH * 0.32), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3. Contorno dos lábios no tom natural do personagem
    ctx.save();
    traceMouthPath();
    ctx.lineWidth = 6.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = lipColor;
    ctx.stroke();

    // Sombra sutil interna no lábio superior para dar volume 3D
    ctx.beginPath();
    ctx.moveTo(cx - halfW * 0.92, cornerY);
    ctx.quadraticCurveTo(cx, upperY - 5, cx + halfW * 0.92, cornerY);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = lipShadow;
    ctx.stroke();
    ctx.restore();

    texture.needsUpdate = true;
  };

  return { mesh, updateMouth };
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

  let smoothedMouthOpen = 0;
  let isSpeakingBubbleActive = false;
  const mouthOverlay = createAnimatedMouthOverlay(name);

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

        // Anexa a boca 3D animada sobreposta (Opção A.2) no espaço local do modelo
        model.add(mouthOverlay.mesh);

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
    setSpeech(text, visible = true) {
      isSpeakingBubbleActive = Boolean(visible && text);
      speech.updateText(text, visible);
    },
    update(elapsed, playerWorldPos, speechLevel = 0) {
      // Respiração suave e rotação do anel mágico no chão
      visualHolder.position.y = Math.sin(elapsed * 2.2) * 0.018;
      magicRing.rotation.z = elapsed * 0.6;

      // Calcula abertura da boca sobreposta (Opção A.2) sincronizada com a voz
      let targetMouth = speechLevel;
      if (isSpeakingBubbleActive && targetMouth < 0.02) {
        targetMouth =
          Math.max(0, Math.sin(elapsed * 14.5) * 0.55 + Math.sin(elapsed * 6.2) * 0.35) * 0.65;
      }

      const lerpFactor = targetMouth > smoothedMouthOpen ? 0.42 : 0.25;
      smoothedMouthOpen += (targetMouth - smoothedMouthOpen) * lerpFactor;
      if (smoothedMouthOpen < 0.01) smoothedMouthOpen = 0;

      mouthOverlay.updateMouth(smoothedMouthOpen, elapsed);

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

