import { OpenAI } from 'openai';
import { RawReview } from '../ingestion/file-reader';

// We require an LLM response conforming to this structure
export interface WeeklyInsights {
    topThemes: string[];
    quotes: string[];
    actionIdeas: string[];
}

export class LLMProcessor {
    private openai: OpenAI;

    constructor(apiKey?: string) {
        this.openai = new OpenAI({
            apiKey: apiKey || process.env.OPENAI_API_KEY
        });
    }

    async generateInsights(reviews: RawReview[]): Promise<WeeklyInsights> {
        if (!reviews || reviews.length === 0) {
            throw new Error("No reviews provided for processing.");
        }

        // Format reviews into a prompt-friendly string
        const reviewText = reviews.map(r => `[Rating: ${r.rating}] ${r.title}\n${r.text}`).join('\n---\n');

        const systemPrompt = `You are an expert product manager analyzing app store reviews.
Your goal is to turn raw mobile-store feedback into a highly scannable weekly pulse.
Constraints:
1. Cluster the reviews into a maximum of 5 themes (e.g., onboarding, KYC, payments).
2. From those themes, extract the Top 3 most important themes.
3. Extract exactly 3 verbatim user quotes that highlight these themes. Ensure no PII is included.
4. Provide exactly 3 concrete action ideas based on the themes.
5. Provide your output in JSON format exactly matching the requested schema.`;

        const userPrompt = `Here are the latest reviews:\n\n${reviewText}`;

        const response = await this.openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.2
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("Empty response from LLM");

        const parsed = JSON.parse(content);
        
        // Ensure structure
        return {
            topThemes: parsed.topThemes || parsed.top_themes || [],
            quotes: parsed.quotes || [],
            actionIdeas: parsed.actionIdeas || parsed.action_ideas || []
        };
    }
}
