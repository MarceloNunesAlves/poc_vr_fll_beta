import * as THREE from 'three';

/**
 * Gera texturas procedurais de pedra de castelo e madeira antiga em Canvas
 * para que a sala tenha visual rico de Hogwarts sem depender de downloads externos.
 */
function createStoneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2a2623';
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
      const shade = 34 + Math.floor(Math.random() * 18);
      ctx.fillStyle = `rgb(${shade + 4}, ${shade}, ${shade - 3})`;
      ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3);
  return tex;
}

function createWoodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#3b2314';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(25, 12, 5, 0.25)' : 'rgba(85, 50, 25, 0.18)';
    ctx.fillRect(0, i * 6, 256, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Constrói uma Pena de Pássaro Branca Grande em 3D (para o feitiço Wingardium Leviosa)
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
    emissiveIntensity: 0.25
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
    emissiveIntensity: 0.22
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
 * Cria um modelo 3D de Varinha Mágica
 */
export function createWandMesh(woodColor = 0x5c3317, glowColor = 0xffd700) {
  const wand = new THREE.Group();

  // Cabo entalhado
  const handleGeo = new THREE.CylinderGeometry(0.012, 0.016, 0.11, 12);
  handleGeo.rotateX(Math.PI / 2);
  const handleMat = new THREE.MeshStandardMaterial({
    color: woodColor,
    roughness: 0.45,
    metalness: 0.2
  });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.z = 0.05;
  wand.add(handle);

  // Haste afilada da varinha
  const tipGeo = new THREE.CylinderGeometry(0.004, 0.011, 0.26, 12);
  tipGeo.rotateX(Math.PI / 2);
  const tipMat = new THREE.MeshStandardMaterial({
    color: woodColor,
    roughness: 0.35
  });
  const shaft = new THREE.Mesh(tipGeo, tipMat);
  shaft.position.z = -0.13;
  wand.add(shaft);

  // Esfera luminosa na ponta da varinha
  const orbGeo = new THREE.SphereGeometry(0.012, 16, 16);
  const orbMat = new THREE.MeshBasicMaterial({
    color: glowColor
  });
  const orb = new THREE.Mesh(orbGeo, orbMat);
  orb.position.z = -0.265;
  wand.add(orb);

  wand.userData = { woodColor, glowColor, orb };
  return wand;
}

/**
 * Constrói a Sala de Escola de Bruxos completa
 * Tapete/Corredor central útil: 4,0m de comprimento (Z: -2.0m a +2.0m) por 1,5m de largura (X: -0.75m a +0.75m),
 * expandido visualmente nas laterais com as carteiras de bruxos e paredes de pedra da foto de referência.
 */
export function createWizardClassroom(scene) {
  const roomGroup = new THREE.Group();
  scene.add(roomGroup);

  const stoneTex = createStoneTexture();
  const woodTex = createWoodTexture();

  // Dimensões arquitetônicas:
  // Comprimento exato de 4.0m (Z de -2.0 a +2.0)
  // Corredor central livre de 1.5m (X de -0.75 a +0.75) + nichos laterais para as carteiras (largura total visual 3.2m)
  const roomLength = 4.2;
  const walkableLength = 4.0;
  const walkableWidth = 1.5;
  const visualWidth = 3.2;
  const roomHeight = 3.4;

  // 1. Piso de pedra do castelo
  const floorGeo = new THREE.PlaneGeometry(visualWidth, roomLength);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({
    map: stoneTex,
    roughness: 0.85,
    metalness: 0.05
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  roomGroup.add(floor);

  // 2. Tapete Real da Grifinória demarcando EXATAMENTE os 4,0m x 1,5m da área útil do jogador!
  const carpetGroup = new THREE.Group();
  const carpetGeo = new THREE.PlaneGeometry(walkableWidth, walkableLength);
  carpetGeo.rotateX(-Math.PI / 2);
  const carpetMat = new THREE.MeshStandardMaterial({
    color: 0x580c12,
    roughness: 0.9
  });
  const carpet = new THREE.Mesh(carpetGeo, carpetMat);
  carpet.position.y = 0.005;
  carpetGroup.add(carpet);

  // Bordas douradas do tapete 4m x 1,5m
  const borderMat = new THREE.MeshBasicMaterial({
    color: 0xf5d061,
    side: THREE.DoubleSide
  });
  const leftBorder = new THREE.Mesh(new THREE.PlaneGeometry(0.04, walkableLength).rotateX(-Math.PI / 2), borderMat);
  leftBorder.position.set(-walkableWidth / 2 + 0.03, 0.008, 0);
  const rightBorder = new THREE.Mesh(new THREE.PlaneGeometry(0.04, walkableLength).rotateX(-Math.PI / 2), borderMat);
  rightBorder.position.set(walkableWidth / 2 - 0.03, 0.008, 0);
  const frontBorder = new THREE.Mesh(new THREE.PlaneGeometry(walkableWidth, 0.04).rotateX(-Math.PI / 2), borderMat);
  frontBorder.position.set(0, 0.008, walkableLength / 2 - 0.03);
  const backBorder = new THREE.Mesh(new THREE.PlaneGeometry(walkableWidth, 0.04).rotateX(-Math.PI / 2), borderMat);
  backBorder.position.set(0, 0.008, -walkableLength / 2 + 0.03);
  carpetGroup.add(leftBorder, rightBorder, frontBorder, backBorder);
  roomGroup.add(carpetGroup);

  // 3. Paredes de pedra gótica e teto abobadado
  const wallMat = new THREE.MeshStandardMaterial({
    map: stoneTex,
    roughness: 0.9
  });

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

  // Quadro / Mural de profundidade com a foto de referência da sala de aula de Hogwarts
  const texLoader = new THREE.TextureLoader();
  texLoader.load('/assets/classroom_ref.jpg', (refTex) => {
    refTex.colorSpace = THREE.SRGBColorSpace;
    const muralMat = new THREE.MeshBasicMaterial({
      map: refTex,
      transparent: true,
      opacity: 0.55
    });
    const mural = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.55), muralMat);
    mural.position.set(0, 1.65, -roomLength / 2 + 0.02);
    roomGroup.add(mural);

    // Moldura de arco gótico de madeira ao redor do mural
    const frameMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7 });
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.12, 0.08), frameMat);
    topBar.position.set(0, 2.45, -roomLength / 2 + 0.04);
    roomGroup.add(topBar);
  });

  // Pilares de pedra e janelas góticas nas laterais
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x38322e, roughness: 0.85 });
  const zPositions = [-1.6, -0.5, 0.6, 1.7];
  zPositions.forEach((zPos) => {
    [-visualWidth / 2 + 0.08, visualWidth / 2 - 0.08].forEach((xPos) => {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.18, roomHeight, 0.22), pillarMat);
      pillar.position.set(xPos, roomHeight / 2, zPos);
      roomGroup.add(pillar);
    });
  });

  // Vitrais Góticos Iluminados nas laterais (como na imagem da sala)
  [-1.05, 0.1, 1.15].forEach((zWin) => {
    const winGeo = new THREE.PlaneGeometry(0.55, 1.25);
    const winMat = new THREE.MeshBasicMaterial({
      color: 0x5c85b8,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide
    });
    const winLeft = new THREE.Mesh(winGeo, winMat);
    winLeft.rotation.y = Math.PI / 2;
    winLeft.position.set(-visualWidth / 2 + 0.02, 1.9, zWin);
    roomGroup.add(winLeft);

    const winRight = new THREE.Mesh(winGeo, winMat);
    winRight.rotation.y = -Math.PI / 2;
    winRight.position.set(visualWidth / 2 - 0.02, 1.9, zWin);
    roomGroup.add(winRight);
  });

  // 4. Carteiras de madeira nas laterais (inspiradas na foto da aula)
  const deskMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.65 });
  [-1.0, -0.15].forEach((zDesk) => {
    [-1.12, 1.12].forEach((xDesk) => {
      const studentDesk = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.65), deskMat);
      top.position.y = 0.72;
      const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.72, 0.05), deskMat);
      leg1.position.set(0, 0.36, -0.26);
      const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.72, 0.05), deskMat);
      leg2.position.set(0, 0.36, 0.26);
      studentDesk.add(top, leg1, leg2);

      // Livro aberto na carteira
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.025, 0.28),
        new THREE.MeshStandardMaterial({ color: 0xdfd3b8, roughness: 0.8 })
      );
      book.position.set(0, 0.75, 0);
      studentDesk.add(book);

      studentDesk.position.set(xDesk, 0, zDesk);
      roomGroup.add(studentDesk);
    });
  });

  // 5. CADEIRA DO USUÁRIO (Início da Sala, Z = +1.48m, X = 0)
  // O usuário começa sentado aqui olhando para o fundo da sala (-Z)
  const playerChair = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.46), deskMat);
  seat.position.y = 0.46;
  const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.55, 0.05), deskMat);
  backrest.position.set(0, 0.75, 0.21);
  playerChair.add(seat, backrest);
  [
    [-0.2, -0.2],
    [0.2, -0.2],
    [-0.2, 0.2],
    [0.2, 0.2]
  ].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.46, 8), deskMat);
    leg.position.set(lx, 0.23, lz);
    playerChair.add(leg);
  });
  playerChair.position.set(0, 0, 1.48);
  roomGroup.add(playerChair);

  // 6. MESA DA PROFESSORA (No início da sala, Z = +0.62m, X = -0.32m, próxima ao Luigi!)
  const teacherDesk = new THREE.Group();
  const tdTop = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 0.54), deskMat);
  tdTop.position.y = 0.78;
  const tdBody = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.76, 0.48), deskMat);
  tdBody.position.y = 0.38;
  teacherDesk.add(tdTop, tdBody);

  // Livro antigo de feitiços com capa de couro (como na imagem enviada)
  const spellBook = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.05, 0.20),
    new THREE.MeshStandardMaterial({ color: 0x4a2511, roughness: 0.7 })
  );
  spellBook.position.set(-0.22, 0.835, 0.04);
  spellBook.rotation.y = 0.25;
  teacherDesk.add(spellBook);

  // Gatinho da Professora McGonagall sentado no canto da mesa (referência à foto!)
  const catGroup = new THREE.Group();
  const catMat = new THREE.MeshStandardMaterial({ color: 0x6e6a66, roughness: 0.8 });
  const catBody = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12), catMat);
  catBody.scale.set(0.9, 1.35, 0.9);
  catBody.position.y = 0.09;
  const catHead = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 12), catMat);
  catHead.position.set(0, 0.21, 0.02);
  const earGeo = new THREE.ConeGeometry(0.022, 0.045, 4);
  const earL = new THREE.Mesh(earGeo, catMat);
  earL.position.set(-0.035, 0.265, 0.02);
  const earR = new THREE.Mesh(earGeo, catMat);
  earR.position.set(0.035, 0.265, 0.02);
  catGroup.add(catBody, catHead, earL, earR);
  catGroup.position.set(-0.30, 0.81, -0.14);
  catGroup.rotation.y = 0.4;
  teacherDesk.add(catGroup);

  teacherDesk.position.set(-0.28, 0, 0.62);
  roomGroup.add(teacherDesk);

  // A GRANDE PENA DE PÁSSARO BRANCA pousada sobre a Mesa da Professora
  const { featherGroup, auraRing, vaneMat } = createLargeWhiteFeather();
  const featherRestPos = new THREE.Vector3(-0.18, 0.84, 0.65);
  featherGroup.position.copy(featherRestPos);
  roomGroup.add(featherGroup);

  // 7. MESA DAS VARINHAS no Fundo da Sala (Z = -1.52m, X = -0.34m, ao lado da Letícia!)
  const wandTable = new THREE.Group();
  const wtTop = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.06, 24), deskMat);
  wtTop.position.y = 0.82;
  const wtPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.16, 0.80, 16), deskMat);
  wtPillar.position.y = 0.40;
  // Almofada de veludo carmesim sobre a mesa de varinhas
  const cushion = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.04, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x7a0916, roughness: 0.85 })
  );
  cushion.position.y = 0.86;
  wandTable.add(wtTop, wtPillar, cushion);
  wandTable.position.set(-0.32, 0, -1.52);
  roomGroup.add(wandTable);

  // 3 Varinhas Mágicas selecionáveis sobre a mesa
  const wandsOnTable = [];
  const wandConfigs = [
    { wood: 0x5c3317, glow: 0xffd700, offsetX: -0.16, name: 'Varinha de Fênix Dourada' },
    { wood: 0x2b1b12, glow: 0x60a5fa, offsetX: 0.0, name: 'Varinha Estelar Azul' },
    { wood: 0x8b4513, glow: 0xf472b6, offsetX: 0.16, name: 'Varinha Encantada Rubi' }
  ];

  wandConfigs.forEach((cfg, idx) => {
    const wMesh = createWandMesh(cfg.wood, cfg.glow);
    wMesh.position.set(
      wandTable.position.x + cfg.offsetX,
      0.93,
      wandTable.position.z
    );
    wMesh.rotation.y = Math.PI;
    wMesh.userData.config = cfg;
    wMesh.userData.index = idx;
    roomGroup.add(wMesh);
    wandsOnTable.push(wMesh);
  });

  // 8. Pegadas / Marcadores Luminosos no chão para guiar a caminhada nos 4m
  const pathMarkers = [];
  for (let i = 0; i < 6; i++) {
    const z = 1.15 - i * 0.48;
    const markerGeo = new THREE.RingGeometry(0.08, 0.12, 24);
    markerGeo.rotateX(-Math.PI / 2);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xf5d061,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(0, 0.012, z);
    roomGroup.add(marker);
    pathMarkers.push(marker);
  }

  // 9. Velas Flutuantes no Teto + Iluminação Quente de Castelo
  const candles = [];
  const candleGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8);
  const candleMat = new THREE.MeshBasicMaterial({ color: 0xfff8e7 });
  const flameGeo = new THREE.SphereGeometry(0.024, 8, 8);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb703 });

  for (let i = 0; i < 18; i++) {
    const cGroup = new THREE.Group();
    const wax = new THREE.Mesh(candleGeo, candleMat);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.y = 0.135;
    flame.scale.set(0.8, 1.6, 0.8);
    cGroup.add(wax, flame);

    const cx = (Math.random() - 0.5) * 2.2;
    const cy = 2.25 + Math.random() * 0.75;
    const cz = (Math.random() - 0.5) * 3.6;
    cGroup.position.set(cx, cy, cz);
    cGroup.userData = { baseY: cy, phase: Math.random() * Math.PI * 2 };
    roomGroup.add(cGroup);
    candles.push(cGroup);
  }

  // Luzes principais da sala (controladas pelo fade-in gradual quando o vídeo 360 termina!)
  const ambientLight = new THREE.AmbientLight(0xffe4b5, 0.65);
  roomGroup.add(ambientLight);

  const mainCandleLight = new THREE.PointLight(0xffaa44, 2.2, 7.5);
  mainCandleLight.position.set(0, 2.7, -0.3);
  roomGroup.add(mainCandleLight);

  const backLight = new THREE.PointLight(0xffcf77, 1.8, 5.0);
  backLight.position.set(0, 2.3, -1.5);
  roomGroup.add(backLight);

  const frontLight = new THREE.PointLight(0xffcf77, 1.8, 5.0);
  frontLight.position.set(0, 2.3, 1.0);
  roomGroup.add(frontLight);

  // Função para controlar a intensidade de luz da sala (0 = tudo escuro -> 1 = sala acesa)
  const setRoomBrightness = (factor) => {
    const f = THREE.MathUtils.clamp(factor, 0, 1);
    ambientLight.intensity = 0.75 * f;
    mainCandleLight.intensity = 2.4 * f;
    backLight.intensity = 1.9 * f;
    frontLight.intensity = 1.9 * f;
    candles.forEach((c) => {
      c.visible = f > 0.05;
    });
  };

  return {
    roomGroup,
    playerChair,
    teacherDesk,
    wandTable,
    wandsOnTable,
    featherGroup,
    featherRestPos,
    featherAura: auraRing,
    featherMat: vaneMat,
    pathMarkers,
    candles,
    setRoomBrightness,
    update(elapsed, activePathDirection = 0) {
      // Anima velas flutuantes
      candles.forEach((c) => {
        c.position.y = c.userData.baseY + Math.sin(elapsed * 1.8 + c.userData.phase) * 0.05;
      });

      // Anima varinhas disponíveis na mesa
      wandsOnTable.forEach((w, idx) => {
        if (w.visible) {
          w.position.y = 0.94 + Math.sin(elapsed * 2.8 + idx) * 0.025;
        }
      });

      // Anima caminho luminoso no chão (1 = indo para Letícia no fundo, -1 = voltando para Luigi na frente)
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

