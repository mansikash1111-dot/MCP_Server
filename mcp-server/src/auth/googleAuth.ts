import { OAuth2Client, type Credentials } from 'google-auth-library';
import { env } from '../config/env.js';
import { TokenStore } from './tokenStore.js';
import type { AuthConfig, TokenStoreData } from '../types/index.js';

export class GoogleAuthService {
  private readonly authConfig: AuthConfig;
  private readonly tokenStore: TokenStore;
  private readonly oauthClient: OAuth2Client;

  constructor() {
    this.authConfig = {
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      redirectUri: env.googleRedirectUri,
      scopes: env.googleScopes,
      tokenStorePath: env.googleTokenPath,
    };

    this.tokenStore = new TokenStore(this.authConfig.tokenStorePath);
    this.oauthClient = new OAuth2Client({
      clientId: this.authConfig.clientId,
      clientSecret: this.authConfig.clientSecret,
      redirectUri: this.authConfig.redirectUri,
    });
  }

  getClient(): OAuth2Client {
    return this.oauthClient;
  }

  async getCredentials(): Promise<TokenStoreData> {
    const stored = await this.tokenStore.load();

    if (!stored?.access_token) {
      throw new Error('Google OAuth credentials are not configured. Run the authorization flow first.');
    }

    if (stored.expiry_date && stored.expiry_date <= Date.now()) {
      await this.refreshAccessToken(stored);
    }

    return (await this.tokenStore.load()) || {};
  }

  async refreshAccessToken(stored: TokenStoreData): Promise<void> {
    if (!stored.refresh_token) {
      throw new Error('No refresh token available.');
    }

    const { credentials } = await this.oauthClient.refreshAccessToken();
    const nextToken = this.normalizeTokens(credentials, stored);
    await this.tokenStore.save(nextToken);
  }

  async setCredentials(tokens: TokenStoreData): Promise<void> {
    await this.tokenStore.save(tokens);
  }

  buildAuthUrl(): string {
    return this.oauthClient.generateAuthUrl({
      access_type: 'offline',
      scope: this.authConfig.scopes,
      prompt: 'consent',
    });
  }

  async exchangeCode(code: string): Promise<TokenStoreData> {
    const { tokens } = await this.oauthClient.getToken(code);
    const normalized = this.normalizeTokens(tokens);
    await this.tokenStore.save(normalized);
    return normalized;
  }

  private normalizeTokens(tokens: Credentials, fallback: TokenStoreData = {}): TokenStoreData {
    return {
      access_token: tokens.access_token || fallback.access_token,
      refresh_token: tokens.refresh_token || fallback.refresh_token,
      expiry_date: tokens.expiry_date || fallback.expiry_date,
      token_type: tokens.token_type || fallback.token_type,
      scope: tokens.scope || fallback.scope,
    };
  }
}
