import https from 'node:https';
import http from 'node:http';
import { startServer } from './mcp/server.js';
import { startOAuthServer } from './http/oauthServer.js';

(https.globalAgent as any).keepAlive = false;
(http.globalAgent as any).keepAlive = false;

async function main() {
  await Promise.allSettled([startServer(), startOAuthServer()]);
}

main().catch((error) => {
  console.error('Failed to start MCP server', error);
  process.exit(1);
});
