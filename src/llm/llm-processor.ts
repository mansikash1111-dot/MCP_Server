import Groq from 'groq-sdk';
import { RawReview } from '../ingestion/file-reader';
import { RateLimiter, estimateTokens } from './rate-limiter';

export interface LLMReportOutput {
    themes: string[];
    top_themes: string[];
    quotes: string[];
    action_ideas: string[];
    summary_report: string;
}

const rateLimiter = new RateLimiter();

const SYSTEM_PROMPT = `You are an Expert Product Manager analyzing user feedback.
Your task is to analyze the provided user reviews and output a structured JSON response.
You must adhere strictly to the following constraints:
1. Cluster the feedback into a maximum of 5 themes. Each theme should be a clean thematic label (e.g., "Customer Support", "App Performance"). Do NOT include review IDs or numbers in theme titles.
2. Extract the top 3 themes from those clusters.
3. Include exactly 3 verbatim user quotes that perfectly represent negative or constructive feedback. The quotes MUST be exact matches from the input text.
4. Propose exactly 3 concrete action ideas based on the feedback.
5. Provide a highly scannable summary report in markdown format (maximum 250 words) that highlights the top themes, quotes, and action ideas.

You MUST respond with a valid JSON object matching this schema exactly:
{
  "themes": ["theme1", "theme2", "theme3", "theme4", "theme5"],
  "top_themes": ["theme1", "theme2", "theme3"],
  "quotes": ["exact quote 1", "exact quote 2", "exact quote 3"],
  "action_ideas": ["action 1", "action 2", "action 3"],
  "summary_report": "markdown text here"
}

Do not include any other text outside the JSON object.`;

function chunkReviews(reviews: RawReview[], maxTokensPerChunk = 300): RawReview[][] {
    const chunks: RawReview[][] = [];
    let currentChunk: RawReview[] = [];
    let currentTokens = 0;

    for (const review of reviews) {
        const line = `[Rating: ${review.rating}] ${review.title} - ${review.text}`;
        const tokens = estimateTokens(line);

        if (currentChunk.length > 0 && currentTokens + tokens > maxTokensPerChunk) {
            chunks.push(currentChunk);
            currentChunk = [review];
            currentTokens = tokens;
        } else {
            currentChunk.push(review);
            currentTokens += tokens;
        }
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
}

const cleanThemeString = (str: string) => str.replace(/^(review\s*\d*:?\s*|\d+[\.\)]\s*)/i, '').trim();

export async function processReviews(reviews: RawReview[]): Promise<LLMReportOutput> {
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY is not set in the environment.");
    }

    const groq = new Groq({ apiKey: GROQ_API_KEY });
    
    // Representative sampling if dataset is large, to strictly honor 1,000 TPM limit in single-pass
    let targetReviews = reviews;
    if (reviews.length > 15) {
        const grouped: Record<number, RawReview[]> = {};
        for (const r of reviews) {
            grouped[r.rating] = grouped[r.rating] || [];
            grouped[r.rating]!.push(r);
        }
        targetReviews = [];
        for (const rating of [1, 2, 3, 4, 5]) {
            const list = grouped[rating] || [];
            const count = Math.min(list.length, 3);
            targetReviews.push(...list.slice(0, count));
        }
        console.log(`📊 [LLM Engine] Sampled ${targetReviews.length} representative reviews across rating tiers from ${reviews.length} total reviews.`);
    }

    // Chunk reviews based on token budget (TPM <= 1000)
    const reviewChunks = chunkReviews(targetReviews, 650);
    console.log(`📦 [LLM Engine] Split ${targetReviews.length} reviews into ${reviewChunks.length} chunk(s) (Target TPM <= 1000).`);

    if (reviewChunks.length === 1) {
        // Single chunk processing
        const chunk = reviewChunks[0] || [];
        const compactReviews = chunk.map(r => `[Rating: ${r.rating}] ${r.title} - ${r.text}`).join('\n');
        const userPrompt = `Here are the reviews:\n\n${compactReviews}`;
        const totalEstimatedTokens = estimateTokens(SYSTEM_PROMPT) + estimateTokens(userPrompt) + 300;

        return await rateLimiter.executeWithRetry(async () => {
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.2,
                response_format: { type: 'json_object' }
            });

            const content = chatCompletion.choices[0]?.message?.content;
            if (!content) throw new Error("Empty response from Groq API");

            const parsed = JSON.parse(content) as LLMReportOutput;
            if (Array.isArray(parsed.themes)) parsed.themes = parsed.themes.map(cleanThemeString);
            if (Array.isArray(parsed.top_themes)) parsed.top_themes = parsed.top_themes.map(cleanThemeString);
            return parsed;
        }, totalEstimatedTokens);
    }

    // Multi-chunk batch processing with rate limiting & reduction
    const chunkOutputs: LLMReportOutput[] = [];
    for (let i = 0; i < reviewChunks.length; i++) {
        const chunk = reviewChunks[i] || [];
        console.log(`🔄 [LLM Engine] Processing chunk ${i + 1}/${reviewChunks.length} (${chunk.length} reviews)...`);
        
        const compactReviews = chunk.map(r => `[Rating: ${r.rating}] ${r.title} - ${r.text}`).join('\n');
        const userPrompt = `Here are the reviews:\n\n${compactReviews}`;
        const totalEstimatedTokens = estimateTokens(SYSTEM_PROMPT) + estimateTokens(userPrompt) + 300;

        const output = await rateLimiter.executeWithRetry(async () => {
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.2,
                response_format: { type: 'json_object' }
            });

            const content = chatCompletion.choices[0]?.message?.content;
            if (!content) throw new Error("Empty response from Groq API");

            const parsed = JSON.parse(content) as LLMReportOutput;
            if (Array.isArray(parsed.themes)) parsed.themes = parsed.themes.map(cleanThemeString);
            if (Array.isArray(parsed.top_themes)) parsed.top_themes = parsed.top_themes.map(cleanThemeString);
            return parsed;
        }, totalEstimatedTokens);

        chunkOutputs.push(output);
    }

    // Aggregate chunk outputs into final unified report
    console.log(`🧠 [LLM Engine] Consolidating insights across ${chunkOutputs.length} batches...`);
    const allThemesSet = new Set<string>();
    const allQuotes: string[] = [];
    const allActions: string[] = [];
    const summaries: string[] = [];

    chunkOutputs.forEach(out => {
        (out.top_themes || out.themes || []).forEach(t => allThemesSet.add(cleanThemeString(t)));
        if (Array.isArray(out.quotes)) allQuotes.push(...out.quotes);
        if (Array.isArray(out.action_ideas)) allActions.push(...out.action_ideas);
        if (out.summary_report) summaries.push(out.summary_report.trim());
    });

    const consolidatedThemes = Array.from(allThemesSet).slice(0, 5);
    const top3Themes = consolidatedThemes.slice(0, 3);
    const top3Quotes = allQuotes.slice(0, 3);
    const top3Actions = allActions.slice(0, 3);
    
    // Unified summary
    const aggregatedSummaryPrompt = `Consolidate the following intermediate summary notes into a single executive summary report (under 200 words):
${summaries.join('\n\n')}`;
    
    const summaryEstTokens = estimateTokens(SYSTEM_PROMPT) + estimateTokens(aggregatedSummaryPrompt) + 200;

    let finalSummaryReport = summaries.join('\n');
    try {
        finalSummaryReport = await rateLimiter.executeWithRetry(async () => {
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: 'You are an executive summary writer. Write a concise executive summary under 200 words.' },
                    { role: 'user', content: aggregatedSummaryPrompt }
                ],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.2
            });
            return chatCompletion.choices[0]?.message?.content || summaries[0] || '';
        }, summaryEstTokens);
    } catch (e: any) {
        console.warn("⚠️ Summary consolidation fallback used due to rate limit/API constraint:", e.message);
    }

    return {
        themes: consolidatedThemes,
        top_themes: top3Themes,
        quotes: top3Quotes,
        action_ideas: top3Actions,
        summary_report: finalSummaryReport
    };
}
