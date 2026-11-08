// Sistema de Áudio Mágico Procedural (Web Audio API) + Voz (MP3 opcional ou TTS em Português)

export class MagicAudioSystem {
  constructor() {
    this.ctx = null;
    this.ambientInterval = null;
    this.currentAudio = null;
  }

  init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
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
   * Fala do personagem:
   * 1. Tenta tocar arquivo MP3 real se você colocar em /public/audio/<audioKey>.mp3
   * 2. Caso não exista o MP3 ainda, usa síntese de voz (Web Speech API) em Português!
   */
  speak(character, text, audioKey = null) {
    this.stopSpeech();

    if (audioKey) {
      const audio = new Audio(`/audio/${audioKey}.mp3`);
      this.currentAudio = audio;
      audio.play().catch(() => {
        // Sem arquivo MP3 gravado ainda -> usa voz sintetizada automaticamente
        this.speakTTS(character, text);
      });
      return;
    }

    this.speakTTS(character, text);
  }

  speakTTS(character, text) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'pt-BR';
      utter.rate = 1.02;
      // Pitch levemente mais agudo para soar infantil e animado
      utter.pitch = character === 'Letícia' ? 1.35 : 1.18;

      const voices = window.speechSynthesis.getVoices();
      const ptVoices = voices.filter(v => v.lang && v.lang.toLowerCase().includes('pt'));
      if (ptVoices.length > 0) {
        utter.voice = ptVoices[0];
      }
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignora caso o navegador bloqueie TTS sem interação
    }
  }

  stopSpeech() {
    if (this.currentAudio) {
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

