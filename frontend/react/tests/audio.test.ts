import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { AudioPlayer, decodePcm, encodePcm } from '../src/audio';

describe('PCM streaming', () => {
  it('encodes signed little-endian PCM and decodes its amplitude', () => {
    const encoded = encodePcm(new Int16Array([-32768, 0, 32767]));
    expect(Array.from(atob(encoded), (c) => c.charCodeAt(0))).toEqual([0, 128, 0, 0, 255, 127]);
    expect(Array.from(decodePcm(encoded))).toEqual([-1, 0, 32767 / 32768]);
  });

  for (const sampleRate of [16000, 44100, 48000]) {
    it(`produces exactly one second of 16 kHz PCM from ${sampleRate} Hz render blocks`, () => {
      let Processor: any;
      const chunks: Int16Array[] = [];
      runInNewContext(readFileSync(new URL('../public/pcm-worklet.js', import.meta.url), 'utf8'), {
        sampleRate,
        AudioWorkletProcessor: class { port = { postMessage: (chunk: Int16Array) => chunks.push(chunk) }; },
        registerProcessor: (_name: string, implementation: unknown) => { Processor = implementation; },
      });
      const capture = new Processor();
      for (let offset = 0; offset < sampleRate; offset += 128) {
        capture.process([[new Float32Array(Math.min(128, sampleRate - offset)).fill(0.5)]]);
      }
      expect(chunks).toHaveLength(10);
      expect(chunks.every((chunk) => chunk.length === 1600 && chunk.every((value) => value === 16384))).toBe(true);
    });
  }

  it('schedules chunks in order and stops every queued chunk on interruption', () => {
    const sources: any[] = [];
    const context = {
      currentTime: 1, destination: {},
      createBuffer: (_channels: number, length: number, rate: number) => ({
        duration: length / rate, getChannelData: () => new Float32Array(length),
      }),
      createBufferSource: () => {
        const source = { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
        sources.push(source); return source;
      },
    };
    const speaking = vi.fn();
    const player = new AudioPlayer(context as unknown as AudioContext, speaking);
    const chunk = encodePcm(new Int16Array(2400));
    player.play(chunk); player.play(chunk);
    expect(sources[0].start.mock.calls[0][0]).toBeCloseTo(1.025);
    expect(sources[1].start.mock.calls[0][0]).toBeCloseTo(1.125);
    player.stop();
    expect(sources.every((source) => source.stop.mock.calls.length === 1)).toBe(true);
    expect(speaking).toHaveBeenLastCalledWith(false);
    player.play(chunk);
    expect(sources[2].start.mock.calls[0][0]).toBeCloseTo(1.025);
  });
});
