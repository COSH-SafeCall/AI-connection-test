import { afterEach, expect, it, vi } from 'vitest';
import { LiveSession } from '../src/live';

afterEach(() => vi.unstubAllGlobals());

it('releases a microphone granted after the user cancels, without requesting a token', async () => {
  let grant!: (stream: unknown) => void;
  const permission = new Promise((resolve) => { grant = resolve; });
  const getUserMedia = vi.fn(() => permission);
  const close = vi.fn(() => Promise.resolve());
  const stop = vi.fn();
  const fetch = vi.fn();
  vi.stubGlobal('window', { isSecureContext: true });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('AudioContext', class { resume = () => Promise.resolve(); close = close; });
  vi.stubGlobal('fetch', fetch);
  const session = new LiveSession({ connected: vi.fn(), speaking: vi.fn(), level: vi.fn(),
    transcript: vi.fn(), turnEnded: vi.fn(), notice: vi.fn(), closed: vi.fn() });
  const starting = session.start();
  await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalled());
  session.stop();
  grant({ getTracks: () => [{ stop }] });
  await starting;
  expect(stop).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
});
