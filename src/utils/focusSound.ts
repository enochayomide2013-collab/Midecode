// Web Audio API ambient sound generator for Focus Mode (Lofi Chill, Rain, White Noise)

class FocusSoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseNode: AudioNode | null = null;
  private oscInterval: number | null = null;
  private activeMode: 'off' | 'lofi' | 'rain' | 'whitenoise' = 'off';
  private volumeVal = 0.3;

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volumeVal, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public setVolume(vol: number) {
    this.volumeVal = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volumeVal, this.ctx.currentTime);
    }
  }

  public getMode(): 'off' | 'lofi' | 'rain' | 'whitenoise' {
    return this.activeMode;
  }

  public stop() {
    this.activeMode = 'off';
    if (this.oscInterval) {
      window.clearInterval(this.oscInterval);
      this.oscInterval = null;
    }
    if (this.noiseNode) {
      try {
        (this.noiseNode as AudioScheduledSourceNode).stop();
      } catch {
        // Ignore
      }
      this.noiseNode.disconnect();
      this.noiseNode = null;
    }
  }

  public play(mode: 'lofi' | 'rain' | 'whitenoise') {
    this.initCtx();
    this.stop();
    if (!this.ctx || !this.masterGain) return;
    this.activeMode = mode;

    if (mode === 'whitenoise' || mode === 'rain') {
      // Create pink/white noise buffer for rain or white noise
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        if (mode === 'rain') {
          // Pink noise approximation for rain
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
          data[i] *= 0.05;
          b6 = white * 0.115926;
        } else {
          data[i] = white * 0.15;
        }
      }

      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = buffer;
      noiseSource.loop = true;

      if (mode === 'rain') {
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, this.ctx.currentTime);
        noiseSource.connect(filter);
        filter.connect(this.masterGain);
      } else {
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, this.ctx.currentTime);
        filter.Q.setValueAtTime(1.0, this.ctx.currentTime);
        noiseSource.connect(filter);
        filter.connect(this.masterGain);
      }

      noiseSource.start();
      this.noiseNode = noiseSource;
    } else if (mode === 'lofi') {
      // Ambient Lofi Chord synthesizer (smooth relaxing pentatonic chords)
      const chords = [
        [220.0, 261.63, 329.63, 392.0], // A minor 7
        [174.61, 220.0, 261.63, 329.63], // F major 7
        [196.0, 246.94, 293.66, 349.23], // G major
        [130.81, 164.81, 196.0, 246.94], // C major 7
      ];
      let chordIdx = 0;

      const playChord = () => {
        if (this.activeMode !== 'lofi' || !this.ctx || !this.masterGain) return;
        const chord = chords[chordIdx];
        chordIdx = (chordIdx + 1) % chords.length;

        chord.forEach((freq) => {
          if (!this.ctx || !this.masterGain) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const filter = this.ctx.createBiquadFilter();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(600, this.ctx.currentTime);

          const now = this.ctx.currentTime;
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.04, now + 1.5);
          gain.gain.linearRampToValueAtTime(0, now + 5.5);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(this.masterGain);

          osc.start(now);
          osc.stop(now + 6.0);
        });
      };

      playChord();
      this.oscInterval = window.setInterval(() => {
        playChord();
      }, 6000);
    }
  }
}

export const focusSound = new FocusSoundManager();
