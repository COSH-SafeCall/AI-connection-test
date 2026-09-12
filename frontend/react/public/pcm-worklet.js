// Downsample across render blocks, including non-integer ratios such as 44.1k/16k.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.weight = 0;
    this.sum = 0;
    this.chunk = new Int16Array(1600);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const sample of input) {
      let remaining = 1;
      while (remaining > 1e-8) {
        const used = Math.min(remaining, this.ratio - this.weight);
        this.sum += sample * used;
        this.weight += used;
        remaining -= used;
        if (this.weight >= this.ratio - 1e-8) {
          const value = Math.max(-1, Math.min(1, this.sum / this.weight));
          this.chunk[this.offset++] = Math.round(value * (value < 0 ? 32768 : 32767));
          this.sum = 0;
          this.weight = 0;
          if (this.offset === this.chunk.length) {
            this.port.postMessage(this.chunk, [this.chunk.buffer]);
            this.chunk = new Int16Array(1600);
            this.offset = 0;
          }
        }
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCapture);
