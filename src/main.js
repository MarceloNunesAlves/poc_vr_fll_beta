import * as THREE from 'three';
import { createWizardClassroom, createWandMesh } from './classroom.js';
import { createTrainCabin } from './trainCabin.js';
import { createSpeechBubbleMesh, createWizardCharacter } from './characters.js';
import { MagicAudioSystem } from './audio.js';
import { FloorQrAnchorSystem } from './qrFloorAnchors.js';
import { createLeatherGlove } from './leatherGlove.js';
import { FeatherGesture } from './featherGesture.js';

// Estados da Experiência
const STATE = {
  WELCOME: 'WELCOME',                               // Tela de boas-vindas sentado na Cabine de Trem (Aperte A para iniciar)
  TRAIN_CABIN: 'TRAIN_CABIN',                       // Cabine de trem 3D com vídeo Visao_Trem.mp4 na janela à esquerda
  TRAIN_DARK_TRANSITION: 'TRAIN_DARK_TRANSITION',   // Fim do vídeo do trem: escurece tudo e desaparece a cabine
  DOOR_VIDEO: 'DOOR_VIDEO',                         // Tudo escuro e inicia o vídeo Porta.mp4 à frente do usuário
  DOOR_DARK_TRANSITION: 'DOOR_DARK_TRANSITION',     // Fim do vídeo da porta: escurece tudo novamente
  ROOM_AWAKEN: 'ROOM_AWAKEN',                       // Inicia o jogo: desperta na cadeira da sala de bruxos
  GO_TO_LETICIA: 'GO_TO_LETICIA',                   // Ir até o final da sala onde está a Letícia
  SELECT_WAND: 'SELECT_WAND',                       // Escolher uma varinha na mesa ao lado da Letícia
  GO_TO_LUIGI: 'GO_TO_LUIGI',                       // Voltar ao início da sala perto da mesa da professora e do Luigi
  CAST_SPELL: 'CAST_SPELL',                         // Fazer a magia "Wingardium Leviosa" e levantar a pena branca grande
  CELEBRATION: 'CELEBRATION'                        // Finalização e pronto para o próximo usuário apertando A
};

const audio = new MagicAudioSystem();
const qrFloorAnchor = new FloorQrAnchorSystem();

// Elementos do HUD 2D (para tela do Mac/operador)
const phaseLabelEl = document.getElementById('phase-label');
const spellReticleEl = document.getElementById('spell-reticle');
const qrStatusLabelEl = document.getElementById('qr-status-label');
const welcomeModalEl = document.getElementById('welcome-modal');
const modalTitleEl = document.getElementById('modal-title');
const modalDescEl = document.getElementById('modal-desc');
const btnStartAction = document.getElementById('btn-start-action');
const btnEnterVr = document.getElementById('btn-enter-vr');
const btnActionA = document.getElementById('btn-action-a');
const btnSkipVideo = document.getElementById('btn-skip-video');
const btnRecenter = document.getElementById('btn-recenter');
const btnReset = document.getElementById('btn-reset');
const dialogueBoxEl = document.getElementById('dialogue-box');
const dialogueSpeakerEl = document.getElementById('dialogue-speaker');
const dialogueTextEl = document.getElementById('dialogue-text');

// Cena Three.js
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 100);

// Rig do Jogador (permite combinar caminhada física Room-Scale 6DoF + analógico/teclado)
const playerRig = new THREE.Group();
// Posição inicial sentado na cadeira no MEIO da sala / tapete vermelho (X = 0, Z = 0, olhando para -Z)
playerRig.position.set(0, 0, 0);
scene.add(playerRig);
camera.position.set(0, 1.18, 0); // Altura sentado na cadeira
playerRig.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
container.appendChild(renderer.domElement);

// Constrói a Sala de Escola de Bruxos 3D (com Tapete Vermelho central de 4m x 1,5m)
const classroom = createWizardClassroom(scene);

// Personagens 3D posicionados aos lados das mesas (fora do tapete vermelho, onde o usuário não pode acessar):
// - Letícia: na parte de trás da sala, ao lado da mesa das varinhas (X = +1.12m, Z = -1.96m)
// - Luigi: na parte da frente da sala, ao lado da mesa da professora (X = -1.18m, Z = +1.98m)
let leticiaChar = null;
let luigiChar = null;

async function initCharacters() {
  leticiaChar = await createWizardCharacter({
    name: 'Letícia',
    imageUrl: '/assets/leticia.jpg',
    glbUrl: '/models/leticia.glb',
    position: new THREE.Vector3(1.12, 0, -1.96), // Parte de trás da sala, ao lado da mesa de varinhas (fora do tapete)
    rotationY: -0.45,
    height: 1.28,
    accentColor: 0xf5d061
  });
  classroom.roomGroup.add(leticiaChar.group);

  luigiChar = await createWizardCharacter({
    name: 'Luigi',
    imageUrl: '/assets/luigi.jpg',
    glbUrl: '/models/luigi.glb',
    position: new THREE.Vector3(-1.18, 0.08, 1.98), // Parte da frente da sala, ao lado da mesa da professora (fora do tapete)
    rotationY: 2.6,
    height: 1.34,
    accentColor: 0xffae00
  });
  classroom.roomGroup.add(luigiChar.group);
}
initCharacters();

// ============================================================================
// CABINE DE TREM 3D (JANELA À ESQUERDA COM Visao_Trem.mp4) E PORTA (Porta.mp4)
// ============================================================================
const trainVideoEl = document.createElement('video');
trainVideoEl.src = '/video/Visao_Trem.mp4';
trainVideoEl.crossOrigin = 'anonymous';
trainVideoEl.playsInline = true;
trainVideoEl.preload = 'auto';
trainVideoEl.loop = false;

trainVideoEl.addEventListener('loadedmetadata', () => {
  if (currentState === STATE.WELCOME) {
    trainVideoEl.currentTime = 0.05;
  }
});

trainVideoEl.addEventListener('ended', () => {
  if (currentState === STATE.TRAIN_CABIN) {
    transitionToState(STATE.TRAIN_DARK_TRANSITION);
  }
});

const trainVideoTex = new THREE.VideoTexture(trainVideoEl);
trainVideoTex.colorSpace = THREE.SRGBColorSpace;
trainVideoTex.minFilter = THREE.LinearFilter;
trainVideoTex.magFilter = THREE.LinearFilter;

// Constrói a Cabine de Trem 3D com a janela à esquerda do usuário sentado (alinhada ao centro Z = 0)
const trainCabin = createTrainCabin(scene, trainVideoTex);
trainCabin.cabinGroup.position.set(0, 0, -1.45);

// Vídeo da Porta (/video/Porta.mp4 - 720x1280 vertical) exibido à frente do usuário na escuridão
const doorVideoEl = document.createElement('video');
doorVideoEl.src = '/video/Porta.mp4';
doorVideoEl.crossOrigin = 'anonymous';
doorVideoEl.playsInline = true;
doorVideoEl.preload = 'auto';
doorVideoEl.loop = false;

doorVideoEl.addEventListener('ended', () => {
  if (currentState === STATE.DOOR_VIDEO) {
    transitionToState(STATE.DOOR_DARK_TRANSITION);
  }
});

const doorVideoTex = new THREE.VideoTexture(doorVideoEl);
doorVideoTex.colorSpace = THREE.SRGBColorSpace;
doorVideoTex.minFilter = THREE.LinearFilter;
doorVideoTex.magFilter = THREE.LinearFilter;

// Tela 3D vertical (proporção 9:16 = 720x1280) para reproduzir Porta.mp4 à frente do usuário
const doorVideoMat = new THREE.MeshBasicMaterial({
  map: doorVideoTex,
  color: 0xffffff,
  side: THREE.DoubleSide
});
const doorVideoMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(1.35, 2.40),
  doorVideoMat
);
doorVideoMesh.visible = false;
scene.add(doorVideoMesh);

let doorVideoPrimed = false;

function primeDoorVideoOnGesture() {
  if (doorVideoPrimed) return;
  doorVideoPrimed = true;
  doorVideoEl.muted = true;
  const p = doorVideoEl.play();
  if (p && typeof p.then === 'function') {
    p.then(() => {
      if (currentState !== STATE.DOOR_VIDEO) {
        doorVideoEl.pause();
        doorVideoEl.currentTime = 0;
      }
      doorVideoEl.muted = false;
    }).catch(() => {
      doorVideoEl.muted = false;
    });
  }
}

function playVideoElement(videoEl) {
  videoEl.currentTime = 0;
  videoEl.muted = false;
  const p = videoEl.play();
  if (p && typeof p.catch === 'function') {
    p.catch(() => {
      videoEl.muted = true;
      videoEl.play().catch(() => {});
    });
  }
}

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
// e getController(1) recebe o 2º. A mão direita é identificada pelo handedness.
const controller0 = renderer.xr.getController(0);
const controller1 = renderer.xr.getController(1);
playerRig.add(controller0, controller1);

const xrControllers = [controller0, controller1];

// O centro da empunhadura fica no cabo, a 5,5 cm da origem da varinha.
const wandGripZ = 0.055;
const xrWandOffset = new THREE.Vector3(0, -0.008, -0.04);
const desktopHandRestY = -0.22;
const handHolder = new THREE.Group();
camera.add(handHolder);
handHolder.position.set(0.24, desktopHandRestY, -0.48);
const desktopGlove = createLeatherGlove();
desktopGlove.group.position.z = wandGripZ;
desktopGlove.group.visible = false;
handHolder.add(desktopGlove.group);

const xrGloves = xrControllers.map((controller) => {
  const glove = createLeatherGlove();
  glove.group.position.copy(xrWandOffset);
  glove.group.position.z += wandGripZ;
  glove.group.visible = false;
  controller.add(glove.group);
  return glove;
});

xrControllers.forEach((ctrl, idx) => {
  ctrl.userData.index = idx;
  ctrl.userData.handedness = null;
  ctrl.userData.isConnected = false;

  ctrl.addEventListener('connected', (e) => {
    ctrl.userData.isConnected = true;
    ctrl.userData.handedness = e.data ? e.data.handedness : null;
    xrGloves[idx].setHandedness(ctrl.userData.handedness);
  });

  ctrl.addEventListener('disconnected', () => {
    ctrl.userData.isConnected = false;
    ctrl.userData.handedness = null;
  });
});

function getActiveWandController() {
  const right = xrControllers.find((c) => c.userData.isConnected && c.userData.handedness === 'right');
  if (right?.visible) return right;
  return xrControllers.find((c) => c.visible && c.userData.isConnected)
    || right
    || xrControllers.find((c) => c.userData.isConnected)
    || controller0;
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
spellBeam.visible = false;
spellBeam.frustumCulled = false;
scene.add(spellBeam);

const featherGesture = new FeatherGesture();
const featherAimTarget = new THREE.Sphere(new THREE.Vector3(), 0.16);
const featherAimRay = new THREE.Ray();
const featherPrompt = createSpeechBubbleMesh('Wingardium Leviosa', '');
featherPrompt.mesh.position.copy(classroom.featherRestPos).add(new THREE.Vector3(0, 0.38, 0.16));
featherPrompt.mesh.scale.setScalar(0.8);
classroom.roomGroup.add(featherPrompt.mesh);

const featherInstructions = {
  aim: 'Mire na pena',
  raise: 'Levante a varinha',
  lower: 'Abaixe a varinha e volte a mirar na pena',
  complete: 'Wingardium Leviosa!'
};
let featherInput = null;

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
let hasWand = false;
let prevButtonAPressed = false;
let prevButtonBPressed = false;

// Controle da Cadeira Central: desaparece 10s após o movimento do usuário na sala
const CHAIR_DISAPPEAR_DELAY = 10.0;
let chairMoveDetected = false;
let chairDisappearTimer = 0;
const chairOriginPos = new THREE.Vector3(0, 0, 0);

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

function positionDoorVideoInFrontOfPlayer() {
  // Posiciona o vídeo Porta.mp4 (720x1280 vertical) diretamente à frente do usuário sentado (-Z no rig)
  playerRig.updateWorldMatrix(true, false);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerRig.quaternion);
  forward.y = 0;
  if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
  forward.normalize();

  const camPos = getPlayerWorldPosition();
  doorVideoMesh.position.copy(camPos).addScaledVector(forward, 1.95);
  doorVideoMesh.position.y = 1.22;
  doorVideoMesh.lookAt(camPos.x, 1.22, camPos.z);
}

function transitionToState(newState) {
  currentState = newState;
  stateTimer = 0;

  // Limpa linha guia de mira e destaque das varinhas ao trocar de estado
  wandAimLine.visible = false;
  spellBeam.visible = false;
  spellReticleEl.hidden = true;
  featherPrompt.mesh.visible = false;
  classroom.featherAura.material.opacity = 0.65;
  classroom.wandsOnTable.forEach((w) => {
    w.userData.isHovered = false;
  });

  switch (newState) {
    case STATE.WELCOME: {
      phaseLabelEl.textContent = '1/8 • Cabine do Trem — Aguardando Início (Aperte A)';
      welcomeModalEl.classList.remove('hidden');
      modalTitleEl.textContent = 'Bem-vindo à Escola de Magia do Luigi e da Letícia!';
      modalDescEl.innerHTML =
        'Você está na cabine do Expresso Mágico! Coloque o Meta Quest 3 e aperte o <strong>Botão [A]</strong> do controle direito para começar a viagem!';
      btnStartAction.textContent = '▶ Iniciar Viagem de Trem (Botão A / Espaço)';

      // Pausa vídeos de abertura e para trilha ambiente
      trainVideoEl.pause();
      if (trainVideoEl.readyState >= 1) {
        trainVideoEl.currentTime = 0.05;
      }
      doorVideoEl.pause();
      if (doorVideoEl.readyState >= 1) {
        doorVideoEl.currentTime = 0;
      }
      audio.stopAmbientMagic();
      audio.stopSpeech();

      // Reseta estado da sala, cadeira central, varinhas e pena
      hasWand = false;
      featherGesture.reset();
      featherInput = null;
      playerWand.visible = false;
      magicParticles.visible = false;
      chairMoveDetected = false;
      chairDisappearTimer = 0;
      classroom.setChairState(true, 1.0);
      classroom.wandsOnTable.forEach((w) => {
        w.visible = true;
        w.userData.isHovered = false;
      });
      classroom.featherGroup.position.copy(classroom.featherRestPos);
      classroom.featherGroup.rotation.set(0, 0, 0);

      // Jogador sentado no meio da sala / banco da cabine de trem (X = 0, Z = 0)
      if (!qrFloorAnchor.applyAnchorToRig(playerRig, false)) {
        playerRig.position.set(0, 0, 0);
        playerRig.rotation.set(0, 0, 0);
        camera.rotation.set(0, 0, 0);
      }

      // Exibe a Cabine de Trem 3D como cenário inicial e esconde a sala e a porta
      trainCabin.cabinGroup.visible = true;
      trainCabin.setCabinBrightness(0.75);
      classroom.roomGroup.visible = false;
      doorVideoMesh.visible = false;
      blackoutMat.opacity = 0;
      vrBannerMesh.visible = true;

      drawVrBanner({
        badge: '🚂 EXPRESSO DA ESCOLA DE MAGIA • LUIGI & LETÍCIA 🪄',
        title: 'Bem-vindo a Bordo!',
        subtitle: 'Sente-se confortavelmente na cabine do trem.\nOlhe pela janela à sua esquerda quando a viagem começar!',
        footer: '👉 Aperte o Botão [A] no controle direito'
      });

      setHUDDialogue('', '');
      break;
    }

    case STATE.TRAIN_CABIN: {
      phaseLabelEl.textContent = '2/8 • Cabine de Trem (Vídeo Visao_Trem.mp4 na janela à esquerda)';
      welcomeModalEl.classList.add('hidden');
      audio.playStartChime();

      // Garante que apenas a Cabine de Trem 3D esteja visível com a paisagem na janela esquerda
      trainCabin.cabinGroup.visible = true;
      trainCabin.setCabinBrightness(1.0);
      classroom.roomGroup.visible = false;
      doorVideoMesh.visible = false;
      vrBannerMesh.visible = false;
      blackoutMat.opacity = 0;

      // No simulador de PC/Mac (fora do VR), orienta suavemente a câmera na diagonal esquerda
      // para mostrar de imediato os bancos 3D da cabine e a janela à esquerda com o vídeo!
      if (!renderer.xr.isPresenting) {
        playerRig.rotation.y = 0.85;
        camera.rotation.x = -0.03;
      }

      playVideoElement(trainVideoEl);
      setHUDDialogue('', '');
      break;
    }

    case STATE.TRAIN_DARK_TRANSITION: {
      phaseLabelEl.textContent = '3/8 • Fim da Viagem de Trem (Tudo Escuro...)';
      trainVideoEl.pause();

      // "Ao final do video escuresse tudo e desaparece tudo e fica tudo escuro"
      trainCabin.cabinGroup.visible = false;
      classroom.roomGroup.visible = false;
      doorVideoMesh.visible = false;
      vrBannerMesh.visible = false;
      blackoutMat.opacity = 1.0;

      // No modo Desktop (PC/Mac), realinha o olhar para frente (-Z) enquanto está tudo escuro
      // para que o vídeo Porta.mp4 apareça bem à frente do usuário
      if (!renderer.xr.isPresenting) {
        playerRig.rotation.y = 0;
        camera.rotation.x = 0;
      }
      break;
    }

    case STATE.DOOR_VIDEO: {
      phaseLabelEl.textContent = '4/8 • Vídeo Porta.mp4 à frente do usuário';
      trainCabin.cabinGroup.visible = false;
      classroom.roomGroup.visible = false;
      vrBannerMesh.visible = false;

      // Posiciona e exibe o vídeo Porta.mp4 à frente do usuário no ambiente totalmente escuro
      positionDoorVideoInFrontOfPlayer();
      doorVideoMesh.visible = true;
      doorVideoMat.color.setScalar(1.0);
      playVideoElement(doorVideoEl);
      break;
    }

    case STATE.DOOR_DARK_TRANSITION: {
      phaseLabelEl.textContent = '5/8 • Porta Mágica Transicionando (Tudo Escuro...)';
      doorVideoEl.pause();
      doorVideoMesh.visible = false;
      trainCabin.cabinGroup.visible = false;
      classroom.roomGroup.visible = false;
      vrBannerMesh.visible = false;
      blackoutMat.opacity = 1.0;
      break;
    }

    case STATE.ROOM_AWAKEN: {
      phaseLabelEl.textContent = '6/8 • Despertando no Meio da Sala de Escola de Bruxos';
      trainCabin.cabinGroup.visible = false;
      doorVideoMesh.visible = false;
      classroom.roomGroup.visible = true;
      classroom.setRoomBrightness(0.0);
      vrBannerMesh.visible = false;
      audio.startAmbientMagic();

      // Garante que a cadeira central esteja visível e posiciona o jogador sentado no meio (X = 0, Z = 0)
      chairMoveDetected = false;
      chairDisappearTimer = 0;
      classroom.setChairState(true, 1.0);

      if (!qrFloorAnchor.applyAnchorToRig(playerRig, false)) {
        playerRig.position.set(0, 0, 0);
      }
      break;
    }

    case STATE.GO_TO_LETICIA: {
      phaseLabelEl.textContent = '7/8 • Vá até a parte de trás da sala falar com a Letícia';
      classroom.setRoomBrightness(1.0);
      const startPos = getPlayerWorldPosition();
      chairOriginPos.set(startPos.x, 0, startPos.z);

      const msg =
        'Olá! Bem-vindo à nossa Escola de Magia! Venha andando pelo tapete vermelho até aqui na parte de trás da sala para escolher sua varinha!';
      speakCharacterDialogue('Letícia', msg, 'leticia_1');
      break;
    }

    case STATE.SELECT_WAND: {
      phaseLabelEl.textContent = '7/8 • Escolha uma Varinha na mesa ao lado da Letícia';
      const msg =
        'Que demais que você veio! Escolha uma varinha mágica na mesa ao meu lado! Basta encostar sua mão nela ou apertar o botão A!';
      speakCharacterDialogue('Letícia', msg, 'leticia_2');
      break;
    }

    case STATE.GO_TO_LUIGI: {
      phaseLabelEl.textContent = '8/8 • Vá até a frente da sala (Mesa da Professora com o Luigi)';
      // No modo Desktop (PC/Mac), vira suavemente o olhar para a frente da sala (+Z) onde estão a Mesa da Professora e o Luigi
      if (!renderer.xr.isPresenting) {
        playerRig.rotation.y = Math.PI;
      }
      const msg =
        'A varinha escolheu você! Agora vá pelo tapete vermelho até a parte da frente da sala, na mesa da professora, onde o Luigi vai te ajudar a fazer a magia!';
      speakCharacterDialogue('Letícia', msg, 'leticia_3');
      break;
    }

    case STATE.CAST_SPELL: {
      featherGesture.reset();
      featherInput = null;
      showFeatherInstruction();
      magicParticles.visible = false;
      const msg =
        'Oi! Olhe a grande pena branca na mesa da professora! Aponte sua varinha, levante a mão e depois abaixe-a, voltando a mirar na pena.';
      speakCharacterDialogue('Luigi', msg, 'luigi_1');
      break;
    }

    case STATE.CELEBRATION: {
      phaseLabelEl.textContent = '✨ Concluído! Aperte [A] para o Próximo Convidado';
      audio.playWingardiumSuccess();
      triggerControllerHaptics(1.0, 400);

      const msg =
        'Wingardium Leviosa! Uau, você conseguiu levantar a pena! Parabéns! Muito obrigado por vir no nosso aniversário!';
      speakCharacterDialogue('Luigi', msg, 'luigi_2');
      break;
    }
  }
}

// Permite ao operador pular o vídeo de abertura atual durante testes (Tecla [P] ou botão no HUD)
function skipCurrentIntroVideo() {
  if (currentState === STATE.TRAIN_CABIN) {
    transitionToState(STATE.TRAIN_DARK_TRANSITION);
  } else if (currentState === STATE.TRAIN_DARK_TRANSITION) {
    transitionToState(STATE.DOOR_VIDEO);
  } else if (currentState === STATE.DOOR_VIDEO) {
    transitionToState(STATE.DOOR_DARK_TRANSITION);
  } else if (currentState === STATE.DOOR_DARK_TRANSITION) {
    transitionToState(STATE.ROOM_AWAKEN);
  }
}

// ============================================================================
// AÇÃO DO BOTÃO "A" (UNIVERSAL E FÁCIL PARA QUALQUER CRIANÇA OU CONVIDADO)
// ============================================================================
function handlePrimaryActionButtonA() {
  if (currentState === STATE.CAST_SPELL) return;

  audio.init();
  primeDoorVideoOnGesture();
  triggerControllerHaptics(0.6, 80);

  if (currentState === STATE.WELCOME) {
    transitionToState(STATE.TRAIN_CABIN);
    return;
  }

  if (currentState === STATE.GO_TO_LETICIA) {
    // Se a pessoa apertar A enquanto caminha ou se preferir avançar com o botão até a Letícia na parte de trás da sala:
    chairMoveDetected = true;
    const playerPos = getPlayerWorldPosition();
    if (playerPos.z > -1.15) {
      // Dá um passo suave pelo tapete vermelho em direção à mesa de trás (-Z)
      playerRig.position.z = Math.max(-1.45, playerRig.position.z - 0.75);
      clampPlayerInsideClassroom();
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
    chairMoveDetected = true;
    const playerPos = getPlayerWorldPosition();
    if (playerPos.z < 1.10) {
      playerRig.position.z = Math.min(1.45, playerRig.position.z + 0.85);
      clampPlayerInsideClassroom();
    } else {
      transitionToState(STATE.CAST_SPELL);
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

function syncPlayerHandsAndWand(dt = 0) {
  const immersive = renderer.xr.isPresenting;
  const activeCtrl = immersive ? getActiveWandController() : null;
  desktopGlove.group.visible = !immersive && classroom.roomGroup.visible;
  desktopGlove.setGrip(!immersive && hasWand, dt);
  xrControllers.forEach((controller, i) => {
    const glove = xrGloves[i];
    glove.group.visible = immersive && controller.userData.isConnected;
    glove.setGrip(hasWand && activeCtrl === controller, dt);
  });

  // Mantém a pose da varinha e a origem da mira usadas pelo feitiço.
  playerWand.visible = hasWand;
  if (!hasWand) return;
  const anchor = activeCtrl || handHolder;
  anchor.getWorldPosition(playerWand.position);
  anchor.getWorldQuaternion(playerWand.quaternion);
  if (activeCtrl) {
    playerWand.position.add(tempVecB.copy(xrWandOffset).applyQuaternion(playerWand.quaternion));
  }
  playerWand.updateMatrixWorld(true);
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
    // Aplica na varinha da mão exatamente o modelo 3D (.glb) e o brilho da varinha escolhida na mesa!
    if (playerWand.userData.setWandModel) {
      playerWand.userData.setWandModel(
        chosen.userData.glbUrl,
        chosen.userData.woodColor,
        chosen.userData.glowColor
      );
    } else if (playerWand.userData.setColors) {
      playerWand.userData.setColors(chosen.userData.woodColor, chosen.userData.glowColor);
    }
    spellBeamMat.color.setHex(chosen.userData.glowColor || 0xffe885);
    particleMat.color.setHex(chosen.userData.glowColor || 0xffe885);
  }

  // Posiciona imediatamente a varinha no controle ativo do jogador
  syncPlayerHandsAndWand();
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

function showFeatherInstruction() {
  const step = featherGesture.step;
  const immersive = renderer.xr.isPresenting;
  const showAim = step !== 'complete';
  const instruction = featherInstructions[step];
  const hint = !immersive && step === 'aim' ? 'Arraste o mouse para mirar na pena' : instruction;
  phaseLabelEl.textContent = `8/8 • ${hint}`;
  spellReticleEl.hidden = immersive || !showAim;
  featherPrompt.updateText(instruction, immersive && showAim);
}

function resetFeatherAim() {
  if (currentState !== STATE.CAST_SPELL || featherGesture.step === 'complete') return;
  featherGesture.reset();
  showFeatherInstruction();
}

function updateFeatherGesture(dt, wandTipPos) {
  const immersive = renderer.xr.isPresenting;
  const candidate = immersive ? getActiveWandController() : camera;
  const input = immersive && (!candidate.visible || !candidate.userData.isConnected) ? null : candidate;
  if (input !== featherInput) {
    featherInput = input;
    resetFeatherAim();
  }

  let aiming = false;
  if (input) {
    classroom.featherGroup.getWorldPosition(featherAimTarget.center);
    if (immersive) {
      featherAimRay.origin.copy(playerWand.position);
      featherAimRay.direction.set(0, 0, -1).applyQuaternion(playerWand.quaternion);
    } else {
      camera.getWorldPosition(featherAimRay.origin);
      camera.getWorldDirection(featherAimRay.direction);
    }

    aiming = featherAimRay.intersectsSphere(featherAimTarget);
    const previousStep = featherGesture.step;
    const height = immersive ? wandTipPos.y - playerRig.position.y : camera.rotation.x;
    const liftDistance = immersive ? 0.12 : 0.20; // Metros no Quest e radianos no desktop.
    featherGesture.update(dt, aiming, height, liftDistance);

    if (featherGesture.step !== previousStep) {
      showFeatherInstruction();
      if (featherGesture.step === 'raise' || featherGesture.step === 'lower') {
        audio.playSpellSpark(featherGesture.step === 'raise' ? 0.3 : 0.65);
        triggerControllerHaptics(0.35, 60);
      }
    }
  }

  spellReticleEl.classList.toggle('aiming', aiming);
  classroom.featherAura.material.opacity = aiming ? 1.0 : 0.65;
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
    playerRig.position.set(0, 0, 0);
    playerRig.rotation.set(0, 0, 0);
  }
  resetFeatherAim();
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
  if (k === 'KeyP') {
    skipCurrentIntroVideo();
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

// No desktop, arrastar o mouse move o olhar e a varinha equipada.
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

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

// Botões da interface
btnStartAction.addEventListener('click', () => handlePrimaryActionButtonA());
btnActionA.addEventListener('click', () => handlePrimaryActionButtonA());
if (btnSkipVideo) {
  btnSkipVideo.addEventListener('click', () => skipCurrentIntroVideo());
}
btnRecenter.addEventListener('click', () => recenterChairPosition());
btnReset.addEventListener('click', () => transitionToState(STATE.WELCOME));

// O gatilho e o grip dos dois controles continuam acionando a ação principal.
xrControllers.forEach((ctrl) => {
  ctrl.addEventListener('selectstart', () => {
    handlePrimaryActionButtonA();
  });
  ctrl.addEventListener('squeezestart', () => {
    if (currentState === STATE.SELECT_WAND) {
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
  if (!session) return;

  let buttonAPressedNow = false;
  let buttonBPressedNow = false;

  for (const source of session.inputSources) {
    if (!source.gamepad) continue;
    const gp = source.gamepad;

    // No Meta Quest Touch Plus Controller:
    // buttons[0] = Trigger (Gatilho)
    // buttons[1] = Squeeze (Grip lateral)
    // buttons[4] = Botão A (mão direita) / Botão X (mão esquerda)
    // buttons[5] = Botão B (mão direita) / Botão Y (mão esquerda)
    const btnA = gp.buttons[4] && gp.buttons[4].pressed;
    const btnB = gp.buttons[5] && gp.buttons[5].pressed;

    if (btnA) buttonAPressedNow = true;
    if (btnB) buttonBPressedNow = true;

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
}

// Mantém o usuário estritamente dentro do Tapete Vermelho central (1,5m de largura x 4,0m de comprimento)
function clampPlayerInsideClassroom() {
  const maxX = 0.68;
  const maxZ = 1.82;
  playerRig.position.x = THREE.MathUtils.clamp(playerRig.position.x, -maxX, maxX);
  playerRig.position.z = THREE.MathUtils.clamp(playerRig.position.z, -maxZ, maxZ);

  // Caso o usuário caminhe fisicamente em 6DoF no VR além das bordas do tapete vermelho,
  // corrige suavemente o rig para que ele nunca atravesse as carteiras laterais nem saia do tapete
  if (renderer.xr.isPresenting) {
    playerRig.updateWorldMatrix(true, false);
    camera.getWorldPosition(tempVecA);
    if (tempVecA.x < -maxX) playerRig.position.x += -maxX - tempVecA.x;
    if (tempVecA.x > maxX) playerRig.position.x += maxX - tempVecA.x;
    if (tempVecA.z < -maxZ) playerRig.position.z += -maxZ - tempVecA.z;
    if (tempVecA.z > maxZ) playerRig.position.z += maxZ - tempVecA.z;
  }
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
      resetFeatherAim();
      triggerControllerHaptics(0.65, 110);
    });
  }

  pollQuest3Gamepads(dt);
  updateDesktopMovement(dt);

  // Nas fases dentro da Sala de Aula, restringe o andar apenas ao Tapete Vermelho central
  // e controla o desaparecimento da cadeira central 10s após o movimento do usuário!
  const isClassroomActive =
    currentState === STATE.GO_TO_LETICIA ||
    currentState === STATE.SELECT_WAND ||
    currentState === STATE.GO_TO_LUIGI ||
    currentState === STATE.CAST_SPELL ||
    currentState === STATE.CELEBRATION;

  if (isClassroomActive) {
    clampPlayerInsideClassroom();
  }

  syncPlayerHandsAndWand(dt);

  const playerPos = getPlayerWorldPosition();
  const wandTipPos = getWandTipWorldPosition();

  if (isClassroomActive && classroom.playerChair.visible) {
    if (!chairMoveDetected) {
      const movedDist = Math.hypot(playerPos.x - chairOriginPos.x, playerPos.z - chairOriginPos.z);
      if (movedDist > 0.08) {
        chairMoveDetected = true;
        chairDisappearTimer = 0;
      }
    } else {
      chairDisappearTimer += dt;
      if (chairDisappearTimer >= CHAIR_DISAPPEAR_DELAY) {
        classroom.setChairState(false, 0.0);
      } else if (chairDisappearTimer > CHAIR_DISAPPEAR_DELAY - 1.5) {
        const fade = 1.0 - (chairDisappearTimer - (CHAIR_DISAPPEAR_DELAY - 1.5)) / 1.5;
        classroom.setChairState(true, fade);
      }
    }
  }

  // Atualiza a Cabine de Trem 3D quando visível
  trainCabin.update(elapsed);

  // Atualiza personagens 3D (Letícia e Luigi) com sincronia labial da boca 3D sobreposta (Opção A.2)
  if (leticiaChar) {
    leticiaChar.update(elapsed, playerPos, audio.getSpeechLevel('Letícia', elapsed));
  }
  if (luigiChar) {
    luigiChar.update(elapsed, playerPos, audio.getSpeechLevel('Luigi', elapsed));
  }

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

    case STATE.TRAIN_CABIN: {
      stateTimer += dt;
      // Nos últimos 1.0s do vídeo Visao_Trem.mp4, escurece suavemente a cabine e a visão
      const dur = trainVideoEl.duration;
      if (Number.isFinite(dur) && dur > 0) {
        const remaining = dur - trainVideoEl.currentTime;
        if (remaining <= 1.0) {
          const fadeOut = THREE.MathUtils.clamp(1.0 - remaining / 1.0, 0, 1);
          blackoutMat.opacity = fadeOut;
          trainCabin.setCabinBrightness(1.0 - fadeOut);
        } else {
          blackoutMat.opacity = 0;
          trainCabin.setCabinBrightness(1.0);
        }
      }
      break;
    }

    case STATE.TRAIN_DARK_TRANSITION: {
      // "Ao final do video escuresse tudo e desaparece tudo e fica tudo escuro"
      stateTimer += dt;
      blackoutMat.opacity = 1.0;
      if (stateTimer >= 1.2) {
        transitionToState(STATE.DOOR_VIDEO);
      }
      break;
    }

    case STATE.DOOR_VIDEO: {
      // "...e inicia o video Porta.mp4 a frente do usuário"
      stateTimer += dt;
      const dur = doorVideoEl.duration;
      if (stateTimer < 0.6) {
        // Revela suavemente o vídeo da porta à frente do usuário na escuridão
        blackoutMat.opacity = THREE.MathUtils.clamp(1.0 - stateTimer / 0.6, 0, 1);
      } else if (Number.isFinite(dur) && dur > 0 && dur - doorVideoEl.currentTime <= 0.8) {
        // "Ao final do video escurresse tudo de novo"
        const remaining = dur - doorVideoEl.currentTime;
        blackoutMat.opacity = THREE.MathUtils.clamp(1.0 - remaining / 0.8, 0, 1);
      } else {
        blackoutMat.opacity = 0;
      }
      break;
    }

    case STATE.DOOR_DARK_TRANSITION: {
      // "Ao final do video escurresse tudo de novo e inicia o jogo"
      stateTimer += dt;
      blackoutMat.opacity = 1.0;
      if (stateTimer >= 1.0) {
        transitionToState(STATE.ROOM_AWAKEN);
      }
      break;
    }

    case STATE.ROOM_AWAKEN: {
      // Aos poucos vai iniciando a experiência com o usuário sentado na cadeira da sala de escola de bruxos
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
      // Verifica se o usuário chegou na parte de trás da sala perto da mesa de varinhas e da Letícia (Z <= -1.15m)
      if (playerPos.z <= -1.15) {
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
      // Verifica se o usuário chegou na parte da frente da sala perto da mesa da professora e do Luigi (Z >= +1.10m)
      if (playerPos.z >= 1.10) {
        transitionToState(STATE.CAST_SPELL);
      }
      break;
    }

    case STATE.CAST_SPELL: {
      if (featherGesture.step !== 'complete') {
        updateFeatherGesture(dt, wandTipPos);
        if (featherPrompt.mesh.visible) featherPrompt.mesh.lookAt(playerPos);
        if (featherGesture.step !== 'complete') {
          break;
        }
        spellBeam.visible = true;
        magicParticles.visible = true;
        audio.playSpellSpark(1.0);
      }

      // A pena sai da mesa somente após a confirmação do gesto completo.
      stateTimer += dt;
      const rise = THREE.MathUtils.smoothstep(stateTimer, 0, 0.85);
      const featherPos = classroom.featherGroup.position;
      featherPos.y = classroom.featherRestPos.y + rise * 0.95;
      featherPos.x = classroom.featherRestPos.x + Math.sin(elapsed * 3.5) * 0.06 * rise;
      classroom.featherGroup.rotation.z = Math.sin(elapsed * 4.0) * 0.15 * rise;
      classroom.featherGroup.rotation.y = elapsed * 0.8 * rise;

      const beamPositions = spellBeam.geometry.attributes.position;
      beamPositions.setXYZ(0, wandTipPos.x, wandTipPos.y, wandTipPos.z);
      beamPositions.setXYZ(1, featherPos.x, featherPos.y, featherPos.z);
      beamPositions.needsUpdate = true;
      spellBeamMat.opacity = 0.6 + 0.3 * Math.sin(elapsed * 8);
      updateMagicParticles(elapsed, featherPos, 0.32, rise);

      if (rise >= 1.0) {
        transitionToState(STATE.CELEBRATION);
      }
      break;
    }

    case STATE.CELEBRATION: {
      stateTimer += dt;
      // Pena branca continua flutuando majestosamente no alto
      classroom.featherGroup.position.y =
        classroom.featherRestPos.y + 0.95 + Math.sin(stateTimer * 2.5) * 0.08;
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
