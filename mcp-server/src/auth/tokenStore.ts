import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import type { TokenStoreData } from '../types/index.js';

export class TokenStore {
  constructor(private readonly tokenPath: string = env.googleTokenPath) {}

  async load(): Promise<TokenStoreData | null> {
    try {
      const data = await fs.readFile(this.tokenPath, 'utf8');
      return JSON.parse(data) as TokenStoreData;
    } catch {
      return null;
    }
  }

  async save(data: TokenStoreData): Promise<void> {
    await fs.mkdir(path.dirname(this.tokenPath), { recursive: true });
    await fs.writeFile(this.tokenPath, JSON.stringify(data, null, 2));
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.tokenPath);
    } catch {
      // ignore missing file
    }
  }
}
