import * as THREE from 'three';

/**
 * Tamanho físico real (em metros) do quadrado de cada QR Code impresso na folha A4.
 * 0.20m = 20cm x 20cm (cabe perfeitamente em uma folha A4 com margem).
 */
export const QR_PHYSICAL_SIZE_METERS = 0.20;

/**
 * Definição dos 4 Cantos Físicos da Sala de 4,0m (comprimento Z) x 1,5m (largura X).
 * Como cada QR Code tem 20cm x 20cm (raio de 10cm = 0.10m), posicionando a borda externa
 * do QR Code alinhada com a quina do tapete (X = ±0.75m, Z = ±2.00m), o centro exato de
 * cada marcador fica em X = ±0.65m e Z = ±1.90m.
 *
 * Orientação padrão de todos os 4 QR Codes no chão:
 * Topo da folha (seta "⬆️ FUNDO DA SALA") apontando para -Z (direção da Letícia / Mesa de Varinhas).
 */
export const FLOOR_QR_CORNERS = [
  {
    index: 0,
    id: 'QR-CANTO-1',
    shortLabel: 'QR 1 • Início Esquerda',
    title: 'CANTO 1 — INÍCIO ESQUERDA (Lado da Cadeira)',
    placeHint: 'Chão: Atrás/Esquerda da Cadeira (X: -0,75m | Z: +2,00m)',
    roomX: -0.65,
    roomZ: 1.90,
    cornerEdgeX: -0.75,
    cornerEdgeZ: 2.00,
    seed: 104729
  },
  {
    index: 1,
    id: 'QR-CANTO-2',
    shortLabel: 'QR 2 • Início Direita',
    title: 'CANTO 2 — INÍCIO DIREITA (Lado da Cadeira)',
    placeHint: 'Chão: Atrás/Direita da Cadeira (X: +0,75m | Z: +2,00m)',
    roomX: 0.65,
    roomZ: 1.90,
    cornerEdgeX: 0.75,
    cornerEdgeZ: 2.00,
    seed: 224737
  },
  {
    index: 2,
    id: 'QR-CANTO-3',
    shortLabel: 'QR 3 • Fundo Esquerda',
    title: 'CANTO 3 — FUNDO ESQUERDA (Mesa de Varinhas)',
    placeHint: 'Chão: Fundo Esquerdo perto das Varinhas (X: -0,75m | Z: -2,00m)',
    roomX: -0.65,
    roomZ: -1.90,
    cornerEdgeX: -0.75,
    cornerEdgeZ: -2.00,
    seed: 350377
  },
  {
    index: 3,
    id: 'QR-CANTO-4',
    shortLabel: 'QR 4 • Fundo Direita',
    title: 'CANTO 4 — FUNDO DIREITA (Perto da Letícia)',
    placeHint: 'Chão: Fundo Direito perto da Letícia (X: +0,75m | Z: -2,00m)',
    roomX: 0.65,
    roomZ: -1.90,
    cornerEdgeX: 0.75,
    cornerEdgeZ: -2.00,
    seed: 479909
  }
];

/**
 * Gerador pseudo-aleatório determinístico (mulberry32) para produzir exatamente
 * a mesma matriz de QR Code de alto contraste no WebXR e na folha impressa.
 */
function createSeededRandom(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Desenha um Finder Pattern de QR Code tradicional (7x7 módulos).
 */
function drawFinderPattern(ctx, modX, modY, moduleSize) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(modX * moduleSize, modY * moduleSize, 7 * moduleSize, 7 * moduleSize);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect((modX + 1) * moduleSize, (modY + 1) * moduleSize, 5 * moduleSize, 5 * moduleSize);
  ctx.fillStyle = '#000000';
  ctx.fillRect((modX + 2) * moduleSize, (modY + 2) * moduleSize, 3 * moduleSize, 3 * moduleSize);
}

/**
 * Gera um Canvas quadrado de altíssimo contraste (QR Code + Marcas Assimétricas de Rastreamento 6DoF)
 * otimizado para o algoritmo de Image Tracking do Meta Quest 3 (WebXR).
 */
export function generateCornerQrCanvas(cornerIndex, sizePx = 1024) {
  const corner = FLOOR_QR_CORNERS[cornerIndex] || FLOOR_QR_CORNERS[0];
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d');

  // Fundo branco puro (Quiet Zone essencial para leitura em câmeras de rastreamento)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sizePx, sizePx);

  // Grade de 29x29 módulos (Versão 3 de QR Code com zonas de orientação assimétricas)
  const gridCells = 29;
  const margin = Math.round(sizePx * 0.06);
  const innerSize = sizePx - margin * 2;
  const mod = innerSize / gridCells;

  // Moldura externa preta sólida fina para gabarito de 20cm x 20cm
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(4, Math.round(sizePx * 0.008));
  ctx.strokeRect(margin * 0.35, margin * 0.35, sizePx - margin * 0.7, sizePx - margin * 0.7);

  ctx.save();
  ctx.translate(margin, margin);

  const rand = createSeededRandom(corner.seed);

  // Matriz de ocupação para reservar áreas fixas (Finder Patterns, Timing Patterns, Seta Norte e Centro)
  const reserved = Array.from({ length: gridCells }, () => Array(gridCells).fill(false));

  const markReserved = (x0, y0, w, h) => {
    for (let y = Math.max(0, y0); y < Math.min(gridCells, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(gridCells, x0 + w); x++) {
        reserved[y][x] = true;
      }
    }
  };

  // Reserva os 3 Finder Patterns clássicos do QR Code (Topo-Esq, Topo-Dir, Base-Esq)
  markReserved(0, 0, 8, 8);
  markReserved(gridCells - 8, 0, 8, 8);
  markReserved(0, gridCells - 8, 8, 8);

  // Reserva o canto Base-Direita para um alvo assimétrico exclusivo do canto (evita ambiguidade de 180°)
  markReserved(gridCells - 8, gridCells - 8, 8, 8);

  // Reserva o centro (9x9) para o selo numérico + seta de orientação de alto contraste
  markReserved(10, 10, 9, 9);

  // Preenche células de dados QR determinísticas de alto contraste
  ctx.fillStyle = '#000000';
  for (let y = 0; y < gridCells; y++) {
    for (let x = 0; x < gridCells; x++) {
      // Timing patterns na linha 6 e coluna 6
      if ((y === 6 || x === 6) && !reserved[y][x]) {
        if ((x + y) % 2 === 0) {
          ctx.fillRect(x * mod, y * mod, Math.ceil(mod), Math.ceil(mod));
        }
        reserved[y][x] = true;
        continue;
      }

      if (reserved[y][x]) continue;

      if (rand() > 0.47) {
        ctx.fillRect(x * mod, y * mod, Math.ceil(mod), Math.ceil(mod));
        // Adiciona sub-detalhe de canto em algumas células para enriquecer features ORB/FAST do Quest 3
        if (rand() > 0.72) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect((x + 0.3) * mod, (y + 0.3) * mod, mod * 0.4, mod * 0.4);
          ctx.fillStyle = '#000000';
        }
      }
    }
  }

  // Desenha os 3 Finder Patterns padrão de QR Code
  drawFinderPattern(ctx, 0, 0, mod);
  drawFinderPattern(ctx, gridCells - 7, 0, mod);
  drawFinderPattern(ctx, 0, gridCells - 7, mod);

  // Desenha marcador assimétrico no canto inferior direito (diferente para cada um dos 4 cantos!)
  const brX = (gridCells - 7) * mod;
  const brY = (gridCells - 7) * mod;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(brX + 3.5 * mod, brY + 3.5 * mod, 3.4 * mod, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(brX + 3.5 * mod, brY + 3.5 * mod, 2.1 * mod, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000000';
  // Quadrante preenchido depende do índice do canto (0..3)
  const startAngle = (cornerIndex * Math.PI) / 2;
  ctx.beginPath();
  ctx.moveTo(brX + 3.5 * mod, brY + 3.5 * mod);
  ctx.arc(brX + 3.5 * mod, brY + 3.5 * mod, 2.1 * mod, startAngle, startAngle + Math.PI * 0.85);
  ctx.closePath();
  ctx.fill();

  // Desenha o bloco central (9x9 módulos) com Seta de Orientação (-Z) e Número do Canto (1 a 4)
  const cX = 10 * mod;
  const cY = 10 * mod;
  const cSize = 9 * mod;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cX, cY, cSize, cSize);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(4, mod * 0.55);
  ctx.strokeRect(cX + mod * 0.3, cY + mod * 0.3, cSize - mod * 0.6, cSize - mod * 0.6);

  // Triângulo / Seta preta apontando para o TOPO (-Z = Fundo da Sala)
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.moveTo(cX + cSize * 0.5, cY + mod * 0.9);
  ctx.lineTo(cX + cSize * 0.82, cY + mod * 3.3);
  ctx.lineTo(cX + cSize * 0.18, cY + mod * 3.3);
  ctx.closePath();
  ctx.fill();

  // Número grande do Canto (1, 2, 3 ou 4)
  ctx.fillStyle = '#000000';
  ctx.font = `900 ${Math.round(mod * 4.4)}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(cornerIndex + 1), cX + cSize * 0.5, cY + mod * 6.2);

  ctx.restore();
  return canvas;
}

/**
 * Sistema de Ancoragem Física dos 4 Cantos da Sala via QR Code (WebXR Image Tracking).
 * Se nenhum QR Code for detectado (ou se o navegador não estiver com image-tracking ativo),
 * `isAnchored` permanece `false` e o jogo funciona exatamente como antes.
 */
export class FloorQrAnchorSystem {
  constructor() {
    this.isAnchored = false;
    this.trackedBitmaps = [];
    this.detectedCorners = new Map(); // index (0..3) -> { x, y, z, fx, fz, lastSeenTime }
    this.computedRigPosition = new THREE.Vector3(0, 0, 1.45);
    this.computedRigRotationY = 0;

    this._tempPos = new THREE.Vector3();
    this._tempQuat = new THREE.Quaternion();
    this._tempForward = new THREE.Vector3();
  }

  /**
   * Prepara os 4 ImageBitmaps para passar em `trackedImages` do `navigator.xr.requestSession`.
   */
  async prepareTrackedImages() {
    if (this.trackedBitmaps.length === 4) {
      return this.trackedBitmaps;
    }
    if (typeof createImageBitmap !== 'function') {
      return [];
    }

    try {
      const list = [];
      for (let i = 0; i < FLOOR_QR_CORNERS.length; i++) {
        const canvas = generateCornerQrCanvas(i, 512);
        const bitmap = await createImageBitmap(canvas);
        list.push({
          image: bitmap,
          widthInMeters: QR_PHYSICAL_SIZE_METERS
        });
      }
      this.trackedBitmaps = list;
      return list;
    } catch (err) {
      console.warn('Não foi possível criar ImageBitmaps para QR Codes:', err);
      return [];
    }
  }

  /**
   * Retorna quantos dos 4 QR Codes de chão já foram reconhecidos na sessão.
   */
  getDetectedCount() {
    return this.detectedCorners.size;
  }

  /**
   * Retorna array booleano [c0, c1, c2, c3] indicando quais cantos já foram lidos.
   */
  getDetectedCornerFlags() {
    return [
      this.detectedCorners.has(0),
      this.detectedCorners.has(1),
      this.detectedCorners.has(2),
      this.detectedCorners.has(3)
    ];
  }

  /**
   * Processa os resultados de `frame.getImageTrackingResults()` a cada frame WebXR.
   * Atualiza automaticamente o alinhamento do `playerRig` se pelo menos 1 QR Code for lido.
   */
  updateFromXRFrame(frame, renderer, playerRig, elapsed, onCornerDetected = null) {
    if (!frame || typeof frame.getImageTrackingResults !== 'function') {
      return false;
    }

    let results;
    try {
      results = frame.getImageTrackingResults();
    } catch {
      return false;
    }

    if (!results || results.length === 0) {
      return false;
    }

    const refSpace = renderer.xr.getReferenceSpace();
    if (!refSpace) return false;

    let anyUpdatedThisFrame = false;

    for (const result of results) {
      const idx = result.index;
      if (idx < 0 || idx >= FLOOR_QR_CORNERS.length) continue;

      // Aceita imagens ativamente rastreadas ('tracked') ou recém-medidas ('emulated' logo após leitura)
      if (result.trackingState !== 'tracked' && result.trackingState !== 'emulated') {
        continue;
      }

      const pose = frame.getPose(result.imageSpace, refSpace);
      if (!pose) continue;

      const p = pose.transform.position;
      const o = pose.transform.orientation;

      this._tempPos.set(p.x, p.y, p.z);
      this._tempQuat.set(o.x, o.y, o.z, o.w);

      // No WebXR imageSpace, o topo da imagem aponta para -Z local da imagem.
      // Projetamos esse vetor no plano horizontal XZ do chão.
      this._tempForward.set(0, 0, -1).applyQuaternion(this._tempQuat);
      this._tempForward.y = 0;
      if (this._tempForward.lengthSq() > 0.0001) {
        this._tempForward.normalize();
      } else {
        this._tempForward.set(0, 0, -1);
      }

      const isNewCorner = !this.detectedCorners.has(idx);
      const prev = this.detectedCorners.get(idx);

      if (!prev || result.trackingState === 'tracked') {
        // Suaviza leitura contínua para evitar trepidação
        const alpha = prev ? 0.25 : 1.0;
        const nextEntry = {
          x: prev ? THREE.MathUtils.lerp(prev.x, this._tempPos.x, alpha) : this._tempPos.x,
          y: prev ? THREE.MathUtils.lerp(prev.y, this._tempPos.y, alpha) : this._tempPos.y,
          z: prev ? THREE.MathUtils.lerp(prev.z, this._tempPos.z, alpha) : this._tempPos.z,
          fx: prev ? THREE.MathUtils.lerp(prev.fx, this._tempForward.x, alpha) : this._tempForward.x,
          fz: prev ? THREE.MathUtils.lerp(prev.fz, this._tempForward.z, alpha) : this._tempForward.z,
          lastSeenTime: elapsed
        };
        this.detectedCorners.set(idx, nextEntry);
        anyUpdatedThisFrame = true;

        if (isNewCorner && typeof onCornerDetected === 'function') {
          onCornerDetected(idx, this.detectedCorners.size);
        }
      }
    }

    if (anyUpdatedThisFrame && this.detectedCorners.size > 0) {
      this._recomputeRoomTransform();
      this.applyAnchorToRig(playerRig, true);
      return true;
    }

    return false;
  }

  /**
   * Calcula a transformação rígida 2D ótima (Rotação Y + Translação X/Y/Z)
   * que mapeia os QR Codes lidos no chão físico (`local-floor`) para os 4 cantos
   * exatos da sala virtual de 4,0m x 1,5m.
   */
  _recomputeRoomTransform() {
    const entries = Array.from(this.detectedCorners.entries());
    const n = entries.length;
    if (n === 0) return;

    let yaw = 0;
    let tx = 0;
    let tz = 0;
    let sumY = 0;

    if (n === 1) {
      // Com 1 QR Code lido: usa a posição do canto + a direção da seta impressa no QR Code
      const [idx, obs] = entries[0];
      const target = FLOOR_QR_CORNERS[idx];

      // O vetor (obs.fx, obs.fz) deve apontar para (0, -1) na sala
      yaw = Math.atan2(obs.fx, -obs.fz);
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);

      tx = target.roomX - (obs.x * cosY + obs.z * sinY);
      tz = target.roomZ - (-obs.x * sinY + obs.z * cosY);
      sumY = obs.y;
    } else {
      // Com 2, 3 ou os 4 QR Codes lidos: Alinhamento de Procrustes / Kabsch 2D entre os cantos!
      let meanAx = 0;
      let meanAz = 0;
      let meanBx = 0;
      let meanBz = 0;

      for (const [idx, obs] of entries) {
        const target = FLOOR_QR_CORNERS[idx];
        meanAx += obs.x;
        meanAz += obs.z;
        meanBx += target.roomX;
        meanBz += target.roomZ;
        sumY += obs.y;
      }

      meanAx /= n;
      meanAz /= n;
      meanBx /= n;
      meanBz /= n;

      let num = 0;
      let den = 0;

      for (const [idx, obs] of entries) {
        const target = FLOOR_QR_CORNERS[idx];
        const dxA = obs.x - meanAx;
        const dzA = obs.z - meanAz;
        const dxB = target.roomX - meanBx;
        const dzB = target.roomZ - meanBz;

        num += dxB * dzA - dzB * dxA;
        den += dxB * dxA + dzB * dzA;
      }

      yaw = Math.atan2(num, den);
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);

      tx = meanBx - (meanAx * cosY + meanAz * sinY);
      tz = meanBz - (-meanAx * sinY + meanAz * cosY);
    }

    // Ajuste fino de altura do piso caso o QR Code esteja no chão próximo de Y = 0
    const avgY = sumY / n;
    const ty = Math.abs(avgY) < 0.30 ? -avgY : 0;

    this.computedRigPosition.set(tx, ty, tz);
    this.computedRigRotationY = yaw;
    this.isAnchored = true;
  }

  /**
   * Aplica a transformação calculada pelos QR Codes ao `playerRig`.
   */
  applyAnchorToRig(playerRig, smooth = false) {
    if (!this.isAnchored) return false;

    if (smooth) {
      playerRig.position.lerp(this.computedRigPosition, 0.35);
      // Interpolação angular curta para evitar salto brusco ao ler o 2º/3º/4º QR Code
      const diff = Math.atan2(
        Math.sin(this.computedRigRotationY - playerRig.rotation.y),
        Math.cos(this.computedRigRotationY - playerRig.rotation.y)
      );
      playerRig.rotation.y += diff * 0.35;
    } else {
      playerRig.position.copy(this.computedRigPosition);
      playerRig.rotation.set(0, this.computedRigRotationY, 0);
    }
    return true;
  }

  /**
   * Limpa os QR Codes lidos caso o operador queira voltar para o modo manual sem QR Code.
   */
  clearAnchors() {
    this.detectedCorners.clear();
    this.isAnchored = false;
  }
}

