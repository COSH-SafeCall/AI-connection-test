import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioStream,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';

import { API_BASE_URL, CLIENT_ENVIRONMENT } from './src/config';
import { audioMessage, GeminiMessage, LiveToken, pcmChunksToWav, setupMessage, websocketUrl } from './src/geminiLive';

type ConnectionState = 'disconnected' | 'connecting' | 'ready' | 'error';

const describeError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return String(error);
};

const resampleFloat32ToPcm16 = (data: ArrayBuffer, inputSampleRate: number): ArrayBuffer => {
  const input = new Float32Array(data);
  const outputSampleRate = 16_000;
  const ratio = inputSampleRate / outputSampleRate;
  const output = new Int16Array(Math.max(1, Math.floor(input.length / ratio)));

  for (let outputIndex = 0; outputIndex < output.length; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.max(start + 1, Math.min(input.length, Math.floor((outputIndex + 1) * ratio)));
    let sum = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) sum += input[inputIndex] ?? 0;
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    output[outputIndex] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }

  return output.buffer;
};

const readBlobAsText = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error ?? new Error('Could not read the Gemini message.'));
  reader.readAsText(blob);
});

const parseGeminiMessage = async (data: unknown): Promise<GeminiMessage> => {
  if (typeof data === 'string') return JSON.parse(data) as GeminiMessage;
  if (data instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(data)) as GeminiMessage;
  if (ArrayBuffer.isView(data)) return JSON.parse(new TextDecoder().decode(data)) as GeminiMessage;
  if (data && typeof data === 'object') {
    if ('text' in data && typeof data.text === 'function') return JSON.parse(await data.text()) as GeminiMessage;
    if (data instanceof Blob || '_data' in data) return JSON.parse(await readBlobAsText(data as Blob)) as GeminiMessage;
    return data as GeminiMessage;
  }
  throw new Error('Gemini returned an unsupported message format.');
};

export default function App() {
  const socketRef = useRef<WebSocket | null>(null);
  const responseAudioRef = useRef<string[]>([]);
  const setupReadyRef = useRef(false);
  const captureActiveRef = useRef(false);
  const streamStartedRef = useRef(false);
  const outputPlayingRef = useRef(false);
  const receivedAudioRef = useRef(false);
  const microphoneBufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Playback completion must not deactivate the session after capture restarts.
  const audioPlayer = useAudioPlayer(null, { keepAudioSessionActive: true });
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const [connection, setConnection] = useState<ConnectionState>('disconnected');
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');

  const audioStream = useAudioStream({
    sampleRate: 48_000, channels: 1, encoding: 'float32',
    onBuffer: (buffer) => {
      if (!captureActiveRef.current || buffer.data.byteLength === 0) return;
      // Capture health is independent of playback and WebSocket readiness.
      receivedAudioRef.current = true;
      if (microphoneBufferTimerRef.current) {
        clearTimeout(microphoneBufferTimerRef.current);
        microphoneBufferTimerRef.current = null;
      }
      const socket = socketRef.current;
      if (captureActiveRef.current && !outputPlayingRef.current && setupReadyRef.current && socket?.readyState === WebSocket.OPEN) {
        setListening(true);
        socket.send(audioMessage(resampleFloat32ToPcm16(buffer.data, buffer.sampleRate), 16_000));
      }
    },
  });

  const stopCapture = useCallback(async () => {
    captureActiveRef.current = false;
    setListening(false);
    receivedAudioRef.current = false;
    if (microphoneBufferTimerRef.current) {
      clearTimeout(microphoneBufferTimerRef.current);
      microphoneBufferTimerRef.current = null;
    }
    if (streamStartedRef.current) {
      audioStream.stream.stop();
      streamStartedRef.current = false;
    }
  }, [audioStream.stream]);

  const startCapture = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Microphone access needed', 'Allow microphone access to start the SafeCall conversation.');
      throw new Error('Microphone permission was not granted.');
    }
    captureActiveRef.current = true;
    receivedAudioRef.current = false;
    setListening(false);
    if (microphoneBufferTimerRef.current) clearTimeout(microphoneBufferTimerRef.current);
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: 'doNotMix' });
    if (!captureActiveRef.current || !setupReadyRef.current) return;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      audioStream.stream.start(),
      new Promise<never>((_, reject) => {
        startTimer = setTimeout(() => reject(new Error('The microphone did not start within 5 seconds.')), 5_000);
      }),
    ]).finally(() => {
      if (startTimer) clearTimeout(startTimer);
    });
    streamStartedRef.current = true;
    if (!captureActiveRef.current || !setupReadyRef.current) {
      await stopCapture();
      return;
    }
    microphoneBufferTimerRef.current = setTimeout(() => {
      if (!receivedAudioRef.current && captureActiveRef.current) {
        setError('No microphone audio buffers were received within 5 seconds. Please reconnect the call.');
        setConnection('error');
        socketRef.current?.close();
      }
    }, 5_000);
  }, [audioStream.stream, stopCapture]);

  const playResponse = useCallback(async () => {
    if (responseAudioRef.current.length === 0) return;
    outputPlayingRef.current = true;
    if (microphoneBufferTimerRef.current) {
      clearTimeout(microphoneBufferTimerRef.current);
      microphoneBufferTimerRef.current = null;
    }
    if (streamStartedRef.current) {
      audioStream.stream.stop();
      streamStartedRef.current = false;
    }
    setListening(false);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, interruptionMode: 'doNotMix' });
    const file = new File(Paths.cache, `gemini-${Date.now()}.wav`);
    file.create({ overwrite: true });
    file.write(pcmChunksToWav(responseAudioRef.current));
    responseAudioRef.current = [];
    outputPlayingRef.current = true;
    audioPlayer.replace(file.uri);
    audioPlayer.play();
  }, [audioPlayer, audioStream.stream]);

  useEffect(() => {
    // An empty/loading player may report buffering before any response exists.
    // Only playResponse owns the transition into response playback.
    if (audioStatus.didJustFinish && !audioStatus.playing && outputPlayingRef.current) {
      outputPlayingRef.current = false;
      if (captureActiveRef.current && socketRef.current?.readyState === WebSocket.OPEN) {
        void (async () => {
          try {
            await startCapture();
          } catch (captureError) {
            setError(`Microphone stream failed: ${describeError(captureError)}`);
            setConnection('error');
            socketRef.current?.close();
          }
        })();
      }
    }
  }, [audioStatus.didJustFinish, audioStatus.playing, startCapture]);

  const disconnect = useCallback(async () => {
    await stopCapture();
    setupReadyRef.current = false;
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.close(1000, 'Client disconnected');
    setConnection('disconnected');
  }, [stopCapture]);

  useEffect(() => () => {
    if (microphoneBufferTimerRef.current) clearTimeout(microphoneBufferTimerRef.current);
    socketRef.current?.close();
    if (streamStartedRef.current) audioStream.stream.stop();
  }, [audioStream.stream]);

  const connect = async () => {
    outputPlayingRef.current = false;
    responseAudioRef.current = [];
    setConnection('connecting'); setError(''); setHeard(''); setReply('');
    const controller = new AbortController();
    const requestTimeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error('Microphone permission was not granted.');
      const response = await fetch(`${API_BASE_URL}/api/live-token`, {
        method: 'POST', signal: controller.signal,
        headers: { Accept: 'application/json', 'X-Client-Environment': CLIENT_ENVIRONMENT, 'ngrok-skip-browser-warning': '1' },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `Token request failed (${response.status})`);
      }
      const token = (await response.json()) as LiveToken;
      if (!token.token || !token.model) throw new Error('The token response was incomplete.');
      const socket = new WebSocket(websocketUrl(token.token));
      socketRef.current = socket;
      const setupTimeout = setTimeout(() => {
        if (!setupReadyRef.current) {
          setError('The Gemini Live connection did not become ready within 15 seconds.');
          setConnection('error'); socket.close();
        }
      }, 15_000);
      socket.onopen = () => socket.send(setupMessage(token.model));
      socket.onmessage = async (event) => {
        try {
          const message = await parseGeminiMessage(event.data);
          if (message.setupComplete && !setupReadyRef.current) {
            clearTimeout(setupTimeout); setupReadyRef.current = true; setConnection('ready');
            await startCapture();
          }
          const content = message.serverContent;
          if (!content) return;
          if (content.interrupted) {
            responseAudioRef.current = [];
            audioPlayer.pause();
            outputPlayingRef.current = false;
          }
          if (content.inputTranscription?.text) setHeard((value) => value + content.inputTranscription?.text);
          if (content.outputTranscription?.text) setReply((value) => value + content.outputTranscription?.text);
          for (const part of content.modelTurn?.parts ?? []) {
            if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/pcm')) responseAudioRef.current.push(part.inlineData.data);
          }
          if (content.generationComplete || content.turnComplete) await playResponse();
        } catch (messageError) {
          setError(describeError(messageError)); setConnection('error'); socket.close();
        }
      };
      socket.onerror = () => { clearTimeout(setupTimeout); setError('The Gemini Live connection failed.'); setConnection('error'); };
      socket.onclose = () => {
        clearTimeout(setupTimeout); setupReadyRef.current = false; void stopCapture();
        setConnection((value) => value === 'error' ? value : 'disconnected');
      };
    } catch (caught) {
      setError(caught instanceof Error && caught.name === 'AbortError' ? 'The SafeCall server did not respond within 10 seconds.' : describeError(caught));
      setConnection('error');
    } finally { clearTimeout(requestTimeout); }
  };

  const connected = connection === 'ready';
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.eyebrowRow}><View style={[styles.dot, connected && styles.dotLive]} /><Text style={styles.eyebrow}>{connected ? 'LIVE CALL' : connection.toUpperCase()}</Text></View>
        <Text style={styles.title}>SafeCall</Text>
        <Text style={styles.subtitle}>{connected ? 'Speak naturally. SafeCall keeps listening until you end the call.' : 'A natural voice conversation with AI.'}</Text>
        <View style={styles.callCard}>
          <Text style={styles.callState}>{listening ? 'Listening…' : connected ? 'Preparing microphone…' : 'Ready to call'}</Text>
          <Text style={styles.callHint}>{connected ? 'You can interrupt and continue just like a phone call.' : 'Tap once to connect.'}</Text>
        </View>
        <View style={styles.transcriptCard}>
          <Text style={styles.label}>YOU</Text><Text style={styles.transcript}>{heard || 'Test transcript will appear here.'}</Text>
          <View style={styles.rule} />
          <Text style={styles.label}>SAFECALL</Text><Text style={styles.transcript}>{reply || 'AI transcript will appear here.'}</Text>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!connected ? (
          <Pressable accessibilityRole="button" disabled={connection === 'connecting'} onPress={connect} style={({ pressed }) => [styles.connectButton, pressed && styles.pressed]}>
            {connection === 'connecting' ? <ActivityIndicator color="#09110d" /> : <Text style={styles.connectText}>Start AI call</Text>}
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={disconnect} style={({ pressed }) => [styles.endButton, pressed && styles.pressed]}><Text style={styles.endText}>End call</Text></Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#07100c' },
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7b8580' }, dotLive: { backgroundColor: '#8df2b5' },
  eyebrow: { color: '#9ba8a1', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#f1f6f3', fontSize: 48, lineHeight: 54, fontWeight: '700', letterSpacing: -1.5 },
  subtitle: { color: '#9ba8a1', fontSize: 16, lineHeight: 24, marginTop: 12, marginBottom: 28 },
  callCard: { backgroundColor: '#10231a', borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 18 },
  callState: { color: '#8df2b5', fontSize: 22, fontWeight: '700' },
  callHint: { color: '#9ba8a1', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  transcriptCard: { backgroundColor: '#101d17', borderRadius: 24, padding: 22, minHeight: 220 },
  label: { color: '#8df2b5', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  transcript: { color: '#e6eee9', fontSize: 16, lineHeight: 24, minHeight: 44 },
  rule: { height: 1, backgroundColor: '#26362e', marginVertical: 18 },
  error: { color: '#ff9d90', marginTop: 16, lineHeight: 20 },
  connectButton: { backgroundColor: '#8df2b5', borderRadius: 18, padding: 18, alignItems: 'center', marginTop: 24 },
  connectText: { color: '#09110d', fontSize: 16, fontWeight: '700' },
  endButton: { backgroundColor: '#ff8f7e', borderRadius: 18, padding: 18, alignItems: 'center', marginTop: 24 },
  endText: { color: '#20100d', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
