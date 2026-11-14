// Sistema de Áudio Mágico Procedural + Reprodução de Voz via Web Audio API (compatível com WebXR no Meta Quest 3)

const SPEECH_KEYS = ['leticia_1', 'leticia_2', 'leticia_3', 'luigi_1', 'luigi_2'];

export class MagicAudioSystem {
  constructor() {
    this.ctx = null;
    this.ambientInterval = null;
    this.currentAudio = null;
    this.currentSourceNode = null;
    this.activeSpeechKey = null;
    this.activeSpeaker = null;
    this.analyser = null;
    this.analyserData = null;
    this.speechCounter = 0;
    this.currentSpeechId = 0;
    this.fallbackEndTimer = null;
    this.rawAudioCache = new Map();   // audioKey -> ArrayBuffer
    this.voiceBuffers = new Map();    // audioKey -> AudioBuffer decodificado
    this.loadingPromises = new Map(); // audioKey -> Promise<AudioBuffer | null>

    // Inicia o pré-carregamento dos arquivos de voz em segundo plano
    this.preloadVoices();
  }

  init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    // Decodifica em AudioBuffers quaisquer arquivos já baixados
    if (this.ctx) {
      for (const key of SPEECH_KEYS) {
        if (this.rawAudioCache.has(key) && !this.voiceBuffers.has(key)) {
          this.loadAndDecodeVoice(key);
        }
      }
    }
  }

  async fetchVoiceArrayBuffer(audioKey) {
    if (this.rawAudioCache.has(audioKey)) {
      return this.rawAudioCache.get(audioKey);
    }
    // Tenta primeiro MP3 personalizado (/public/audio/<key>.mp3) e depois o WAV em português (/public/audio/<key>.wav)
    const urls = [`/audio/${audioKey}.mp3`, `/audio/${audioKey}.wav`];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        // Ignora fallback HTML do Vite caso o .mp3 não exista
        if (contentType.includes('text/html')) continue;
        const buf = await res.arrayBuffer();
        if (buf && buf.byteLength > 1000) {
          this.rawAudioCache.set(audioKey, buf);
          return buf;
        }
      } catch {
        // Tenta o próximo formato
      }
    }
    return null;
  }

  async loadAndDecodeVoice(audioKey) {
    if (this.voiceBuffers.has(audioKey)) {
      return this.voiceBuffers.get(audioKey);
    }
    if (this.loadingPromises.has(audioKey)) {
      return this.loadingPromises.get(audioKey);
    }

    const promise = (async () => {
      const rawBuf = await this.fetchVoiceArrayBuffer(audioKey);
      if (!rawBuf) return null;
      this.init();
      if (!this.ctx) return null;
      try {
        // Usa slice(0) para preservar o ArrayBuffer caso precise decodificar novamente
        const audioBuffer = await this.ctx.decodeAudioData(rawBuf.slice(0));
        this.voiceBuffers.set(audioKey, audioBuffer);
        return audioBuffer;
      } catch (err) {
        console.warn(`Falha ao decodificar áudio ${audioKey}:`, err);
        return null;
      }
    })();

    this.loadingPromises.set(audioKey, promise);
    const result = await promise;
    if (!result) {
      this.loadingPromises.delete(audioKey);
    }
    return result;
  }

  preloadVoices() {
    SPEECH_KEYS.forEach((key) => {
      this.fetchVoiceArrayBuffer(key);
    });
  }

  playTone(freq, duration = 0.6, type = 'sine', volume = 0.12, delay = 0) {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  // Tema estilo caixa de música / celesta de escola de magia
  startAmbientMagic() {
    this.init();
    if (this.ambientInterval) return;

    // Notas inspiradas no clima misterioso de escola de bruxos (Mi menor / Sol)
    const melody = [329.63, 392.00, 493.88, 440.00, 392.00, 587.33, 523.25, 493.88, 392.00, 440.00, 329.63];
    let step = 0;

    this.ambientInterval = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const note = melody[step % melody.length];
      this.playTone(note, 1.4, 'sine', 0.035, 0);
      this.playTone(note * 2, 0.9, 'triangle', 0.015, 0.08);
      step++;
    }, 950);
  }

  stopAmbientMagic() {
    if (this.ambientInterval) {
      clearInterval(this.ambientInterval);
      this.ambientInterval = null;
    }
  }

  playStartChime() {
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((n, i) => this.playTone(n, 0.5, 'triangle', 0.12, i * 0.1));
  }

  playWandPickup() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
    notes.forEach((n, i) => this.playTone(n, 0.45, 'sine', 0.14, i * 0.07));
  }

  playSpellSpark(progress = 0.5) {
    const baseFreq = 400 + progress * 600;
    this.playTone(baseFreq, 0.2, 'sine', 0.06, 0);
  }

  playWingardiumSuccess() {
    const chord = [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.5, 1567.98];
    chord.forEach((n, i) => {
      this.playTone(n, 1.2, 'triangle', 0.14, i * 0.11);
      this.playTone(n * 1.5, 0.8, 'sine', 0.07, i * 0.11 + 0.05);
    });
  }

  /**
   * Reproduz um AudioBuffer diretamente no Web Audio API (funciona 100% no WebXR do Meta Quest 3,
   * mesmo quando disparado automaticamente pela caminhada ou transição de fases!)
   */
  playDecodedVoiceBuffer(audioBuffer, character, speechId, onEnded = null) {
    this.init();
    if (!this.ctx || !audioBuffer) return false;

    try {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      if (!this.analyser) {
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.5;
        this.analyserData = new Uint8Array(this.analyser.fftSize);
      }

      const source = this.ctx.createBufferSource();
      source.buffer = audioBuffer;
      // Leve ajuste de tom para deixar as vozes ainda mais animadas
      const rate = character === 'Letícia' ? 1.06 : 1.02;
      source.playbackRate.value = rate;

      const gain = this.ctx.createGain();
      gain.gain.value = 1.4; // Destaca a voz de forma nítida sobre o som ambiente mágico

      source.connect(gain);
      gain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      const finishSpeech = () => {
        if (this.currentSpeechId !== speechId) return;
        this.activeSpeaker = null;
        if (this.fallbackEndTimer) {
          clearTimeout(this.fallbackEndTimer);
          this.fallbackEndTimer = null;
        }
        if (this.currentSourceNode === source) {
          this.currentSourceNode = null;
        }
        if (typeof onEnded === 'function') {
          onEnded();
        }
      };

      this.currentSourceNode = source;
      this.activeSpeaker = character;
      source.onended = finishSpeech;

      // Timer de segurança baseado na duração exata do buffer caso o contexto de áudio esteja suspenso
      const durationMs = Math.ceil((audioBuffer.duration / rate) * 1000) + 250;
      this.fallbackEndTimer = setTimeout(finishSpeech, durationMs);

      source.start(0);
      return true;
    } catch (err) {
      console.warn('Erro ao tocar buffer de voz:', err);
      return false;
    }
  }

  /**
   * Retorna a intensidade da fala em tempo real [0..1] para animar a boca 3D sobreposta (Opção A.2)
   */
  getSpeechLevel(character, elapsed = 0) {
    if (this.activeSpeaker !== character) return 0;

    if (this.currentSourceNode && this.analyser && this.analyserData && this.ctx && this.ctx.state === 'running') {
      this.analyser.getByteTimeDomainData(this.analyserData);
      let sumSquares = 0;
      let peak = 0;
      const len = this.analyserData.length;
      for (let i = 0; i < len; i++) {
        const centered = (this.analyserData[i] - 128) / 128;
        const abs = Math.abs(centered);
        if (abs > peak) peak = abs;
        sumSquares += centered * centered;
      }
      const rms = Math.sqrt(sumSquares / len);
      const energy = rms * 2.8 + peak * 0.9;
      if (energy < 0.045) return 0;
      return Math.min(1, (energy - 0.045) * 2.5);
    }

    // Fallback procedural de sílabas (HTMLAudio / TTS)
    const syllableWave =
      Math.max(0, Math.sin(elapsed * 15.5) * 0.65 + Math.sin(elapsed * 6.8) * 0.45) *
      (0.55 + 0.45 * Math.sin(elapsed * 2.9));
    return Math.min(1, syllableWave);
  }

  /**
   * Fala do personagem:
   * 1. Usa Web Audio API (AudioBufferSourceNode) com os áudios em /public/audio/<audioKey>.mp3 ou .wav
   *    (garante reprodução dentro do modo VR imersivo no Meta Quest 3, onde speechSynthesis não possui voz PT-BR)
   * 2. Fallback para síntese de voz (Web Speech API) caso necessário
   * 3. Dispara `onEnded` assim que o áudio terminar para ocultar o balão de fala!
   */
  speak(character, text, audioKey = null, onEnded = null) {
    this.stopSpeech();
    this.init();

    const speechId = ++this.speechCounter;
    this.currentSpeechId = speechId;
    this.activeSpeechKey = audioKey;
    this.activeSpeaker = character;

    if (audioKey) {
      const cachedBuffer = this.voiceBuffers.get(audioKey);
      if (cachedBuffer) {
        if (this.playDecodedVoiceBuffer(cachedBuffer, character, speechId, onEnded)) {
          return;
        }
      }

      // Se ainda estiver carregando/decodificando, aguarda e toca assim que estiver pronto
      this.loadAndDecodeVoice(audioKey).then((decoded) => {
        if (this.currentSpeechId !== speechId) return;
        if (decoded && this.playDecodedVoiceBuffer(decoded, character, speechId, onEnded)) {
          return;
        }
        // Fallback final para HTMLAudio ou TTS
        const audio = new Audio(`/audio/${audioKey}.wav`);
        this.currentAudio = audio;
        audio.onended = () => {
          if (this.currentSpeechId === speechId) {
            this.activeSpeaker = null;
            if (typeof onEnded === 'function') {
              onEnded();
            }
          }
        };
        audio.play().catch(() => {
          this.speakTTS(character, text, speechId, onEnded);
        });
      });
      return;
    }

    this.speakTTS(character, text, speechId, onEnded);
  }

  speakTTS(character, text, speechId, onEnded = null) {
    const estimatedMs = Math.max(3800, (text ? text.length : 40) * 70);
    this.fallbackEndTimer = setTimeout(() => {
      if (this.currentSpeechId === speechId) {
        this.activeSpeaker = null;
        if (typeof onEnded === 'function') {
          onEnded();
        }
      }
    }, estimatedMs);

    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'pt-BR';
      utter.rate = 1.02;
      utter.pitch = character === 'Letícia' ? 1.35 : 1.18;

      const voices = window.speechSynthesis.getVoices();
      const ptVoices = voices.filter((v) => v.lang && v.lang.toLowerCase().includes('pt'));
      if (ptVoices.length > 0) {
        utter.voice = ptVoices[0];
      }
      utter.onend = () => {
        if (this.currentSpeechId !== speechId) return;
        this.activeSpeaker = null;
        if (this.fallbackEndTimer) {
          clearTimeout(this.fallbackEndTimer);
          this.fallbackEndTimer = null;
        }
        if (typeof onEnded === 'function') {
          onEnded();
        }
      };
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignora caso o navegador bloqueie TTS sem interação
    }
  }

  stopSpeech() {
    this.currentSpeechId = ++this.speechCounter;
    this.activeSpeechKey = null;
    this.activeSpeaker = null;
    if (this.fallbackEndTimer) {
      clearTimeout(this.fallbackEndTimer);
      this.fallbackEndTimer = null;
    }
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.onended = null;
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch {
        // Ignora caso já tenha finalizado
      }
      this.currentSourceNode = null;
    }
    if (this.currentAudio) {
      this.currentAudio.onended = null;
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignora
      }
    }
  }
}

