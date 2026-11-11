import * as THREE from 'three';

/**
 * Textura procedural do estofamento xadrez azul-acinzentado clássico dos bancos
 * da cabine do Expresso de Hogwarts (conforme imagem de referência).
 */
function createPlaidUpholsteryTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Base azul-ardósia escuro
  ctx.fillStyle = '#2b3a4a';
  ctx.fillRect(0, 0, 256, 256);

  const step = 16;
  for (let y = 0; y < 256; y += step) {
    for (let x = 0; x < 256; x += step) {
      // Padrão xadrez / houndstooth sutil
      ctx.fillStyle = (x / step + y / step) % 2 === 0 ? '#36495e' : '#23303d';
      ctx.fillRect(x, y, step, step);

      ctx.fillStyle = 'rgba(75, 110, 145, 0.35)';
      ctx.fillRect(x + 2, y + 2, step - 6, 3);
      ctx.fillRect(x + 2, y + 2, 3, step - 6);

      ctx.fillStyle = 'rgba(18, 24, 32, 0.45)';
      ctx.fillRect(x + step - 4, y, 2, step);
      ctx.fillRect(x, y + step - 4, step, 2);
    }
  }

  // Costuras verticais dos gomos do estofado
  ctx.strokeStyle = 'rgba(12, 18, 24, 0.55)';
  ctx.lineWidth = 3;
  for (let x = 32; x < 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

/**
 * Textura de madeira envernizada quente para as molduras da cabine de trem
 */
function createCabinWoodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#5a3218');
  grad.addColorStop(0.5, '#6e3f20');
  grad.addColorStop(1, '#472610');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 48; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(30, 14, 5, 0.22)' : 'rgba(120, 72, 36, 0.16)';
    ctx.fillRect(0, i * 5.3, 256, 2.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Textura dos quadros vintage em sépia nas paredes da cabine
 */
function createVintagePictureTexture(variant = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');

  // Passe-partout creme envelhecido
  ctx.fillStyle = '#e5dccb';
  ctx.fillRect(0, 0, 256, 192);

  // Foto em sépia interna
  const skyGrad = ctx.createLinearGradient(0, 20, 0, 172);
  skyGrad.addColorStop(0, '#d8ccb8');
  skyGrad.addColorStop(0.6, '#b5a186');
  skyGrad.addColorStop(1, '#4a3b2c');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(22, 20, 212, 152);

  ctx.fillStyle = '#3b2d20';
  if (variant === 0) {
    // Silhueta de castelo / catedral antiga como na foto
    ctx.fillRect(22, 125, 212, 47);
    // Torres e domos
    ctx.beginPath();
    ctx.arc(110, 115, 22, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(88, 115, 44, 20);
    ctx.fillRect(65, 85, 12, 45);
    ctx.fillRect(150, 92, 14, 40);
    ctx.fillRect(175, 102, 18, 30);
  } else {
    // Viaduto ferroviário mágico entre montanhas
    ctx.beginPath();
    ctx.moveTo(22, 140);
    ctx.lineTo(85, 95);
    ctx.lineTo(155, 130);
    ctx.lineTo(234, 88);
    ctx.lineTo(234, 172);
    ctx.lineTo(22, 172);
    ctx.closePath();
    ctx.fill();

    // Arcos do viaduto
    ctx.fillStyle = '#2a1f16';
    ctx.fillRect(35, 122, 185, 8);
    for (let x = 42; x < 210; x += 26) {
      ctx.fillRect(x, 128, 8, 36);
    }
  }

  ctx.strokeStyle = '#5c4632';
  ctx.lineWidth = 2;
  ctx.strokeRect(22, 20, 212, 152);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Textura do espelho bisotado com brasão branco central (como na foto)
 */
function createCabinMirrorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 256, 160);
  grad.addColorStop(0, '#6c767d');
  grad.addColorStop(0.45, '#9aa5ad');
  grad.addColorStop(0.55, '#b8c2c9');
  grad.addColorStop(1, '#586269');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 160);

  // Reflexo sutil da janela na superfície do espelho
  ctx.fillStyle = 'rgba(255, 248, 225, 0.16)';
  ctx.fillRect(18, 14, 95, 132);
  ctx.fillRect(125, 14, 95, 132);

  // Borda bisotada do espelho
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 244, 148);

  // Emblema circular branco/prateado no centro do espelho (idêntico à foto)
  ctx.fillStyle = 'rgba(245, 245, 248, 0.88)';
  ctx.beginPath();
  ctx.ellipse(128, 88, 16, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8b939c';
  ctx.lineWidth = 2;
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Textura do medalhão circular metálico de ventilação ("+") ao lado da janela
 */
function createVentMedallionTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 128, 128);

  // Disco metálico escovado
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 58);
  grad.addColorStop(0, '#d8d6d0');
  grad.addColorStop(0.75, '#b4b1aa');
  grad.addColorStop(1, '#7c7972');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#5c5954';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Recorte em cruz "+" no centro (como na foto)
  ctx.fillStyle = '#232220';
  ctx.fillRect(57, 36, 14, 56);
  ctx.fillRect(36, 57, 56, 14);

  // Botão central
  ctx.fillStyle = '#c8c4bc';
  ctx.beginPath();
  ctx.arc(64, 64, 9, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Constrói a Cabine de Trem em 3D inspirada na foto de referência.
 *
 * Orientação para o jogador sentado em (X = 0, Y = 1.18, Z = 1.45) olhando para -Z:
 * - Banco traseiro (onde o usuário está sentado): encosto em Z = +1.78m, assento em Z = +1.45m
 * - Banco frontal (à frente do usuário): encosto em Z = +0.14m, assento em Z = +0.47m
 * - Parede esquerda (X = -0.96m): Janela panorâmica da cabine reproduzindo /video/Visao_Trem.mp4
 * - Parede direita (X = +0.96m): Porta de madeira e vidro do corredor do vagão
 */
export function createTrainCabin(scene, windowVideoTexture) {
  const cabinGroup = new THREE.Group();
  scene.add(cabinGroup);

  const plaidTex = createPlaidUpholsteryTexture();
  const woodTex = createCabinWoodTexture();
  const mirrorTex = createCabinMirrorTexture();
  const picTex0 = createVintagePictureTexture(0);
  const picTex1 = createVintagePictureTexture(1);
  const ventTex = createVentMedallionTexture();

  // Dimensões internas da cabine ao redor do usuário sentado (Z = 1.45m)
  const cabinWidth = 1.92;   // X de -0.96m (janela à esquerda) até +0.96m (porta à direita)
  const cabinZFront = 0.14;  // Parede à frente do usuário
  const cabinZBack = 1.78;   // Parede atrás do usuário sentado
  const cabinCenterZ = (cabinZFront + cabinZBack) / 2; // 0.96m
  const cabinDepth = cabinZBack - cabinZFront;         // 1.64m
  const cabinHeight = 2.18;

  const creamWallMat = new THREE.MeshStandardMaterial({
    color: 0xdfd5c5,
    roughness: 0.82,
    metalness: 0.04
  });

  const lowerPanelMat = new THREE.MeshStandardMaterial({
    color: 0x252d35,
    roughness: 0.9
  });

  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.55,
    metalness: 0.08
  });

  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xc4c9ce,
    roughness: 0.32,
    metalness: 0.78
  });

  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x7c8288,
    roughness: 0.4,
    metalness: 0.65
  });

  const upholsteryMat = new THREE.MeshStandardMaterial({
    map: plaidTex,
    roughness: 0.85,
    metalness: 0.02
  });

  // ==========================================================================
  // 1. PISO CARPETADO ESCURO E TETO DA CABINE
  // ==========================================================================
  const floorGeo = new THREE.PlaneGeometry(cabinWidth, cabinDepth);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1e2226,
    roughness: 0.95
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.set(0, 0.012, cabinCenterZ);
  cabinGroup.add(floorMesh);

  const ceilingGeo = new THREE.PlaneGeometry(cabinWidth, cabinDepth);
  ceilingGeo.rotateX(Math.PI / 2);
  const ceilingMesh = new THREE.Mesh(ceilingGeo, creamWallMat);
  ceilingMesh.position.set(0, cabinHeight, cabinCenterZ);
  cabinGroup.add(ceilingMesh);

  // Luminária / Plafon retangular metálico no centro do teto (visível no topo da foto)
  const ceilingFixture = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.04, 0.22),
    metalMat
  );
  ceilingFixture.position.set(-0.35, cabinHeight - 0.02, cabinCenterZ);
  cabinGroup.add(ceilingFixture);

  // ==========================================================================
  // 2. BANCOS ESTOFADOS FRENTE A FRENTE (TRASEIRO E FRONTAL)
  // ==========================================================================
  function createCompartmentBench(zWall, facingDir) {
    // facingDir = -1 para o banco traseiro (olhando para -Z)
    // facingDir = +1 para o banco frontal (olhando para +Z)
    const benchGroup = new THREE.Group();
    const benchW = cabinWidth - 0.06;

    // Base inferior sob o assento
    const baseBox = new THREE.Mesh(
      new THREE.BoxGeometry(benchW, 0.34, 0.50),
      lowerPanelMat
    );
    baseBox.position.set(0, 0.18, zWall + facingDir * 0.26);
    benchGroup.add(baseBox);

    // Assento estofado principal
    const seatCushion = new THREE.Mesh(
      new THREE.BoxGeometry(benchW, 0.13, 0.54),
      upholsteryMat
    );
    seatCushion.position.set(0, 0.41, zWall + facingDir * 0.29);
    benchGroup.add(seatCushion);

    // Borda frontal arredondada do assento
    const frontRollGeo = new THREE.CylinderGeometry(0.062, 0.062, benchW, 16);
    frontRollGeo.rotateZ(Math.PI / 2);
    const frontRoll = new THREE.Mesh(frontRollGeo, upholsteryMat);
    frontRoll.position.set(0, 0.41, zWall + facingDir * 0.55);
    benchGroup.add(frontRoll);

    // Encosto lombar e superior levemente inclinado
    const backrestMain = new THREE.Mesh(
      new THREE.BoxGeometry(benchW, 0.68, 0.14),
      upholsteryMat
    );
    backrestMain.position.set(0, 0.78, zWall + facingDir * 0.09);
    backrestMain.rotation.x = facingDir * 0.08;
    benchGroup.add(backrestMain);

    // Encosto de cabeça estofado saliente no topo do banco
    const headrestRollGeo = new THREE.CylinderGeometry(0.075, 0.075, benchW, 16);
    headrestRollGeo.rotateZ(Math.PI / 2);
    const headrestRoll = new THREE.Mesh(headrestRollGeo, upholsteryMat);
    headrestRoll.position.set(0, 1.11, zWall + facingDir * 0.08);
    benchGroup.add(headrestRoll);

    // Divisórias de braço / apoio lateral entre os 3 lugares do banco (como na foto)
    [-0.62, -0.20, 0.22, 0.64].forEach((xDiv) => {
      // Apoio vertical macio no encosto
      const bolster = new THREE.Mesh(
        new THREE.BoxGeometry(0.085, 0.38, 0.15),
        upholsteryMat
      );
      bolster.position.set(xDiv, 0.68, zWall + facingDir * 0.16);
      bolster.rotation.x = facingDir * 0.1;
      benchGroup.add(bolster);
    });

    // Apoios de braço junto à parede da janela (esquerda) e da porta (direita)
    [-benchW / 2 + 0.06, benchW / 2 - 0.06].forEach((xArm) => {
      const armRest = new THREE.Mesh(
        new THREE.BoxGeometry(0.10, 0.08, 0.38),
        upholsteryMat
      );
      armRest.position.set(xArm, 0.54, zWall + facingDir * 0.30);
      benchGroup.add(armRest);
    });

    // Almofadas laterais de canto junto à janela (visíveis na foto ao lado da moldura)
    const windowCornerPad = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.56, 0.22),
      upholsteryMat
    );
    windowCornerPad.position.set(-cabinWidth / 2 + 0.035, 0.88, zWall + facingDir * 0.14);
    benchGroup.add(windowCornerPad);

    return benchGroup;
  }

  // Banco onde o usuário está sentado (costas em Z = 1.78m, olhando para -Z)
  const playerBench = createCompartmentBench(cabinZBack, -1);
  cabinGroup.add(playerBench);

  // Banco à frente do usuário (costas em Z = 0.14m, olhando para +Z)
  const oppositeBench = createCompartmentBench(cabinZFront, 1);
  cabinGroup.add(oppositeBench);

  // Adereços mágicos sobre os bancos (livros, tabuleiro xadrez, pomo dourado e fita como na foto!)
  function addSeatProps(xPos, zPos, rotY) {
    const propGroup = new THREE.Group();
    propGroup.position.set(xPos, 0.485, zPos);
    propGroup.rotation.y = rotY;

    // Revista / Tabuleiro xadrez bruxo
    const magazine = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.015, 0.17),
      new THREE.MeshStandardMaterial({ color: 0xd8d2c5, roughness: 0.7 })
    );
    magazine.rotation.y = 0.25;
    propGroup.add(magazine);

    // Livro de capa escura
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.025, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x3b2f26, roughness: 0.8 })
    );
    book.position.set(0.08, 0.012, -0.06);
    book.rotation.y = -0.35;
    propGroup.add(book);

    // Fita / cachecol laranja-dourado sobre o banco
    const ribbon = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.012, 0.032),
      new THREE.MeshStandardMaterial({ color: 0xd9531e, roughness: 0.5 })
    );
    ribbon.position.set(-0.04, 0.014, 0.04);
    ribbon.rotation.y = 0.45;
    propGroup.add(ribbon);

    // Doces / Pomo de Ouro brilhante
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf5d061,
      roughness: 0.25,
      metalness: 0.8,
      emissive: 0x8a6200,
      emissiveIntensity: 0.25
    });
    [-0.05, 0.0, 0.04].forEach((ox, idx) => {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 12), goldMat);
      orb.position.set(ox, 0.022, (idx - 1) * 0.03);
      propGroup.add(orb);
    });

    cabinGroup.add(propGroup);
  }

  // Adereços no banco da frente e no canto esquerdo do banco do usuário (idêntico à foto)
  addSeatProps(-0.48, 0.44, 0.3);
  addSeatProps(-0.52, 1.46, -0.4);

  // ==========================================================================
  // 3. PAREDES FRONTAL (Z = 0.14m) E TRASEIRA (Z = 1.78m) COM ESPELHOS,
  //    QUADROS, ARANDELAS ILUMINADAS E BAGAGEIROS METÁLICOS
  // ==========================================================================
  const sconceLights = [];
  const sconceBulbMats = [];

  function populateBenchWall(zWall, normalDir) {
    const wallGroup = new THREE.Group();

    // Painel creme superior da parede
    const upperWall = new THREE.Mesh(
      new THREE.PlaneGeometry(cabinWidth, cabinHeight - 1.10),
      creamWallMat
    );
    upperWall.position.set(0, 1.10 + (cabinHeight - 1.10) / 2, zWall);
    if (normalDir < 0) upperWall.rotation.y = Math.PI;
    wallGroup.add(upperWall);

    // Friso horizontal de madeira nobre acima do encosto do banco
    const woodRail = new THREE.Mesh(
      new THREE.BoxGeometry(cabinWidth, 0.055, 0.045),
      woodMat
    );
    woodRail.position.set(0, 1.16, zWall + normalDir * 0.02);
    wallGroup.add(woodRail);

    // Friso de madeira superior junto ao teto
    const topWoodRail = new THREE.Mesh(
      new THREE.BoxGeometry(cabinWidth, 0.045, 0.04),
      woodMat
    );
    topWoodRail.position.set(0, cabinHeight - 0.03, zWall + normalDir * 0.015);
    wallGroup.add(topWoodRail);

    // Espelho central retangular bisotado (exatamente como nas laterais da foto)
    const mirrorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.56, 0.34),
      new THREE.MeshStandardMaterial({
        map: mirrorTex,
        roughness: 0.18,
        metalness: 0.65
      })
    );
    mirrorMesh.position.set(0, 1.48, zWall + normalDir * 0.018);
    if (normalDir < 0) mirrorMesh.rotation.y = Math.PI;
    wallGroup.add(mirrorMesh);

    // Quadros em sépia com moldura de madeira nos dois lados da parede
    [-0.68, 0.68].forEach((xPic, idx) => {
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.27, 0.022),
        woodMat
      );
      frame.position.set(xPic, 1.48, zWall + normalDir * 0.015);
      wallGroup.add(frame);

      const art = new THREE.Mesh(
        new THREE.PlaneGeometry(0.30, 0.23),
        new THREE.MeshBasicMaterial({ map: idx === 0 ? picTex0 : picTex1 })
      );
      art.position.set(xPic, 1.48, zWall + normalDir * 0.028);
      if (normalDir < 0) art.rotation.y = Math.PI;
      wallGroup.add(art);
    });

    // Arandelas de luz quente (Luminárias de parede entre os quadros e o espelho)
    [-0.41, 0.41].forEach((xLamp) => {
      const sconceGroup = new THREE.Group();
      sconceGroup.position.set(xLamp, 1.46, zWall + normalDir * 0.02);

      // Base oval de madeira/latão na parede
      const backplate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 0.02, 16).rotateX(Math.PI / 2),
        woodMat
      );
      sconceGroup.add(backplate);

      // Cúpula translúcida branco-quente brilhante
      const shadeMat = new THREE.MeshBasicMaterial({
        color: 0xfff3d1
      });
      sconceBulbMats.push(shadeMat);

      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.075, 0.11, 16, 1, true),
        shadeMat
      );
      shade.position.set(0, 0.01, normalDir * 0.065);
      shade.rotation.x = normalDir * 0.25;
      sconceGroup.add(shade);

      wallGroup.add(sconceGroup);
    });

    // Bagageiro metálico superior (Luggage Rack com suportes curvos prateados como na foto)
    const rackGroup = new THREE.Group();
    const rackY = 1.88;
    const rackDepth = 0.28;
    const rackZ = zWall + normalDir * (rackDepth / 2 + 0.02);

    // Barras longitudinais do bagageiro
    const frontBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, cabinWidth - 0.18, 10).rotateZ(Math.PI / 2),
      metalMat
    );
    frontBar.position.set(0, rackY, zWall + normalDir * rackDepth);
    rackGroup.add(frontBar);

    const backBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, cabinWidth - 0.18, 10).rotateZ(Math.PI / 2),
      metalMat
    );
    backBar.position.set(0, rackY - 0.02, zWall + normalDir * 0.04);
    rackGroup.add(backBar);

    // Grade metálica do bagageiro
    const meshPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(cabinWidth - 0.22, rackDepth - 0.04).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x9aa0a6,
        wireframe: true,
        transparent: true,
        opacity: 0.45
      })
    );
    meshPlane.position.set(0, rackY - 0.01, rackZ);
    rackGroup.add(meshPlane);

    // Suportes metálicos inclinados presos na parede
    [-0.65, 0.0, 0.65].forEach((xBrk) => {
      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.34, 8),
        metalMat
      );
      strut.position.set(xBrk, rackY - 0.09, rackZ);
      strut.rotation.x = normalDir * 0.95;
      rackGroup.add(strut);
    });

    wallGroup.add(rackGroup);
    cabinGroup.add(wallGroup);
  }

  populateBenchWall(cabinZFront, 1);
  populateBenchWall(cabinZBack, -1);

  // ==========================================================================
  // 4. PAREDE ESQUERDA (X = -0.96m) — JANELA COM O VÍDEO Visao_Trem.mp4
  // ==========================================================================
  const leftWallX = -cabinWidth / 2;
  const winCenterZ = cabinCenterZ; // 0.96m
  const winCenterY = 1.33;
  const winWidth = 1.06;           // Largura da janela entre os dois bancos
  const winHeight = 0.76;          // Altura da janela

  // 4.1. Tela de Vídeo da Paisagem (Visao_Trem.mp4) logo atrás da moldura da janela
  const videoPlaneGeo = new THREE.PlaneGeometry(winWidth + 0.08, winHeight + 0.06);
  const videoPlaneMat = new THREE.MeshBasicMaterial({
    map: windowVideoTexture,
    color: 0xffffff
  });
  const windowVideoMesh = new THREE.Mesh(videoPlaneGeo, videoPlaneMat);
  windowVideoMesh.rotation.y = Math.PI / 2;
  windowVideoMesh.position.set(leftWallX - 0.03, winCenterY, winCenterZ);
  cabinGroup.add(windowVideoMesh);

  // 4.2. Parede ao redor da janela (para enquadrar perfeitamente o vídeo sem frestas)
  // Abaixo da janela (revestimento escuro)
  const wallBelowWin = new THREE.Mesh(
    new THREE.PlaneGeometry(cabinDepth, 0.95),
    lowerPanelMat
  );
  wallBelowWin.rotation.y = Math.PI / 2;
  wallBelowWin.position.set(leftWallX, 0.475, cabinCenterZ);
  cabinGroup.add(wallBelowWin);

  // Acima da janela (creme)
  const topStripH = cabinHeight - (winCenterY + winHeight / 2);
  const wallAboveWin = new THREE.Mesh(
    new THREE.PlaneGeometry(cabinDepth, topStripH),
    creamWallMat
  );
  wallAboveWin.rotation.y = Math.PI / 2;
  wallAboveWin.position.set(leftWallX, cabinHeight - topStripH / 2, cabinCenterZ);
  cabinGroup.add(wallAboveWin);

  // Colunas creme à esquerda e à direita da janela (entre a janela e os bancos)
  const sideColW = (cabinDepth - winWidth) / 2;
  [-1, 1].forEach((dir) => {
    const colZ = cabinCenterZ + dir * (winWidth / 2 + sideColW / 2);
    const sideCol = new THREE.Mesh(
      new THREE.PlaneGeometry(sideColW, winHeight),
      creamWallMat
    );
    sideCol.rotation.y = Math.PI / 2;
    sideCol.position.set(leftWallX, winCenterY, colZ);
    cabinGroup.add(sideCol);

    // Medalhão circular metálico "+" de ventilação (idêntico à foto!)
    const ventDisc = new THREE.Mesh(
      new THREE.PlaneGeometry(0.11, 0.11),
      new THREE.MeshStandardMaterial({
        map: ventTex,
        transparent: true,
        roughness: 0.4,
        metalness: 0.6
      })
    );
    ventDisc.rotation.y = Math.PI / 2;
    ventDisc.position.set(leftWallX + 0.006, winCenterY + 0.14, colZ);
    cabinGroup.add(ventDisc);

    // Plaquinha branca de aviso abaixo do medalhão
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.042),
      new THREE.MeshBasicMaterial({ color: 0xf2ece1 })
    );
    plaque.rotation.y = Math.PI / 2;
    plaque.position.set(leftWallX + 0.006, winCenterY + 0.03, colZ);
    cabinGroup.add(plaque);
  });

  // 4.3. Moldura de Madeira Nobre ao redor da Janela (como na foto)
  const frameDepth = 0.05;
  const frameThick = 0.045;

  const woodTop = new THREE.Mesh(
    new THREE.BoxGeometry(frameDepth, frameThick, winWidth + frameThick * 2),
    woodMat
  );
  woodTop.position.set(leftWallX + 0.005, winCenterY + winHeight / 2 + frameThick / 2, winCenterZ);

  const woodBottom = new THREE.Mesh(
    new THREE.BoxGeometry(frameDepth + 0.02, frameThick, winWidth + frameThick * 2 + 0.04),
    woodMat
  );
  woodBottom.position.set(leftWallX + 0.01, winCenterY - winHeight / 2 - frameThick / 2, winCenterZ);

  const woodLeft = new THREE.Mesh(
    new THREE.BoxGeometry(frameDepth, winHeight, frameThick),
    woodMat
  );
  woodLeft.position.set(leftWallX + 0.005, winCenterY, winCenterZ + winWidth / 2 + frameThick / 2);

  const woodRight = new THREE.Mesh(
    new THREE.BoxGeometry(frameDepth, winHeight, frameThick),
    woodMat
  );
  woodRight.position.set(leftWallX + 0.005, winCenterY, winCenterZ - winWidth / 2 - frameThick / 2);

  cabinGroup.add(woodTop, woodBottom, woodLeft, woodRight);

  // 4.4. Esquadria Metálica Prateada Interna da Janela (com divisória superior e 3 painéis de ventilação)
  const metalFrameThick = 0.024;
  const innerTop = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, metalFrameThick, winWidth),
    metalMat
  );
  innerTop.position.set(leftWallX + 0.002, winCenterY + winHeight / 2 - metalFrameThick / 2, winCenterZ);

  const innerBottom = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, metalFrameThick, winWidth),
    metalMat
  );
  innerBottom.position.set(leftWallX + 0.002, winCenterY - winHeight / 2 + metalFrameThick / 2, winCenterZ);

  const innerLeft = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, winHeight, metalFrameThick),
    metalMat
  );
  innerLeft.position.set(leftWallX + 0.002, winCenterY, winCenterZ + winWidth / 2 - metalFrameThick / 2);

  const innerRight = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, winHeight, metalFrameThick),
    metalMat
  );
  innerRight.position.set(leftWallX + 0.002, winCenterY, winCenterZ - winWidth / 2 + metalFrameThick / 2);

  // Barra horizontal prateada que separa o vidro principal inferior da báscula superior
  const transomY = winCenterY + winHeight * 0.19;
  const transomBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.032, 0.026, winWidth),
    metalMat
  );
  transomBar.position.set(leftWallX + 0.004, transomY, winCenterZ);

  // 2 divisórias verticais na parte superior (formando os 3 vidros superiores da foto)
  const upperPaneH = winCenterY + winHeight / 2 - transomY;
  const upperPaneCenterY = transomY + upperPaneH / 2;
  [-winWidth * 0.20, winWidth * 0.20].forEach((zOffset) => {
    const vBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, upperPaneH, 0.02),
      darkMetalMat
    );
    vBar.position.set(leftWallX + 0.003, upperPaneCenterY, winCenterZ + zOffset);
    cabinGroup.add(vBar);
  });

  // Trava central metálica na janela superior
  const windowLatch = new THREE.Mesh(
    new THREE.BoxGeometry(0.038, 0.045, 0.035),
    metalMat
  );
  windowLatch.position.set(leftWallX + 0.008, upperPaneCenterY - 0.02, winCenterZ);

  cabinGroup.add(innerTop, innerBottom, innerLeft, innerRight, transomBar, windowLatch);

  // ==========================================================================
  // 5. PAREDE DIREITA (X = +0.96m) — PORTA INTERNA DO CORREDOR DO TREM
  // ==========================================================================
  const rightWallX = cabinWidth / 2;
  const rightWall = new THREE.Mesh(
    new THREE.PlaneGeometry(cabinDepth, cabinHeight),
    creamWallMat
  );
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(rightWallX, cabinHeight / 2, cabinCenterZ);
  cabinGroup.add(rightWall);

  // Porta de madeira de correr da cabine no centro da parede direita
  const doorFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 1.88, 0.74),
    woodMat
  );
  doorFrame.position.set(rightWallX - 0.015, 0.94, cabinCenterZ);
  cabinGroup.add(doorFrame);

  // Vidro fosco escuro na metade superior da porta do corredor
  const doorGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.54, 0.72),
    new THREE.MeshStandardMaterial({
      color: 0x2b3540,
      roughness: 0.25,
      metalness: 0.5
    })
  );
  doorGlass.rotation.y = -Math.PI / 2;
  doorGlass.position.set(rightWallX - 0.032, 1.32, cabinCenterZ);
  cabinGroup.add(doorGlass);

  // Maçaneta dourada da porta da cabine
  const doorHandle = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 })
  );
  doorHandle.position.set(rightWallX - 0.04, 0.92, cabinCenterZ - 0.28);
  cabinGroup.add(doorHandle);

  // ==========================================================================
  // 6. ILUMINAÇÃO INTERNA QUENTE E ACONCHEGANTE DA CABINE
  // ==========================================================================
  const cabinAmbient = new THREE.AmbientLight(0xffe6c2, 0.85);
  cabinGroup.add(cabinAmbient);

  // Luzes pontuais quentes próximas às arandelas de parede e ao centro do teto
  const frontWallLight = new THREE.PointLight(0xffb86c, 1.4, 3.2);
  frontWallLight.position.set(0, 1.52, cabinZFront + 0.22);
  cabinGroup.add(frontWallLight);

  const backWallLight = new THREE.PointLight(0xffb86c, 1.4, 3.2);
  backWallLight.position.set(0, 1.52, cabinZBack - 0.22);
  cabinGroup.add(backWallLight);

  const windowBounceLight = new THREE.PointLight(0xdbeafe, 0.65, 2.8);
  windowBounceLight.position.set(leftWallX + 0.28, winCenterY, winCenterZ);
  cabinGroup.add(windowBounceLight);

  sconceLights.push(frontWallLight, backWallLight);

  function setCabinBrightness(factor) {
    const f = THREE.MathUtils.clamp(factor, 0, 1);
    cabinAmbient.intensity = 0.85 * f;
    frontWallLight.intensity = 1.4 * f;
    backWallLight.intensity = 1.4 * f;
    windowBounceLight.intensity = 0.65 * f;
    videoPlaneMat.color.setScalar(Math.max(0.0, f));
    sconceBulbMats.forEach((m) => {
      m.color.setRGB(1.0 * f, 0.95 * f, 0.82 * f);
    });
  }

  function update(elapsed) {
    if (!cabinGroup.visible) return;
    // Balanço sutil de vagão de trem sob os trilhos (milimétrico para total conforto no VR)
    cabinGroup.position.y = Math.sin(elapsed * 6.5) * 0.0018;
    cabinGroup.rotation.z = Math.sin(elapsed * 2.2) * 0.0022;
  }

  return {
    cabinGroup,
    windowVideoMesh,
    setCabinBrightness,
    update
  };
}

