export function encodePcm(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((value, index) => view.setInt16(index * 2, value, true));
  return btoa(String.fromCharCode(...bytes));
}

export function decodePcm(data: string): Float32Array {
  const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
  return samples;
}

export class AudioPlayer {
  private sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  constructor(private context: AudioContext, private onSpeaking: (speaking: boolean) => void) {}

  play(data: string, sampleRate = 24000) {
    const samples = decodePcm(data);
    if (!samples.length) return;
    const buffer = this.context.createBuffer(1, samples.length, sampleRate);
    buffer.getChannelData(0).set(samples);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    this.sources.add(source);
    source.onended = () => {
      source.disconnect();
      this.sources.delete(source);
      if (!this.sources.size) this.onSpeaking(false);
    };
    this.nextTime = Math.max(this.nextTime, this.context.currentTime + 0.025);
    source.start(this.nextTime);
    this.nextTime += buffer.duration;
    this.onSpeaking(true);
  }

  stop() {
    for (const source of this.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.sources.clear();
    this.nextTime = 0;
    this.onSpeaking(false);
  }
}
