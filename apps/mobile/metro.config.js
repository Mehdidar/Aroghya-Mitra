// Monorepo Metro config: the app imports packages/* (@am/shared, @am/patient-ai, @am/records) and
// server/* types, so Metro watches the repo root and resolves modules from both node_modules trees.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const http = require('http');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

const previousEnhanceMiddleware = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware, server) => {
    const parentMiddleware = previousEnhanceMiddleware
      ? previousEnhanceMiddleware(metroMiddleware, server)
      : metroMiddleware;

    return (req, res, next) => {
      const url = req.url || '';
      if (
        url.startsWith('/ai') ||
        url.startsWith('/speech') ||
        url.startsWith('/health') ||
        url.startsWith('/auth') ||
        url.startsWith('/records') ||
        url.startsWith('/triage') ||
        url.startsWith('/consultations') ||
        url.startsWith('/v1')
      ) {
        const proxyReq = http.request(
          {
            hostname: '127.0.0.1',
            port: 8787,
            path: url,
            method: req.method,
            headers: {
              ...req.headers,
              host: '127.0.0.1:8787',
            },
          },
          (proxyRes) => {
            // Forward headers and add CORS
            const headers = { ...proxyRes.headers };
            headers['access-control-allow-origin'] = '*';
            headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS, HEAD';
            headers['access-control-allow-headers'] = '*';
            res.writeHead(proxyRes.statusCode || 200, headers);
            proxyRes.pipe(res);
          }
        );

        proxyReq.on('error', (err) => {
          res.writeHead(502, {
            'content-type': 'application/json',
            'access-control-allow-origin': '*',
          });
          res.end(JSON.stringify({ error: 'Backend proxy error', details: String(err) }));
        });

        req.pipe(proxyReq);
        return;
      }

      return parentMiddleware(req, res, next);
    };
  },
};

module.exports = config;
