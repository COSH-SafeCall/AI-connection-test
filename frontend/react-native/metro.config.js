const http = require('node:http');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.server.enhanceMiddleware = (metroMiddleware) => (request, response, next) => {
  if (!request.url?.startsWith('/api/')) {
    return metroMiddleware(request, response, next);
  }

  const proxyRequest = http.request(
    {
      hostname: '127.0.0.1',
      port: 8080,
      method: request.method,
      path: request.url,
      headers: { ...request.headers, host: '127.0.0.1:8080' },
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
      proxyResponse.pipe(response);
    },
  );

  proxyRequest.on('error', () => {
    if (!response.headersSent) {
      response.writeHead(502, { 'Content-Type': 'application/json' });
    }
    response.end(JSON.stringify({ message: 'The local SafeCall server is unavailable.' }));
  });

  request.pipe(proxyRequest);
};

module.exports = config;
