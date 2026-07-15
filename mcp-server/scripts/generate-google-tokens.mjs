import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const tokenPath = process.env.GOOGLE_TOKEN_PATH || path.join(rootDir, '.google-oauth-tokens.json');
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost';
const scopes = (process.env.GOOGLE_SCOPES || 'https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/gmail.compose,https://www.googleapis.com/auth/documents').split(',');

const oauth2Client = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri,
});

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
  prompt: 'consent',
});

console.log('Open this URL in your browser to authorize the app:');
console.log(authUrl);

function exchangeCode(code) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData.toString()),
      },
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) {
            reject(new Error(JSON.stringify(parsed)));
          } else {
            resolve(parsed);
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(postData.toString());
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', redirectUri);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end(`Authorization failed: ${error}`);
    console.error(`Authorization failed: ${error}`);
    return;
  }

  if (code) {
    try {
      const tokens = await exchangeCode(code);
      await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2));
      console.log(`Saved tokens to ${tokenPath}`);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Authorization complete. You can close this window.');
    } catch (err) {
      console.error('Token exchange failed:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Token exchange failed.');
    }
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Waiting for Google authorization...');
});

server.listen(80, '0.0.0.0', () => {
  console.log(`Listening for OAuth callback on ${redirectUri}`);
});
