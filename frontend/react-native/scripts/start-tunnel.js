const { spawn } = require('node:child_process');

const expoCli = require.resolve('expo/bin/cli');

const ngrok = spawn('ngrok', ['http', '8081', '--log', 'stdout', '--log-format', 'json'], {
  stdio: ['ignore', 'pipe', 'inherit'],
  windowsHide: true,
});

let expo;
let buffer = '';

const shutdown = () => {
  expo?.kill();
  ngrok.kill();
};

ngrok.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() ?? '';

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (expo || event.msg !== 'started tunnel' || !event.url?.startsWith('https://')) continue;

      console.log(`Expo tunnel: ${event.url}`);
      expo = spawn(process.execPath, [expoCli, 'start', '--localhost'], {
        stdio: 'inherit',
        env: { ...process.env, EXPO_PACKAGER_PROXY_URL: event.url },
        windowsHide: true,
      });
      expo.on('error', (error) => {
        console.error(`Could not start Expo: ${error.message}`);
        ngrok.kill();
        process.exitCode = 1;
      });
      expo.on('exit', (code) => {
        ngrok.kill();
        process.exitCode = code ?? 1;
      });
    } catch {
      // Ignore non-JSON diagnostic output from ngrok.
    }
  }
});

ngrok.on('exit', (code) => {
  if (!expo) {
    console.error(`ngrok exited before creating a tunnel (code ${code ?? 'unknown'}).`);
    process.exitCode = code ?? 1;
  }
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
