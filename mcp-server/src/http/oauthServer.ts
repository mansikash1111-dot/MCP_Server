import { createServer } from 'node:http';
import { GoogleAuthService } from '../auth/googleAuth.js';
import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('oauthServer');

export async function startOAuthServer(): Promise<void> {
  const authService = new GoogleAuthService();
  const port = Number(process.env.PORT || 3000);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', tokenPath: env.googleTokenPath }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/oauth/start') {
        const authUrl = authService.buildAuthUrl();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ authUrl }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/oauth/callback') {
        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Missing OAuth code' }));
          return;
        }

        const tokens = await authService.exchangeCode(code);
        logger.info('OAuth callback completed', { tokenPath: env.googleTokenPath });

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><h1>Authentication successful</h1><p>You can close this window and return to your MCP client.</p></body></html>');
        logger.info('OAuth tokens stored', { tokenKeys: Object.keys(tokens) });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Not found' }));
    } catch (error) {
      logger.error('OAuth server request failed', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'OAuth request failed', error: error instanceof Error ? error.message : String(error) }));
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(port, () => resolve());
  });

  logger.info('OAuth callback server listening', { port });
}
