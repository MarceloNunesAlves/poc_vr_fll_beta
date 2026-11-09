import * as THREE from 'three';
import { createWizardClassroom, createWandMesh } from './classroom.js';
import { createWizardCharacter } from './characters.js';
import { MagicAudioSystem } from './audio.js';
import { FloorQrAnchorSystem } from './qrFloorAnchors.js';

// Estados da Experiência
const STATE = {
  WELCOME: 'WELCOME',               // Tela de boas-vindas (Aperte A para iniciar)
  VIDEO_360: 'VIDEO_360',           // Vídeo 360° sentado (Placeholder de 5s com texto)
  DARK_TRANSITION: 'DARK_TRANSITION', // Filme finaliza e fica tudo escuro
  ROOM_AWAKEN: 'ROOM_AWAKEN',       // Aos poucos vai iniciando na cadeira da sala de bruxos
  GO_TO_LETICIA: 'GO_TO_LETICIA',   // Ir até o final da sala onde está a Letícia
  SELECT_WAND: 'SELECT_WAND',       // Escolher uma varinha na mesa ao lado da Letícia
  GO_TO_LUIGI: 'GO_TO_LUIGI',       // Voltar ao início da sala perto da mesa da professora e do Luigi
  CAST_SPELL: 'CAST_SPELL',         // Fazer a magia "Wingardium Leviosa" e levantar a pena branca grande
  CELEBRATION: 'CELEBRATION'        // Finalização e pronto para o próximo usuário apertando A
};

const audio = new MagicAudioSystem();
const qrFloorAnchor = new FloorQrAnchorSystem();

// Elementos do HUD 2D (para tela do Mac/operador)
const phaseLabelEl = document.getElementById('phase-label');
const qrStatusLabelEl = document.getElementById('qr-status-label');
const welcomeModalEl = document.getElementById('welcome-modal');
const modalTitleEl = document.getElementById('modal-title');
const modalDescEl = document.getElementById('modal-desc');
const btnStartAction = document.getElementById('btn-start-action');
const btnEnterVr = document.getElementById('btn-enter-vr');
const btnActionA = document.getElementById('btn-action-a');
const btnRecenter = document.getElementById('btn-recenter');
const btnReset = document.getElementById('btn-reset');
const dialogueBoxEl = document.getElementById('dialogue-box');
const dialogueSpeakerEl = document.getElementById('dialogue-speaker');
const dialogueTextEl = document.getElementById('dialogue-text');

// Cena Three.js
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050408);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 100);

// Rig do Jogador (permite combinar caminhada física Room-Scale 6DoF + analógico/teclado)
const playerRig = new THREE.Group();
// Posição inicial sentado na cadeira no início da sala (Z = +1.45m, olhando para -Z)
playerRig.position.set(0, 0, 1.45);
scene.add(playerRig);
camera.position.set(0, 1.18, 0); // Altura sentado na cadeira
playerRig.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
container.appendChild(renderer.domElement);

// Constrói a Sala de Escola de Bruxos (4m x 1,5m)
const classroom = createWizardClassroom(scene);

// Personagens 3D: Letícia (no final da sala) e Luigi (no início da sala, perto da mesa da professora)
let leticiaChar = null;
let luigiChar = null;

async function initCharacters() {
  leticiaChar = await createWizardCharacter({
    name: 'Letícia',
    imageUrl: '/assets/leticia.jpg',
    glbUrl: '/models/leticia.glb',
    position: new THREE.Vector3(0.36, 0, -1.55), // Fundo da sala ao lado da mesa de varinhas
    rotationY: 0,
    height: 1.28,
    accentColor: 0xf5d061
  });
  classroom.roomGroup.add(leticiaChar.group);

  luigiChar = await createWizardCharacter({
    name: 'Luigi',
    imageUrl: '/assets/luigi.jpg',
    glbUrl: '/models/luigi.glb',
    position: new THREE.Vector3(0.42, 0, 0.58), // Início da sala próximo à mesa da professora
    rotationY: -0.4,
    height: 1.34,
    accentColor: 0xffae00
  });
  classroom.roomGroup.add(luigiChar.group);
}
initCharacters();

// ============================================================================
// ESFERA DE VÍDEO 360° (E PAINEL DE TEXTO DE 5 SEGUNDOS)
// ============================================================================
const video360Group = new THREE.Group();
scene.add(video360Group);

const sphereGeo = new THREE.SphereGeometry(18, 48, 32);
sphereGeo.scale(-1, 1, 1); // Inverte normais para ver por dentro da esfera 360

// Textura estrelada 360° enquanto o vídeo real (/public/video/intro360.mp4) não foi gravado
function create360PlaceholderSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#050214');
  grad.addColorStop(0.5, '#13092b');
  grad.addColorStop(1, '#05020a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  for (let i = 0; i < 350; i++) {
    ctx.fillStyle = i % 5 === 0 ? '#ffe885' : '#ffffff';
    const r = Math.random() * 2.2;
    ctx.beginPath();
    ctx.arc(Math.random() * 1024, Math.random() * 512, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const sphereMat = new THREE.MeshBasicMaterial({
  map: create360PlaceholderSkyTexture()
});
const sphere360Mesh = new THREE.Mesh(sphereGeo, sphereMat);
video360Group.add(sphere360Mesh);

// Suporte pronto para Vídeo 360° real (/public/video/intro360.mp4) quando for produzido
let hasReal360Video = false;
const video360El = document.createElement('video');
video360El.src = '/video/intro360.mp4';
video360El.crossOrigin = 'anonymous';
video360El.playsInline = true;
video360El.preload = 'metadata';
video360El.addEventListener('loadeddata', () => {
  hasReal360Video = true;
  const videoTex = new THREE.VideoTexture(video360El);
  videoTex.colorSpace = THREE.SRGBColorSpace;
  sphereMat.map = videoTex;
  sphereMat.needsUpdate = true;
});
video360El.addEventListener('ended', () => {
  if (currentState === STATE.VIDEO_360) {
    transitionToState(STATE.DARK_TRANSITION);
  }
});

// Painel 3D Frontal dentro do VR (Usado para: Tela de Boas-Vindas, Texto 5s do Vídeo 360 e Tela Final)
const vrBannerCanvas = document.createElement('canvas');
vrBannerCanvas.width = 1024;
vrBannerCanvas.height = 512;
const vrBannerCtx = vrBannerCanvas.getContext('2d');
const vrBannerTex = new THREE.CanvasTexture(vrBannerCanvas);
vrBannerTex.colorSpace = THREE.SRGBColorSpace;

const vrBannerMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(1.7, 0.85),
  new THREE.MeshBasicMaterial({
    map: vrBannerTex,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false
  })
);
vrBannerMesh.renderOrder = 999;
scene.add(vrBannerMesh);

function drawVrBanner({ badge, title, subtitle, footer, progress = null }) {
  const ctx = vrBannerCtx;
  ctx.clearRect(0, 0, 1024, 512);

  // Fundo mágico escuro com borda dourada dupla
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, 'rgba(48, 10, 18, 0.95)');
  grad.addColorStop(1, 'rgba(12, 8, 22, 0.96)');
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#f5d061';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(20, 20, 984, 472, 32);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(245, 208, 97, 0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(36, 36, 952, 440, 24);
  ctx.stroke();

  ctx.textAlign = 'center';

  if (badge) {
    ctx.fillStyle = '#f5d061';
    ctx.font = 'bold 28px Georgia, serif';
    ctx.fillText(badge, 512, 92);
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px Georgia, serif';
  ctx.fillText(title || '', 512, 168);

  if (subtitle) {
    ctx.fillStyle = '#efe2c6';
    ctx.font = '30px Georgia, serif';
    const lines = subtitle.split('\n');
    lines.forEach((l, i) => {
      ctx.fillText(l, 512, 235 + i * 44);
    });
  }

  if (progress !== null) {
    const barW = 680;
    const barH = 22;
    const bx = (1024 - barW) / 2;
    const by = 355;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.roundRect(bx, by, barW, barH, 11);
    ctx.fill();

    ctx.fillStyle = '#f5d061';
    ctx.beginPath();
    ctx.roundRect(bx, by, Math.max(22, barW * THREE.MathUtils.clamp(progress, 0, 1)), barH, 11);
    ctx.fill();
  }

  if (footer) {
    ctx.fillStyle = '#ffe885';
    ctx.font = 'bold 31px Georgia, serif';
    ctx.fillText(footer, 512, 435);
  }

  vrBannerTex.needsUpdate = true;
}

// Esfera preta ao redor da câmera para o efeito de "Tudo Escuro" (Fade to Black suave no VR)
const blackoutGeo = new THREE.SphereGeometry(0.35, 24, 16);
blackoutGeo.scale(-1, 1, 1);
const blackoutMat = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0,
  depthTest: false
});
const blackoutSphere = new THREE.Mesh(blackoutGeo, blackoutMat);
blackoutSphere.renderOrder = 990;
camera.add(blackoutSphere);

// ============================================================================
// CONTROLES DO META QUEST 3 + VARINHA NA MÃO + PARTÍCULAS MÁGICAS
// ============================================================================
// Importante: no WebXR do Three.js, getController(0) recebe o 1º controle conectado
// e getController(1) recebe o 2º. Por isso detectamos dinamicamente a mão ativa!
const controller0 = renderer.xr.getController(0);
const controller1 = renderer.xr.getController(1);
playerRig.add(controller0, controller1);

const xrControllers = [controller0, controller1];
let preferredWandController = null;

// Mão virtual / Varinha para modo Desktop e modo VR
const handHolder = new THREE.Group();
// No modo desktop fica visível no canto inferior direito da visão
camera.add(handHolder);
handHolder.position.set(0.24, -0.22, -0.48);

// Indicador simples das mãos do Quest antes de pegar a varinha
const controllerVisual0 = new THREE.Mesh(
  new THREE.SphereGeometry(0.028, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xf5d061, wireframe: true })
);
controller0.add(controllerVisual0);

const controllerVisual1 = new THREE.Mesh(
  new THREE.SphereGeometry(0.028, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xf5d061, wireframe: true })
);
controller1.add(controllerVisual1);

xrControllers.forEach((ctrl, idx) => {
  ctrl.userData.index = idx;
  ctrl.userData.handedness = null;
  ctrl.userData.isConnected = false;

  ctrl.addEventListener('connected', (e) => {
    ctrl.userData.isConnected = true;
    ctrl.userData.handedness = e.data ? e.data.handedness : null;
    if (ctrl.userData.handedness === 'right' || !preferredWandController) {
      preferredWandController = ctrl;
    }
  });

  ctrl.addEventListener('disconnected', () => {
    ctrl.userData.isConnected = false;
    ctrl.userData.handedness = null;
    if (preferredWandController === ctrl) {
      preferredWandController = xrControllers.find((c) => c.userData.isConnected) || null;
    }
  });
});

function getActiveWandController() {
  if (preferredWandController && preferredWandController.visible) {
    return preferredWandController;
  }
  const rightCtrl = xrControllers.find((c) => c.visible && c.userData.handedness === 'right');
  if (rightCtrl) return rightCtrl;
  const anyVisible = xrControllers.find((c) => c.visible);
  if (anyVisible) return anyVisible;
  const anyConnected = xrControllers.find((c) => c.userData.isConnected);
  if (anyConnected) return anyConnected;
  return controller0;
}

// Varinha equipada pelo jogador (adicionada diretamente na cena e sincronizada a cada frame
// com o controle ativo no VR ou handHolder no Desktop para nunca sumir!)
const playerWand = createWandMesh(0x5c3317, 0xffd700);
playerWand.visible = false;
scene.add(playerWand);

// Linha guia mágica sutil para mirar e escolher a varinha na mesa da Letícia
const wandAimGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, -1)
]);
const wandAimMat = new THREE.LineBasicMaterial({
  color: 0xffe885,
  transparent: true,
  opacity: 0.65
});
const wandAimLine = new THREE.Line(wandAimGeo, wandAimMat);
wandAimLine.visible = false;
scene.add(wandAimLine);

// Raio mágico ligando a ponta da varinha até a pena branca grande durante o Wingardium Leviosa
const spellBeamGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 1, 0)
]);
const spellBeamMat = new THREE.LineBasicMaterial({
  color: 0xffe885,
  transparent: true,
  opacity: 0.0
});
const spellBeam = new THREE.Line(spellBeamGeo, spellBeamMat);
scene.add(spellBeam);

// Sistema de Partículas Mágicas Douradas (ao redor da varinha e da pena)
const particleCount = 90;
const particlePositions = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount * 3; i++) {
  particlePositions[i] = 0;
}
const particleGeo = new THREE.BufferGeometry();
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
const particleMat = new THREE.PointsMaterial({
  color: 0xffe885,
  size: 0.035,
  transparent: true,
  opacity: 0.85
});
const magicParticles = new THREE.Points(particleGeo, particleMat);
magicParticles.visible = false;
scene.add(magicParticles);

function triggerControllerHaptics(intensity = 0.7, durationMs = 120) {
  const session = renderer.xr.getSession();
  if (!session) return;
  for (const source of session.inputSources) {
    if (source.gamepad && source.gamepad.hapticActuators && source.gamepad.hapticActuators[0]) {
      source.gamepad.hapticActuators[0].pulse(intensity, durationMs).catch(() => {});
    }
  }
}

// ============================================================================
// MÁQUINA DE ESTADOS DA EXPERIÊNCIA
// ============================================================================
let currentState = STATE.WELCOME;
let stateTimer = 0;
let spellProgress = 0; // 0 a 1 para levantar a pena branca
let hasWand = false;
let prevButtonAPressed = false;
let prevButtonBPressed = false;
let lastWandWorldY = null;

function setHUDDialogue(speaker, text) {
  if (!text) {
    dialogueBoxEl.classList.add('hidden');
    if (leticiaChar) leticiaChar.setSpeech('', false);
    if (luigiChar) luigiChar.setSpeech('', false);
    return;
  }

  dialogueBoxEl.classList.remove('hidden');
  dialogueSpeakerEl.textContent = speaker;
  dialogueTextEl.textContent = text;

  if (speaker === 'Letícia' && leticiaChar) {
    leticiaChar.setSpeech(text, true);
    if (luigiChar) luigiChar.setSpeech('', false);
  } else if (speaker === 'Luigi' && luigiChar) {
    luigiChar.setSpeech(text, true);
    if (leticiaChar) leticiaChar.setSpeech('', false);
  }
}

// Exibe o balão de fala da Letícia ou do Luigi e o esconde automaticamente assim que o áudio terminar
function speakCharacterDialogue(speaker, text, audioKey) {
  setHUDDialogue(speaker, text);
  audio.speak(speaker, text, audioKey, () => {
    setHUDDialogue('', '');
  });
}

function transitionToState(newState) {
  currentState = newState;
  stateTimer = 0;

  // Limpa linha guia de mira e destaque das varinhas ao trocar de estado
  wandAimLine.visible = false;
  classroom.wandsOnTable.forEach((w) => {
    w.userData.isHovered = false;
  });

  switch (newState) {
    case STATE.WELCOME: {
      phaseLabelEl.textContent = '1/7 • Tela de Boas-Vindas (Aperte Botão A)';
      welcomeModalEl.classList.remove('hidden');
      modalTitleEl.textContent = 'Bem-vindo à Escola de Magia do Luigi e da Letícia!';
      modalDescEl.innerHTML =
        'Sente-se na cadeira, coloque o Meta Quest 3 e aperte apenas o <strong>Botão [A]</strong> do controle direito para começar!';
      btnStartAction.textContent = '▶ Iniciar Experiência (Botão A / Espaço)';

      // Reseta estado da sala, varinhas e pena
      hasWand = false;
      spellProgress = 0;
      playerWand.visible = false;
      spellBeamMat.opacity = 0;
      magicParticles.visible = false;
      classroom.wandsOnTable.forEach((w) => {
        w.visible = true;
        w.userData.isHovered = false;
      });
      classroom.featherGroup.position.copy(classroom.featherRestPos);
      classroom.featherGroup.rotation.set(0, 0, 0);

      // Jogador de volta na cadeira no início da sala (ou mantém alinhado aos 4 QR Codes físicos se ativos)
      if (!qrFloorAnchor.applyAnchorToRig(playerRig, false)) {
        playerRig.position.set(0, 0, 1.45);
        playerRig.rotation.set(0, 0, 0);
        camera.rotation.set(0, 0, 0);
      }

      classroom.roomGroup.visible = true;
      classroom.setRoomBrightness(0.35);
      video360Group.visible = false;
      blackoutMat.opacity = 0;
      vrBannerMesh.visible = true;

      drawVrBanner({
        badge: '🦁 ANIVERSÁRIO DO LUIGI & DA LETÍCIA 🪄',
        title: 'Bem-vindo à Escola de Magia!',
        subtitle: 'Sente-se confortavelmente na cadeira.\nPara iniciar sua jornada mágica:',
        footer: '👉 Aperte o Botão [A] no controle direito'
      });

      setHUDDialogue('', '');
      audio.stopSpeech();
      break;
    }

    case STATE.VIDEO_360: {
      phaseLabelEl.textContent = '2/7 • Vídeo 360° de Abertura (5 segundos)';
      welcomeModalEl.classList.add('hidden');
      audio.playStartChime();
      audio.startAmbientMagic();

      // Esconde a sala 3D e exibe a esfera 360° ao redor do usuário sentado
      classroom.roomGroup.visible = false;
      video360Group.visible = true;
      blackoutMat.opacity = 0;
      vrBannerMesh.visible = !hasReal360Video;
      if (hasReal360Video) {
        video360El.currentTime = 0;
        video360El.play().catch(() => {});
      }
      setHUDDialogue('', '');
      break;
    }

    case STATE.DARK_TRANSITION: {
      phaseLabelEl.textContent = '3/7 • Fim do Filme 360° (Tudo Escuro...)';
      vrBannerMesh.visible = false;
      break;
    }

    case STATE.ROOM_AWAKEN: {
      phaseLabelEl.textContent = '4/7 • Despertando na Sala de Escola de Bruxos';
      video360Group.visible = false;
      classroom.roomGroup.visible = true;
      classroom.setRoomBrightness(0.0);
      vrBannerMesh.visible = false;

      // Posiciona o jogador sentado na cadeira no início da sala (ou mantém a sala travada nos QR Codes do chão)
      if (!qrFloorAnchor.applyAnchorToRig(playerRig, false)) {
        playerRig.position.set(0, 0, 1.45);
      }
      break;
    }

    case STATE.GO_TO_LETICIA: {
      phaseLabelEl.textContent = '5/7 • Vá até o final da sala falar com a Letícia';
      classroom.setRoomBrightness(1.0);
      const msg =
        'Olá! Bem-vindo à nossa Escola de Magia! Venha andando até aqui no final da sala para escolher sua varinha!';
      speakCharacterDialogue('Letícia', msg, 'leticia_1');
      break;
    }

    case STATE.SELECT_WAND: {
      phaseLabelEl.textContent = '5/7 • Escolha uma Varinha na mesa ao lado da Letícia';
      const msg =
        'Que demais que você veio! Escolha uma varinha mágica na mesa ao meu lado! Basta encostar sua mão nela ou apertar o botão A!';
      speakCharacterDialogue('Letícia', msg, 'leticia_2');
      break;
    }

    case STATE.GO_TO_LUIGI: {
      phaseLabelEl.textContent = '6/7 • Volte ao início da sala (Mesa da Professora com o Luigi)';
      const msg =
        'A varinha escolheu você! Agora volte até o início da sala, perto da mesa da professora, onde o Luigi vai te ajudar a fazer a magia!';
      speakCharacterDialogue('Letícia', msg, 'leticia_3');
      break;
    }

    case STATE.CAST_SPELL: {
      phaseLabelEl.textContent = '7/7 • Faça o feitiço "Wingardium Leviosa" na Pena Branca!';
      spellProgress = 0;
      magicParticles.visible = true;
      const msg =
        'Oi! Olhe a grande pena branca na mesa da professora! Aponte sua varinha e levante a mão ou segure o botão A dizendo: Wingardium Leviosa!';
      speakCharacterDialogue('Luigi', msg, 'luigi_1');
      break;
    }

    case STATE.CELEBRATION: {
      phaseLabelEl.textContent = '✨ Concluído! Aperte [A] para o Próximo Convidado';
      spellBeamMat.opacity = 0;
      audio.playWingardiumSuccess();
      triggerControllerHaptics(1.0, 400);

      const msg =
        'Wingardium Leviosa! Uau, você conseguiu levantar a pena! Parabéns! Muito obrigado por vir no nosso aniversário!';
      speakCharacterDialogue('Luigi', msg, 'luigi_2');
      break;
    }
  }
}

// ============================================================================
// AÇÃO DO BOTÃO "A" (UNIVERSAL E FÁCIL PARA QUALQUER CRIANÇA OU CONVIDADO)
// ============================================================================
function handlePrimaryActionButtonA() {
  audio.init();
  triggerControllerHaptics(0.6, 80);

  if (currentState === STATE.WELCOME) {
    transitionToState(STATE.VIDEO_360);
    return;
  }

  if (currentState === STATE.GO_TO_LETICIA) {
    // Se a pessoa apertar A enquanto caminha ou se preferir avançar com o botão até a Letícia:
    const playerPos = getPlayerWorldPosition();
    if (playerPos.z > -0.6) {
      // Dá um passo suave em direção ao fundo da sala para ajudar quem está sentado
      playerRig.position.z = Math.max(-0.85, playerRig.position.z - 0.85);
    } else {
      transitionToState(STATE.SELECT_WAND);
    }
    return;
  }

  if (currentState === STATE.SELECT_WAND) {
    pickupClosestWand();
    return;
  }

  if (currentState === STATE.GO_TO_LUIGI) {
    const playerPos = getPlayerWorldPosition();
    if (playerPos.z < 0.5) {
      playerRig.position.z = Math.min(1.25, playerRig.position.z + 0.85);
    } else {
      transitionToState(STATE.CAST_SPELL);
    }
    return;
  }

  if (currentState === STATE.CAST_SPELL) {
    // Impulsiona o feitiço facilmente ao apertar A
    spellProgress = Math.min(1.0, spellProgress + 0.38);
    audio.playSpellSpark(spellProgress);
    if (spellProgress >= 1.0) {
      transitionToState(STATE.CELEBRATION);
    }
    return;
  }

  if (currentState === STATE.CELEBRATION && stateTimer > 1.5) {
    transitionToState(STATE.WELCOME);
  }
}

// Calcula qual varinha da mesa está sendo apontada pelo raio do controle (ou tocada pela mão)
const tempSegPt = new THREE.Vector3();
const tempRayOrigin = new THREE.Vector3();
const tempRayDir = new THREE.Vector3();
const tempClosestOnRay = new THREE.Vector3();

function evaluateWandSelectionOnTable() {
  const visibleWands = classroom.wandsOnTable.filter((w) => w.visible);
  if (visibleWands.length === 0) {
    wandAimLine.visible = false;
    return { chosen: null, touched: false };
  }

  // Modo Desktop: escolhe a varinha mais próxima do centro do olhar da câmera
  if (!renderer.xr.isPresenting) {
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(tempRayOrigin);
    camera.getWorldQuaternion(tempQuat);
    tempRayDir.set(0, 0, -1).applyQuaternion(tempQuat).normalize();
  } else {
    const activeCtrl = getActiveWandController();
    activeCtrl.updateWorldMatrix(true, false);
    activeCtrl.getWorldPosition(tempRayOrigin);
    activeCtrl.getWorldQuaternion(tempQuat);
    tempRayDir.set(0, 0, -1).applyQuaternion(tempQuat).normalize();
  }

  let bestWand = visibleWands[Math.floor(visibleWands.length / 2)];
  let bestScore = Infinity;
  let bestTargetPoint = new THREE.Vector3();
  let isTouching = false;

  visibleWands.forEach((w) => {
    w.updateWorldMatrix(true, false);
    let minRayDist = Infinity;
    let minHandDist = Infinity;
    const bestPtForWand = new THREE.Vector3();

    // Amostra pontos ao longo de todo o corpo da varinha (do cabo z=+0.10 até a ponta z=-0.275)
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      const localZ = THREE.MathUtils.lerp(0.10, -0.275, u);
      tempSegPt.set(0, 0, localZ).applyMatrix4(w.matrixWorld);

      const handDist = tempSegPt.distanceTo(tempRayOrigin);
      if (handDist < minHandDist) {
        minHandDist = handDist;
      }

      // Distância perpendicular do ponto da varinha até o raio apontado pelo controle
      const toPtX = tempSegPt.x - tempRayOrigin.x;
      const toPtY = tempSegPt.y - tempRayOrigin.y;
      const toPtZ = tempSegPt.z - tempRayOrigin.z;
      const t = Math.max(0, toPtX * tempRayDir.x + toPtY * tempRayDir.y + toPtZ * tempRayDir.z);

      tempClosestOnRay.set(
        tempRayOrigin.x + tempRayDir.x * t,
        tempRayOrigin.y + tempRayDir.y * t,
        tempRayOrigin.z + tempRayDir.z * t
      );

      const rayDist = tempSegPt.distanceTo(tempClosestOnRay);
      if (rayDist < minRayDist) {
        minRayDist = rayDist;
        bestPtForWand.copy(tempSegPt);
      }
    }

    // Se a mão/controle encostar fisicamente na varinha (< 14cm), prioriza o toque direto
    if (renderer.xr.isPresenting && minHandDist < 0.14) {
      isTouching = true;
    }

    // Combina precisão do raio apontado com proximidade quando a mão está bem perto
    const score = minHandDist < 0.22 ? minHandDist * 0.5 + minRayDist * 0.5 : minRayDist;
    if (score < bestScore) {
      bestScore = score;
      bestWand = w;
      bestTargetPoint.copy(bestPtForWand);
    }
  });

  // Destaca na mesa apenas a varinha que está na mira do controle
  classroom.wandsOnTable.forEach((w) => {
    w.userData.isHovered = w === bestWand;
  });

  // Atualiza linha guia mágica sutil saindo do controle em direção à varinha apontada no VR
  if (renderer.xr.isPresenting && currentState === STATE.SELECT_WAND && !hasWand && bestWand) {
    wandAimLine.visible = true;
    const aimPositions = wandAimLine.geometry.attributes.position;
    aimPositions.setXYZ(0, tempRayOrigin.x, tempRayOrigin.y, tempRayOrigin.z);
    aimPositions.setXYZ(1, bestTargetPoint.x, bestTargetPoint.y, bestTargetPoint.z);
    aimPositions.needsUpdate = true;
    wandAimMat.color.setHex(bestWand.userData.glowColor || 0xffe885);
  } else {
    wandAimLine.visible = false;
  }

  return { chosen: bestWand, touched: isTouching };
}

// Sincroniza a varinha equipada diretamente com a pose mundial do controle ativo a cada frame
function syncPlayerWandToController() {
  if (!hasWand) {
    playerWand.visible = false;
    controllerVisual0.visible = true;
    controllerVisual1.visible = true;
    return;
  }

  playerWand.visible = true;

  if (renderer.xr.isPresenting) {
    const activeCtrl = getActiveWandController();
    // Oculta a esfera guia na mão que está segurando a varinha para o jogador ver a varinha na mão
    controllerVisual0.visible = activeCtrl !== controller0;
    controllerVisual1.visible = activeCtrl !== controller1;

    activeCtrl.updateWorldMatrix(true, false);
    activeCtrl.getWorldPosition(playerWand.position);
    activeCtrl.getWorldQuaternion(playerWand.quaternion);
    // Posiciona o cabo da varinha encaixado na mão/controle apontando para frente (-Z)
    playerWand.translateZ(-0.04);
    playerWand.translateY(-0.008);
    playerWand.updateMatrixWorld(true);
  } else {
    controllerVisual0.visible = true;
    controllerVisual1.visible = true;
    handHolder.updateWorldMatrix(true, false);
    handHolder.getWorldPosition(playerWand.position);
    handHolder.getWorldQuaternion(playerWand.quaternion);
    playerWand.updateMatrixWorld(true);
  }
}

function pickupClosestWand(preselectedWand = null) {
  if (hasWand) return;

  const { chosen: evaluatedWand } = evaluateWandSelectionOnTable();
  const chosen = preselectedWand || evaluatedWand || classroom.wandsOnTable[1] || classroom.wandsOnTable[0];

  hasWand = true;
  wandAimLine.visible = false;

  if (chosen) {
    chosen.visible = false;
    chosen.userData.isHovered = false;
    // Aplica na varinha da mão exatamente a madeira e o brilho da varinha escolhida na mesa!
    if (playerWand.userData.setColors) {
      playerWand.userData.setColors(chosen.userData.woodColor, chosen.userData.glowColor);
    }
    spellBeamMat.color.setHex(chosen.userData.glowColor || 0xffe885);
    particleMat.color.setHex(chosen.userData.glowColor || 0xffe885);
  }

  // Posiciona imediatamente a varinha no controle ativo do jogador
  syncPlayerWandToController();
  magicParticles.visible = true;

  audio.playWandPickup();
  triggerControllerHaptics(0.9, 220);
  transitionToState(STATE.GO_TO_LUIGI);
}

// ============================================================================
// UTILITÁRIOS DE POSIÇÃO (COMBINANDO ROOM-SCALE + RIG)
// ============================================================================
const tempVecA = new THREE.Vector3();
const tempVecB = new THREE.Vector3();
const tempQuat = new THREE.Quaternion();

function getPlayerWorldPosition() {
  camera.getWorldPosition(tempVecA);
  return tempVecA.clone();
}

function getWandTipWorldPosition() {
  if (hasWand && playerWand.visible && playerWand.userData.orb) {
    playerWand.userData.orb.updateWorldMatrix(true, false);
    playerWand.userData.orb.getWorldPosition(tempVecB);
    return tempVecB.clone();
  }
  if (renderer.xr.isPresenting) {
    const activeCtrl = getActiveWandController();
    activeCtrl.updateWorldMatrix(true, false);
    activeCtrl.getWorldPosition(tempVecB);
    return tempVecB.clone();
  }
  handHolder.updateWorldMatrix(true, false);
  handHolder.getWorldPosition(tempVecB);
  return tempVecB.clone();
}

function updateQrStatusBadge() {
  if (!qrStatusLabelEl) return;
  const count = qrFloorAnchor.getDetectedCount();
  if (count === 0) {
    qrStatusLabelEl.textContent = '📍 Chão: Modo Padrão (0/4 QR Codes)';
  } else {
    qrStatusLabelEl.textContent = `📍 Sala Travada no Chão (${count}/4 QR Codes)`;
  }
}

function recenterChairPosition() {
  if (!qrFloorAnchor.applyAnchorToRig(playerRig, false)) {
    playerRig.position.set(0, 0, 1.45);
    playerRig.rotation.set(0, 0, 0);
  }
}

// ============================================================================
// ENTRADAS NO PC (TECLADO / MOUSE / BOTÕES DO HUD) E META QUEST 3 (WEBXR)
// ============================================================================
const keysPressed = {};
window.addEventListener('keydown', (e) => {
  const k = e.code;
  keysPressed[k] = true;

  if (k === 'Space' || k === 'KeyA' && !keysPressed['ControlLeft'] && currentState === STATE.WELCOME) {
    if (k === 'Space') {
      e.preventDefault();
      handlePrimaryActionButtonA();
    }
  }
  if (k === 'KeyE' || k === 'Enter') {
    handlePrimaryActionButtonA();
  }
  if (k === 'KeyB') {
    recenterChairPosition();
  }
  if (k === 'KeyR') {
    transitionToState(STATE.WELCOME);
  }
});

window.addEventListener('keyup', (e) => {
  keysPressed[e.code] = false;
});

// Olhar com o mouse no PC e levantar a varinha na fase do feitiço
let isPointerDown = false;
let lastMouseX = 0;
let lastMouseY = 0;

renderer.domElement.addEventListener('pointerdown', (e) => {
  isPointerDown = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

window.addEventListener('pointerup', () => {
  isPointerDown = false;
});

window.addEventListener('pointermove', (e) => {
  const dy = e.clientY - lastMouseY;
  const dx = e.clientX - lastMouseX;

  if (isPointerDown && !renderer.xr.isPresenting) {
    playerRig.rotation.y -= dx * 0.004;
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * 0.004, -1.1, 1.1);
  }

  // No modo PC, mover o mouse para cima na fase CAST_SPELL ergue a varinha e a pena!
  if (currentState === STATE.CAST_SPELL && dy < -2) {
    spellProgress = Math.min(1.0, spellProgress + Math.abs(dy) * 0.0045);
    handHolder.position.y = -0.22 + spellProgress * 0.14;
    if (spellProgress >= 1.0) {
      transitionToState(STATE.CELEBRATION);
    }
  }

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

// Botões da interface
btnStartAction.addEventListener('click', () => handlePrimaryActionButtonA());
btnActionA.addEventListener('click', () => handlePrimaryActionButtonA());
btnRecenter.addEventListener('click', () => recenterChairPosition());
btnReset.addEventListener('click', () => transitionToState(STATE.WELCOME));

// Gatilho e Grip de ambos os Controles do Quest 3 acionam a ação principal e definem a mão ativa!
xrControllers.forEach((ctrl) => {
  ctrl.addEventListener('selectstart', () => {
    preferredWandController = ctrl;
    handlePrimaryActionButtonA();
  });
  ctrl.addEventListener('squeezestart', () => {
    preferredWandController = ctrl;
    if (currentState === STATE.SELECT_WAND || currentState === STATE.CAST_SPELL) {
      handlePrimaryActionButtonA();
    }
  });
});

// Garante que o Web Audio API esteja ativo e decodificado assim que entrar na sessão VR
renderer.xr.addEventListener('sessionstart', () => {
  audio.init();
});

// Botão para Entrar/Sair do Modo VR Imersivo no Meta Quest 3
btnEnterVr.addEventListener('click', async () => {
  audio.init();
  if (!navigator.xr) {
    alert(
      'WebXR não detectado neste navegador. No Meta Quest 3, abra este endereço no Meta Quest Browser para entrar em VR imersivo! No computador, você pode testar agora mesmo clicando em "Iniciar Experiência".'
    );
    return;
  }

  try {
    const isSupported = await navigator.xr.isSessionSupported('immersive-vr');
    if (!isSupported) {
      alert('Modo VR Imersivo não disponível neste dispositivo. Use o simulador na tela ou abra no Meta Quest 3!');
      return;
    }
    const trackedImages = await qrFloorAnchor.prepareTrackedImages();
    let session = null;
    if (trackedImages.length > 0) {
      try {
        session = await navigator.xr.requestSession('immersive-vr', {
          optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'image-tracking'],
          trackedImages
        });
      } catch {
        // Fallback automático caso o navegador não suporte trackedImages
        session = null;
      }
    }
    if (!session) {
      session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
      });
    }
    renderer.xr.setSession(session);
  } catch (err) {
    console.warn('Erro ao iniciar sessão WebXR:', err);
  }
});

// ============================================================================
// LEITURA DOS BOTÕES [A], [B] E ANALÓGICO DO CONTROLE DO META QUEST 3
// ============================================================================
function pollQuest3Gamepads(dt) {
  const session = renderer.xr.getSession();
  if (!session) return { holdingAction: false };

  let buttonAPressedNow = false;
  let buttonBPressedNow = false;
  let holdingTriggerOrA = false;

  for (const source of session.inputSources) {
    if (!source.gamepad) continue;
    const gp = source.gamepad;

    // No Meta Quest Touch Plus Controller:
    // buttons[0] = Trigger (Gatilho)
    // buttons[1] = Squeeze (Grip lateral)
    // buttons[4] = Botão A (mão direita) / Botão X (mão esquerda)
    // buttons[5] = Botão B (mão direita) / Botão Y (mão esquerda)
    const triggerPressed = gp.buttons[0] && gp.buttons[0].pressed;
    const gripPressed = gp.buttons[1] && gp.buttons[1].pressed;
    const btnA = gp.buttons[4] && gp.buttons[4].pressed;
    const btnB = gp.buttons[5] && gp.buttons[5].pressed;

    if (btnA) buttonAPressedNow = true;
    if (btnB) buttonBPressedNow = true;
    if (btnA || triggerPressed || gripPressed) {
      holdingTriggerOrA = true;
      if (source.handedness) {
        const matchingCtrl = xrControllers.find((c) => c.userData.handedness === source.handedness && c.visible);
        if (matchingCtrl) preferredWandController = matchingCtrl;
      }
    }

    // Locomoção Híbrida via Analógico (axes[2] = X, axes[3] = Y)
    if (
      currentState === STATE.GO_TO_LETICIA ||
      currentState === STATE.SELECT_WAND ||
      currentState === STATE.GO_TO_LUIGI ||
      currentState === STATE.CAST_SPELL
    ) {
      const stickX = gp.axes[2] || 0;
      const stickY = gp.axes[3] || 0;
      if (Math.abs(stickY) > 0.18 || Math.abs(stickX) > 0.18) {
        const speed = 1.35 * dt;
        // Move na direção para onde o jogador está olhando
        camera.getWorldQuaternion(tempQuat);
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(tempQuat);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(tempQuat);
        right.y = 0;
        right.normalize();

        playerRig.position.addScaledVector(forward, stickY * speed);
        playerRig.position.addScaledVector(right, stickX * speed);
        clampPlayerInsideClassroom();
      }
    }
  }

  // Dispara na borda de subida do Botão [A]
  if (buttonAPressedNow && !prevButtonAPressed) {
    handlePrimaryActionButtonA();
  }
  // Botão [B] recalibra a posição da cadeira
  if (buttonBPressedNow && !prevButtonBPressed) {
    recenterChairPosition();
  }

  prevButtonAPressed = buttonAPressedNow;
  prevButtonBPressed = buttonBPressedNow;

  return { holdingAction: holdingTriggerOrA };
}

// Mantém o rig dentro dos limites seguros de 4,0m x 1,5m da sala
function clampPlayerInsideClassroom() {
  playerRig.position.x = THREE.MathUtils.clamp(playerRig.position.x, -0.72, 0.72);
  playerRig.position.z = THREE.MathUtils.clamp(playerRig.position.z, -1.85, 1.85);
}

// Locomoção pelo Teclado no Mac/PC (W A S D ou Setas)
function updateDesktopMovement(dt) {
  if (renderer.xr.isPresenting) return;
  if (
    currentState !== STATE.GO_TO_LETICIA &&
    currentState !== STATE.SELECT_WAND &&
    currentState !== STATE.GO_TO_LUIGI &&
    currentState !== STATE.CAST_SPELL
  ) {
    return;
  }

  let moveZ = 0;
  let moveX = 0;
  if (keysPressed['KeyW'] || keysPressed['ArrowUp']) moveZ -= 1;
  if (keysPressed['KeyS'] || keysPressed['ArrowDown']) moveZ += 1;
  if (keysPressed['KeyA'] || keysPressed['ArrowLeft']) moveX -= 1;
  if (keysPressed['KeyD'] || keysPressed['ArrowRight']) moveX += 1;

  if (moveZ !== 0 || moveX !== 0) {
    const speed = 1.55 * dt;
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), playerRig.rotation.y);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), playerRig.rotation.y);
    playerRig.position.addScaledVector(forward, moveZ * speed);
    playerRig.position.addScaledVector(right, moveX * speed);
    clampPlayerInsideClassroom();
  }
}

// Posiciona o banner 3D sempre suavemente na frente do olhar do usuário sentado
function alignBannerInFrontOfPlayer(distance = 1.65) {
  const camPos = getPlayerWorldPosition();
  camera.getWorldQuaternion(tempQuat);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(tempQuat);
  forward.y = 0;
  if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
  forward.normalize();

  vrBannerMesh.position.copy(camPos).addScaledVector(forward, distance);
  vrBannerMesh.position.y = camPos.y - 0.04;
  vrBannerMesh.lookAt(camPos.x, vrBannerMesh.position.y, camPos.z);
}

// Atualiza partículas mágicas ao redor de um ponto alvo
function updateMagicParticles(elapsed, centerPos, spread = 0.35, rise = 0.0) {
  if (!magicParticles.visible) return;
  const posAttr = magicParticles.geometry.attributes.position;
  for (let i = 0; i < particleCount; i++) {
    const angle = elapsed * 2.5 + i * 0.45;
    const r = ((i % 7) / 7) * spread;
    const px = centerPos.x + Math.cos(angle) * r;
    const py = centerPos.y + ((elapsed * 0.6 + i * 0.07) % 0.75) + rise * 0.2;
    const pz = centerPos.z + Math.sin(angle) * r;
    posAttr.setXYZ(i, px, py, pz);
  }
  posAttr.needsUpdate = true;
}

// ============================================================================
// LOOP PRINCIPAL DE ANIMAÇÃO E LÓGICA DE JOGO
// ============================================================================
const clock = new THREE.Clock();

renderer.setAnimationLoop((timestamp, frame) => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  // Se houver QR Codes nos 4 cantos do chão físico, alinha a sala automaticamente.
  // Se não houver nenhum QR Code, não altera nada e mantém o comportamento padrão!
  if (frame && renderer.xr.isPresenting) {
    qrFloorAnchor.updateFromXRFrame(frame, renderer, playerRig, elapsed, () => {
      classroom.setQrCornerStates(qrFloorAnchor.getDetectedCornerFlags());
      updateQrStatusBadge();
      triggerControllerHaptics(0.65, 110);
    });
  }

  const { holdingAction } = pollQuest3Gamepads(dt);
  updateDesktopMovement(dt);

  // Mantém a varinha equipada sempre seguindo o controle ativo no VR (ou a mão no Desktop)
  syncPlayerWandToController();

  const playerPos = getPlayerWorldPosition();
  const wandTipPos = getWandTipWorldPosition();

  // Centraliza a esfera 360 na cabeça do usuário quando ativa
  if (video360Group.visible) {
    video360Group.position.copy(playerPos);
  }

  // Atualiza personagens 3D (Letícia e Luigi)
  if (leticiaChar) leticiaChar.update(elapsed, playerPos);
  if (luigiChar) luigiChar.update(elapsed, playerPos);

  // Direção das pegadas mágicas no chão (1 = rumo à Letícia, -1 = rumo ao Luigi)
  let pathDir = 0;
  if (currentState === STATE.GO_TO_LETICIA) pathDir = 1;
  if (currentState === STATE.GO_TO_LUIGI) pathDir = -1;
  classroom.update(elapsed, pathDir);

  // Lógica específica de cada fase da experiência
  switch (currentState) {
    case STATE.WELCOME: {
      alignBannerInFrontOfPlayer(1.65);
      break;
    }

    case STATE.VIDEO_360: {
      if (hasReal360Video) break;
      stateTimer += dt;
      const remaining = Math.max(0, 5.0 - stateTimer);
      const progress = stateTimer / 5.0;

      alignBannerInFrontOfPlayer(1.8);
      drawVrBanner({
        badge: '🎬 VÍDEO 360° DE ABERTURA (PLACEHOLDER 5s)',
        title: 'A Jornada para a Escola de Bruxos...',
        subtitle:
          'Aqui entrará o vídeo 360° com o convidado sentado.\nPrepare-se: a aula do Luigi e da Letícia já vai começar!',
        progress,
        footer: `Iniciando em ${remaining.toFixed(1)}s...`
      });

      // Nos últimos 0.8s dos 5s começa a escurecer
      if (stateTimer >= 4.2) {
        blackoutMat.opacity = THREE.MathUtils.clamp((stateTimer - 4.2) / 0.8, 0, 1);
      }

      if (stateTimer >= 5.0) {
        transitionToState(STATE.DARK_TRANSITION);
      }
      break;
    }

    case STATE.DARK_TRANSITION: {
      // "A ideia é que o filme finalize e fique tudo escuro"
      stateTimer += dt;
      blackoutMat.opacity = 1.0;
      if (stateTimer >= 1.5) {
        transitionToState(STATE.ROOM_AWAKEN);
      }
      break;
    }

    case STATE.ROOM_AWAKEN: {
      // "Ao pouco vai iniciando a experiência com o usuário sentado em uma cadeira na sala de escola de bruxos"
      stateTimer += dt;
      const awakenProgress = THREE.MathUtils.clamp(stateTimer / 3.2, 0, 1);
      blackoutMat.opacity = 1.0 - awakenProgress;
      classroom.setRoomBrightness(awakenProgress);

      if (stateTimer >= 3.2) {
        blackoutMat.opacity = 0;
        transitionToState(STATE.GO_TO_LETICIA);
      }
      break;
    }

    case STATE.GO_TO_LETICIA: {
      // Verifica se o usuário chegou perto do final da sala onde está a Letícia (Z <= -0.55m)
      if (playerPos.z <= -0.55) {
        transitionToState(STATE.SELECT_WAND);
      }
      break;
    }

    case STATE.SELECT_WAND: {
      // Avalia continuamente para qual varinha o controle está apontando (destacando-a na mesa)
      // e permite pegar tanto apertando [A]/Gatilho à distância quanto encostando fisicamente (< 14cm)
      const { chosen, touched } = evaluateWandSelectionOnTable();
      if (touched && chosen) {
        pickupClosestWand(chosen);
      }
      break;
    }

    case STATE.GO_TO_LUIGI: {
      updateMagicParticles(elapsed, wandTipPos, 0.14);
      // Verifica se o usuário voltou para o início da sala perto da mesa da professora e do Luigi (Z >= +0.15m)
      if (playerPos.z >= 0.15) {
        transitionToState(STATE.CAST_SPELL);
      }
      break;
    }

    case STATE.CAST_SPELL: {
      // Detecta movimento de erguer a varinha no controle do Meta Quest 3 OU segurar botão A/Gatilho/Espaço
      let liftDelta = 0;
      if (lastWandWorldY !== null) {
        const dy = wandTipPos.y - lastWandWorldY;
        if (dy > 0.0015) {
          liftDelta = dy * 2.2;
        }
      }
      lastWandWorldY = wandTipPos.y;

      const isHoldingDesktop = keysPressed['Space'] || keysPressed['KeyA'];
      if (holdingAction || isHoldingDesktop || liftDelta > 0) {
        const gain = (holdingAction || isHoldingDesktop ? 0.55 * dt : 0) + liftDelta;
        spellProgress = Math.min(1.0, spellProgress + gain);
        if (Math.random() < 0.25) {
          audio.playSpellSpark(spellProgress);
          triggerControllerHaptics(0.35, 40);
        }
      }

      // Atualiza raio mágico entre a ponta da varinha e a grande pena branca
      const featherPos = classroom.featherGroup.position;
      const beamPositions = spellBeam.geometry.attributes.position;
      beamPositions.setXYZ(0, wandTipPos.x, wandTipPos.y, wandTipPos.z);
      beamPositions.setXYZ(1, featherPos.x, featherPos.y, featherPos.z);
      beamPositions.needsUpdate = true;
      spellBeamMat.opacity = 0.45 + 0.45 * Math.sin(elapsed * 8);

      // Levanta a grande pena branca suavemente conforme o feitiço avança!
      const targetY = classroom.featherRestPos.y + spellProgress * 0.95;
      classroom.featherGroup.position.y = THREE.MathUtils.lerp(
        classroom.featherGroup.position.y,
        targetY,
        0.15
      );
      classroom.featherGroup.position.x =
        classroom.featherRestPos.x + Math.sin(elapsed * 3.5) * 0.06 * spellProgress;
      classroom.featherGroup.rotation.z = Math.sin(elapsed * 4.0) * 0.15 * spellProgress;
      classroom.featherGroup.rotation.y = elapsed * 0.8 * spellProgress;

      updateMagicParticles(elapsed, classroom.featherGroup.position, 0.32, spellProgress);

      if (spellProgress >= 1.0) {
        transitionToState(STATE.CELEBRATION);
      }
      break;
    }

    case STATE.CELEBRATION: {
      stateTimer += dt;
      // Pena branca continua flutuando majestosamente no alto
      classroom.featherGroup.position.y =
        classroom.featherRestPos.y + 0.98 + Math.sin(elapsed * 2.5) * 0.08;
      classroom.featherGroup.rotation.y = elapsed * 1.1;
      updateMagicParticles(elapsed, classroom.featherGroup.position, 0.55, 1.0);

      // Após 3.5s de comemoração, exibe o painel pronto para o próximo convidado apertando apenas o botão A
      if (stateTimer >= 3.5) {
        vrBannerMesh.visible = true;
        alignBannerInFrontOfPlayer(1.65);
        drawVrBanner({
          badge: '🎉 WINGARDIUM LEVIOSA REALIZADO! 🎉',
          title: 'Parabéns, Jovem Bruxo(a)!',
          subtitle:
            'Obrigado por comemorar o aniversário do Luigi e da Letícia!\nPasse o Meta Quest 3 para o próximo convidado:',
          footer: '👉 Aperte o Botão [A] para iniciar o próximo usuário'
        });

        welcomeModalEl.classList.remove('hidden');
        modalTitleEl.textContent = '✨ Wingardium Leviosa! Experiência Concluída!';
        modalDescEl.innerHTML =
          'A pena branca flutuou! Passe o óculos para o próximo convidado e aperte apenas o <strong>Botão [A]</strong> para recomeçar.';
        btnStartAction.textContent = '🔄 Iniciar Próximo Usuário (Botão A)';
      }
      break;
    }
  }

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Inicia na Tela de Boas-Vindas
transitionToState(STATE.WELCOME);
