import * as fs from 'fs';
import * as path from 'path';

const tokensJson = process.env.GOOGLE_OAUTH_TOKENS_JSON;
const tokenPath = process.env.GOOGLE_TOKEN_PATH || path.join(__dirname, '..', 'google-oauth-tokens.json');

if (tokensJson) {
    console.log(`Setting up Google OAuth tokens at ${tokenPath}...`);
    // Ensure parent directory exists
    const dir = path.dirname(tokenPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(tokenPath, tokensJson, 'utf-8');
    console.log('Google OAuth tokens setup complete.');
} else {
    console.warn('Warning: GOOGLE_OAUTH_TOKENS_JSON env variable is not set. Google service MCP clients may fail to authenticate if tokens do not exist.');
}
