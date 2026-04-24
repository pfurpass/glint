export interface LoadedSound {
  readonly buffer: AudioBuffer;
  readonly duration: number;
}

export interface PlayOptions {
  volume?: number;
  loop?: boolean;
  playbackRate?: number;
  /** If set, sound is spatialized at this 3D position. */
  position?: [number, number, number];
  /** Distance model falloff; default 1. */
  refDistance?: number;
}

export interface PlayHandle {
  stop(): void;
  readonly source: AudioBufferSourceNode;
  setVolume(v: number): void;
  setPosition?(x: number, y: number, z: number): void;
}

/** High-level audio engine: one master bus + positional listener. */
export class AudioEngine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly listener: AudioListener;

  constructor() {
    const Ctor =
      (window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("[glint] Web Audio not available");
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);
    this.listener = this.ctx.listener;
  }

  /** Some browsers require a user gesture before audio plays. Call from a click/touch handler. */
  async resume(): Promise<void> {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  setMasterVolume(v: number): void {
    this.master.gain.setValueAtTime(v, this.ctx.currentTime);
  }

  setListenerPosition(x: number, y: number, z: number): void {
    const l = this.listener;
    if (l.positionX) {
      l.positionX.setValueAtTime(x, this.ctx.currentTime);
      l.positionY!.setValueAtTime(y, this.ctx.currentTime);
      l.positionZ!.setValueAtTime(z, this.ctx.currentTime);
    } else {
      (l as AudioListener & { setPosition?: (x: number, y: number, z: number) => void }).setPosition?.(x, y, z);
    }
  }

  async load(url: string): Promise<LoadedSound> {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(arr);
    return { buffer, duration: buffer.duration };
  }

  /** Load from an already-fetched ArrayBuffer (e.g., generated procedurally). */
  async loadArrayBuffer(arr: ArrayBuffer): Promise<LoadedSound> {
    const buffer = await this.ctx.decodeAudioData(arr);
    return { buffer, duration: buffer.duration };
  }

  /** Generate an in-memory sine-tone sound of given seconds + freq. */
  tone(durationSec: number, freq: number, volumeEnv = true): LoadedSound {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(durationSec * rate), rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / rate;
      const env = volumeEnv ? Math.max(0, 1 - t / durationSec) : 1;
      data[i] = Math.sin(t * freq * Math.PI * 2) * env;
    }
    return { buffer: buf, duration: durationSec };
  }

  play(sound: LoadedSound, opts: PlayOptions = {}): PlayHandle {
    const src = this.ctx.createBufferSource();
    src.buffer = sound.buffer;
    src.loop = !!opts.loop;
    src.playbackRate.value = opts.playbackRate ?? 1;
    const gain = this.ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    let panner: PannerNode | null = null;
    if (opts.position) {
      panner = this.ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = opts.refDistance ?? 1;
      const [px, py, pz] = opts.position;
      if (panner.positionX) {
        panner.positionX.setValueAtTime(px, this.ctx.currentTime);
        panner.positionY.setValueAtTime(py, this.ctx.currentTime);
        panner.positionZ.setValueAtTime(pz, this.ctx.currentTime);
      } else {
        (panner as PannerNode & { setPosition?: (x: number, y: number, z: number) => void }).setPosition?.(px, py, pz);
      }
      src.connect(panner).connect(gain).connect(this.master);
    } else {
      src.connect(gain).connect(this.master);
    }
    src.start();
    const handle: PlayHandle = {
      source: src,
      stop: () => {
        try {
          src.stop();
        } catch {
          // already stopped
        }
      },
      setVolume(v: number) {
        gain.gain.setValueAtTime(v, gain.context.currentTime);
      },
    };
    if (panner) {
      handle.setPosition = (x: number, y: number, z: number) => {
        if (panner!.positionX) {
          panner!.positionX.setValueAtTime(x, panner!.context.currentTime);
          panner!.positionY.setValueAtTime(y, panner!.context.currentTime);
          panner!.positionZ.setValueAtTime(z, panner!.context.currentTime);
        } else {
          (panner as PannerNode & { setPosition?: (x: number, y: number, z: number) => void }).setPosition?.(x, y, z);
        }
      };
    }
    return handle;
  }

  destroy(): void {
    void this.ctx.close();
  }
}
