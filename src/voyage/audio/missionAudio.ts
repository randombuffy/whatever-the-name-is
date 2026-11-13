// Small Web Audio bed. No downloaded files. Silent until the first gesture,
// and the mute choice is stored apart from language, reading level and run history.

const STORAGE_KEY = 'mars2100.audio.v1';

export type AudioBed = 'launch' | 'transit' | 'approach' | 'entry' | 'descent' | 'surface' | 'storm' | 'silent';
export type AudioCue = 'plasma' | 'chute' | 'engine' | 'thump';

function readMuted() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'off';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on');
  } catch {
    // The choice still applies for this session.
  }
}

class MissionAudio {
  muted = false;
  private unlocked = false;
  private reduced = false;
  private bed: AudioBed = 'silent';
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bedGain: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private noise: AudioBuffer | null = null;
  private lastCue = '';
  private lastCueAt = 0;

  constructor() {
    this.muted = readMuted();
  }

  setReduced(reduced: boolean) {
    this.reduced = reduced;
    this.applyGain();
  }

  unlock() {
    const AudioCtx = window.AudioContext;
    if (!AudioCtx) return;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
      this.bedGain = this.ctx.createGain();
      this.bedGain.gain.value = 0;
      this.bedGain.connect(this.master);
      const length = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const first = !this.unlocked;
    this.unlocked = true;
    this.applyGain();
    if (first) this.rebuildBed();
  }

  toggleMuted() {
    this.muted = !this.muted;
    writeMuted(this.muted);
    this.unlock();
    this.applyGain();
    return this.muted;
  }

  setBed(bed: AudioBed) {
    if (this.bed === bed) return;
    this.bed = bed;
    if (this.unlocked) this.rebuildBed();
  }

  cue(name: AudioCue) {
    if (!this.unlocked || this.muted || this.reduced || !this.ctx || !this.master) return;
    const now = performance.now();
    if (this.lastCue === name && now - this.lastCueAt < 500) return;
    this.lastCue = name;
    this.lastCueAt = now;
    if (name === 'plasma') this.noiseBurst(0.9, 900, 0.12);
    else if (name === 'chute') this.noiseBurst(0.28, 420, 0.16);
    else if (name === 'engine') this.tone(92, 0.7, 'sawtooth', 0.05);
    else this.tone(70, 0.45, 'sine', 0.2);
  }

  private applyGain() {
    if (!this.ctx || !this.master) return;
    const target = !this.unlocked || this.muted ? 0 : this.reduced ? 0.22 : 1;
    const gain = this.master.gain;
    gain.cancelScheduledValues(this.ctx.currentTime);
    gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.08);
  }

  private stopBed() {
    for (const node of this.nodes) {
      const stoppable = node as OscillatorNode;
      if (typeof stoppable.stop === 'function') {
        try { stoppable.stop(); } catch { /* already stopped */ }
      }
      node.disconnect();
    }
    this.nodes = [];
  }

  private rebuildBed() {
    if (!this.ctx || !this.bedGain) return;
    this.stopBed();
    const time = this.ctx.currentTime;
    this.bedGain.gain.cancelScheduledValues(time);
    this.bedGain.gain.setValueAtTime(0, time);
    if (this.bed === 'silent') return;
    const level = this.bed === 'storm' ? 0.22 : this.bed === 'launch' ? 0.16 : this.bed === 'entry' ? 0.16 : 0.11;
    this.bedGain.gain.linearRampToValueAtTime(level, time + (this.reduced ? 0.2 : 1.1));
    if (this.bed === 'launch') {
      this.osc(46, 'sawtooth', 0.4);
      this.osc(58, 'sine', 0.28);
      this.bedNoise(220, this.reduced ? 0.25 : 0.65);
    } else if (this.bed === 'transit') {
      this.osc(92, 'sine', 0.45);
      this.osc(138, 'sine', 0.22);
    } else if (this.bed === 'approach') {
      this.osc(110, 'sine');
      this.osc(164.8, 'sine', 0.4);
    } else if (this.bed === 'entry') {
      this.osc(55, 'sawtooth', 0.35);
      this.bedNoise(1400, 0.5);
    } else if (this.bed === 'descent') {
      this.osc(82, 'triangle');
      this.bedNoise(700, 0.25);
    } else if (this.bed === 'storm') {
      this.osc(49, 'sine');
      this.bedNoise(380, 0.85);
    } else {
      this.osc(98, 'sine');
      this.osc(146.8, 'sine', 0.35);
    }
  }

  private osc(freq: number, type: OscillatorType, gain = 0.6) {
    if (!this.ctx || !this.bedGain) return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.value = gain;
    osc.connect(amp);
    amp.connect(this.bedGain);
    osc.start();
    this.nodes.push(osc, amp);
  }

  private bedNoise(freq: number, amount: number) {
    if (!this.ctx || !this.bedGain || !this.noise) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const amp = this.ctx.createGain();
    amp.gain.value = amount;
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.bedGain);
    source.start();
    this.nodes.push(source, filter, amp);
  }

  private noiseBurst(seconds: number, freq: number, peak: number) {
    if (!this.ctx || !this.master || !this.noise) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const amp = this.ctx.createGain();
    const time = this.ctx.currentTime;
    amp.gain.setValueAtTime(0, time);
    amp.gain.linearRampToValueAtTime(peak, time + 0.03);
    amp.gain.exponentialRampToValueAtTime(0.001, time + seconds);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    source.start(time);
    source.stop(time + seconds + 0.05);
  }

  private tone(freq: number, seconds: number, type: OscillatorType, peak: number) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const time = this.ctx.currentTime;
    amp.gain.setValueAtTime(0, time);
    amp.gain.linearRampToValueAtTime(peak, time + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.001, time + seconds);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start(time);
    osc.stop(time + seconds + 0.05);
  }
}

let singleton: MissionAudio | null = null;

export function missionAudio() {
  if (!singleton) singleton = new MissionAudio();
  return singleton;
}

export function bedFor(stage: string, storm: boolean, segment: 'earth' | 'transit' | 'mars' = 'mars'): AudioBed {
  if (storm && stage === 'SETTLEMENT') return 'storm';
  if (stage === 'APPROACH') return segment === 'earth' ? 'launch' : segment === 'transit' ? 'transit' : 'approach';
  if (stage === 'SITE_SELECT') return 'approach';
  if (stage === 'ENTRY') return 'entry';
  if (stage === 'DESCENT' || stage === 'TOUCHDOWN') return 'descent';
  if (stage === 'POST_LANDING' || stage === 'SETTLEMENT') return 'surface';
  return 'silent';
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    missionAudio().unlock();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}
