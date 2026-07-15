import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

export const env = {
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
  googleScopes: (process.env.GOOGLE_SCOPES || 'https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/gmail.compose,https://www.googleapis.com/auth/documents').split(','),
  googleTokenPath: process.env.GOOGLE_TOKEN_PATH || path.resolve(process.cwd(), '.google-oauth-tokens.json'),
};
