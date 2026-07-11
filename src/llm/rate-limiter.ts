/**
 * Rate Limiter and Token Budget Manager for Groq API
 * Model: llama-3.3-70b-versatile
 * Limits:
 *   - Requests per Minute (RPM): 30
 *   - Tokens per Minute (TPM): 1,000
 *   - Requests per Day (RPD): 12,000
 *   - Tokens per Day (TPD): 100,000
 */

export interface RateLimitConfig {
    rpm: number;
    tpm: number;
    rpd: number;
    tpd: number;
}

export const GROQ_LLAMA33_70B_LIMITS: RateLimitConfig = {
    rpm: 30,
    tpm: 1000,
    rpd: 12000,
    tpd: 100000
};

export function estimateTokens(text: string): number {
    if (!text) return 0;
    // Standard rule of thumb: ~4 characters per token or 1.3 tokens per word
    const words = text.trim().split(/\s+/).length;
    const charEstimate = Math.ceil(text.length / 3.8);
    const wordEstimate = Math.ceil(words * 1.3);
    return Math.max(charEstimate, wordEstimate);
}

export class RateLimiter {
    private config: RateLimitConfig;
    private requestTimestamps: number[] = [];
    private tokenLog: { timestamp: number; tokens: number }[] = [];

    constructor(config: RateLimitConfig = GROQ_LLAMA33_70B_LIMITS) {
        this.config = config;
    }

    private cleanOldEntries() {
        const now = Date.now();
        const oneMinuteAgo = now - 60 * 1000;

        this.requestTimestamps = this.requestTimestamps.filter(t => t > oneMinuteAgo);
        this.tokenLog = this.tokenLog.filter(entry => entry.timestamp > oneMinuteAgo);
    }

    public getTokensInLastMinute(): number {
        this.cleanOldEntries();
        return this.tokenLog.reduce((sum, entry) => sum + entry.tokens, 0);
    }

    public getRequestsInLastMinute(): number {
        this.cleanOldEntries();
        return this.requestTimestamps.length;
    }

    public async waitForCapacity(estimatedRequestTokens: number): Promise<void> {
        this.cleanOldEntries();

        const maxTokensPerRequest = Math.floor(this.config.tpm * 0.85); // 850 tokens safety ceiling
        if (estimatedRequestTokens > maxTokensPerRequest) {
            console.warn(`[RateLimiter] Warning: Request size (${estimatedRequestTokens} tokens) exceeds target safety chunk limit (${maxTokensPerRequest} tokens).`);
        }

        while (true) {
            this.cleanOldEntries();

            const currentRequests = this.getRequestsInLastMinute();
            const currentTokens = this.getTokensInLastMinute();

            const requestsOk = currentRequests < this.config.rpm;
            const tokensOk = currentTokens === 0 || (currentTokens + estimatedRequestTokens) <= this.config.tpm;

            if (requestsOk && tokensOk) {
                break;
            }

            // Calculate wait time
            const now = Date.now();
            let waitMs = 2000; // default 2s wait

            if (!tokensOk && this.tokenLog.length > 0) {
                const oldestTokenTime = this.tokenLog[0]?.timestamp || now;
                waitMs = Math.max(1000, oldestTokenTime + 60000 - now + 500);
            } else if (!requestsOk && this.requestTimestamps.length > 0) {
                const oldestReqTime = this.requestTimestamps[0] || now;
                waitMs = Math.max(1000, oldestReqTime + 60000 - now + 500);
            }

            console.log(`⏳ [RateLimiter] Rate limit budget near threshold (Tokens: ${currentTokens}/${this.config.tpm}, RPM: ${currentRequests}/${this.config.rpm}). Pausing for ${(waitMs / 1000).toFixed(1)}s...`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }

        // Record request
        const now = Date.now();
        this.requestTimestamps.push(now);
        this.tokenLog.push({ timestamp: now, tokens: estimatedRequestTokens });
    }

    public async executeWithRetry<T>(
        apiCall: () => Promise<T>,
        estimatedTokens: number,
        maxRetries = 5
    ): Promise<T> {
        await this.waitForCapacity(estimatedTokens);

        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                return await apiCall();
            } catch (error: any) {
                attempt++;
                const is429 = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('rate limit');
                
                if (is429 && attempt < maxRetries) {
                    const backoffMs = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
                    console.warn(`⚠️ [RateLimiter] Received 429 Rate Limit from Groq API (Attempt ${attempt}/${maxRetries}). Retrying in ${(backoffMs / 1000).toFixed(1)}s...`);
                    await new Promise(resolve => setTimeout(resolve, backoffMs));
                } else {
                    throw error;
                }
            }
        }
        throw new Error(`Execution failed after ${maxRetries} retries due to rate limits or API errors.`);
    }
}
