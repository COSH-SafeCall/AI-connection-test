import { AudioPlayer, encodePcm } from './audio';

type Callbacks = {
  connected: (model: string) => void;
  speaking: (value: boolean) => void;
  level: (value: number) => void;
  transcript: (role: 'user' | 'assistant', text: string) => void;
  turnEnded: () => void;
  notice: (message: string) => void;
  closed: (error?: string) => void;
};

type LiveMessage = {
  setupComplete?: object;
  error?: { message?: string };
  goAway?: { timeLeft?: string };
  serverContent?: {
    interrupted?: boolean;
    turnComplete?: boolean;
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    modelTurn?: { parts?: { inlineData?: { data: string; mimeType: string } }[] };
  };
};

export class LiveSession {
  private socket?: WebSocket;
  private context?: AudioContext;
  private stream?: MediaStream;
  private capture?: AudioWorkletNode;
  private source?: MediaStreamAudioSourceNode;
  private player?: AudioPlayer;
  private abort = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private ready = false;
  private muted = false;

  constructor(private callbacks: Callbacks) {}

  async start() {
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('마이크를 사용하려면 localhost 또는 HTTPS로 접속해 주세요.');
      }
      // Resume synchronously from the user's click, before permission/network awaits.
      this.context = new AudioContext();
      await this.context.resume();
      if (this.stopped) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      } });
      if (this.stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream;
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => this.finish('마이크 연결이 끊어졌습니다. 장치를 확인하고 다시 시작해 주세요.');
      });
      this.player = new AudioPlayer(this.context, this.callbacks.speaking);
      await this.context.audioWorklet.addModule(`${import.meta.env.BASE_URL}pcm-worklet.js`);
      if (this.stopped) return;
      this.capture = new AudioWorkletNode(this.context, 'pcm-capture');
      this.source = this.context.createMediaStreamSource(stream);
      this.source.connect(this.capture);
      // Worklet outputs silence; connecting keeps the audio graph processing.
      this.capture.connect(this.context.destination);
      this.capture.onprocessorerror = () => this.finish('마이크 오디오 처리에 실패했습니다. 다시 시작해 주세요.');
      this.capture.port.onmessage = ({ data }: MessageEvent<Int16Array>) => {
        if (!this.ready || this.muted || this.stopped) return;
        let sum = 0;
        for (const value of data) sum += (value / 32768) ** 2;
        this.callbacks.level(Math.min(1, Math.sqrt(sum / data.length) * 5));
        if (this.socket && this.socket.bufferedAmount > 256_000) {
          this.finish('네트워크가 느려 음성 전송이 지연되었습니다. 다시 연결해 주세요.');
          return;
        }
        this.send({ realtimeInput: { audio: { data: encodePcm(data), mimeType: 'audio/pcm;rate=16000' } } });
      };
      this.timer = setTimeout(() => this.finish('연결 시간이 초과되었습니다. 서버 상태를 확인해 주세요.'), 20000);
      const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
      const response = await fetch(`${base}/api/live-token`, {
        method: 'POST', cache: 'no-store', signal: this.abort.signal,
        headers: { 'X-Client-Environment': import.meta.env.VITE_CLIENT_ENVIRONMENT || 'development' },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || `토큰 발급 실패 (${response.status}). 서버 설정을 확인해 주세요.`);
      }
      const token = await response.json();
      if (this.stopped) return;
      if (typeof token.token !== 'string' || !token.token || typeof token.model !== 'string') {
        throw new Error('서버가 올바른 Live 토큰을 반환하지 않았습니다.');
      }
      this.socket = new WebSocket('wss://generativelanguage.googleapis.com/ws/' +
        'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained' +
        `?access_token=${encodeURIComponent(token.token)}`);
      this.socket.binaryType = 'arraybuffer';
      this.socket.onopen = () => this.send({ setup: {
        model: token.model, generationConfig: { responseModalities: ['AUDIO'] },
        inputAudioTranscription: {}, outputAudioTranscription: {},
      } });
      this.socket.onmessage = (event) => {
        if (this.stopped) return;
        try {
          const message: LiveMessage = JSON.parse(typeof event.data === 'string'
            ? event.data : new TextDecoder().decode(event.data));
          if (message.error) throw new Error(message.error.message || 'Gemini 연결 오류가 발생했습니다.');
          if (message.setupComplete) {
            clearTimeout(this.timer);
            this.ready = true;
            this.callbacks.connected(token.model);
          }
          if (message.goAway) this.callbacks.notice('세션이 곧 종료됩니다. 종료 후 다시 대화를 시작해 주세요.');
          const content = message.serverContent;
          if (!content) return;
          if (content.interrupted) { this.player?.stop(); this.callbacks.turnEnded(); }
          if (content.inputTranscription?.text) this.callbacks.transcript('user', content.inputTranscription.text);
          if (content.outputTranscription?.text) this.callbacks.transcript('assistant', content.outputTranscription.text);
          if (!content.interrupted) for (const part of content.modelTurn?.parts ?? []) {
            const audio = part.inlineData;
            if (audio?.mimeType.startsWith('audio/pcm')) {
              const rate = Number(/rate=(\d+)/.exec(audio.mimeType)?.[1] ?? 24000);
              this.player?.play(audio.data, rate);
            }
          }
          if (content.turnComplete) this.callbacks.turnEnded();
        } catch (error) { this.finish(error instanceof Error ? error.message : '응답 처리에 실패했습니다.'); }
      };
      this.socket.onerror = () => this.finish('Gemini에 연결하지 못했습니다. 네트워크와 서버의 Gemini 설정을 확인해 주세요.');
      this.socket.onclose = (event) => this.finish(event.code === 1000 ? undefined : `연결이 종료되었습니다 (코드 ${event.code}). 다시 시작해 주세요.`);
    } catch (error) {
      if (this.stopped) return;
      const message = error instanceof DOMException && error.name === 'NotAllowedError'
        ? '마이크 권한이 필요합니다. 브라우저 사이트 설정에서 마이크를 허용해 주세요.'
        : error instanceof DOMException && error.name === 'NotFoundError'
          ? '마이크를 찾을 수 없습니다. 입력 장치를 연결해 주세요.'
          : error instanceof Error ? error.message : '연결에 실패했습니다.';
      this.finish(message);
    }
  }

  setMuted(value: boolean) {
    this.muted = value;
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = !value; });
    if (value) { this.send({ realtimeInput: { audioStreamEnd: true } }); this.callbacks.level(0); }
  }

  sendText(text: string) {
    if (!this.ready || this.stopped) return false;
    this.send({ realtimeInput: { text } });
    return true;
  }

  private send(message: unknown) {
    if (!this.stopped && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private finish(error?: string) {
    if (this.stopped) return;
    this.stop();
    this.callbacks.closed(error);
  }

  stop() {
    this.stopped = true;
    this.ready = false;
    clearTimeout(this.timer);
    this.abort.abort();
    if (this.socket) {
      this.socket.onopen = this.socket.onmessage = this.socket.onerror = this.socket.onclose = null;
      this.socket.close();
    }
    if (this.capture) { this.capture.port.onmessage = null; this.capture.disconnect(); this.capture.port.close(); }
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    this.player?.stop();
    void this.context?.close().catch(() => {});
  }
}
