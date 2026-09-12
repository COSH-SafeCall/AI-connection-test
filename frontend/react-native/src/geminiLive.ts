import { fromByteArray, toByteArray } from 'base64-js';

export const LIVE_ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/' +
  'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

export type LiveToken = {
  token: string;
  model: string;
  expiresAt: string;
};

export type GeminiMessage = {
  setupComplete?: Record<string, never>;
  serverContent?: {
    interrupted?: boolean;
    generationComplete?: boolean;
    turnComplete?: boolean;
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    modelTurn?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string };
        text?: string;
      }>;
    };
  };
};

export function websocketUrl(token: string): string {
  return `${LIVE_ENDPOINT}?access_token=${encodeURIComponent(token)}`;
}

export function setupMessage(model: string): string {
  return JSON.stringify({
    setup: {
      model,
      generationConfig: { responseModalities: ['AUDIO'] },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  });
}

export function audioMessage(data: ArrayBuffer, sampleRate: number): string {
  return JSON.stringify({
    realtimeInput: {
      audio: {
        data: fromByteArray(new Uint8Array(data)),
        mimeType: `audio/pcm;rate=${sampleRate}`,
      },
    },
  });
}

export function pcmChunksToWav(chunks: string[], sampleRate = 24_000): Uint8Array {
  const decoded = chunks.map((chunk) => toByteArray(chunk));
  const pcmLength = decoded.reduce((total, chunk) => total + chunk.byteLength, 0);
  const wav = new Uint8Array(44 + pcmLength);
  const view = new DataView(wav.buffer);
  const ascii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcmLength, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, pcmLength, true);

  let offset = 44;
  for (const chunk of decoded) {
    wav.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return wav;
}
