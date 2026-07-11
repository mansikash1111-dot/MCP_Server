import Groq from "groq-sdk";
import { WeeklyInsights } from "./processor";

export interface FinalReport {
    markdownReport: string;
    htmlEmailBody: string;
}

export class GroqGenerator {
    private groq: Groq;

    constructor(apiKey?: string) {
        this.groq = new Groq({
            apiKey: apiKey || process.env.GROQ_API_KEY
        });
    }

    async generateFinalContent(insights: WeeklyInsights): Promise<FinalReport> {
        const insightsJson = JSON.stringify(insights, null, 2);
        
        const systemPrompt = `You are an expert executive communications writer. 
You will be provided with structured insights from recent app reviews (JSON format).
Your task is to generate two outputs:
1. 'markdownReport': A highly scannable, one-page weekly note (under 250 words) in Markdown format highlighting top themes, verbatim quotes, and actionable next steps.
2. 'htmlEmailBody': A professional and concise HTML email body summarizing the pulse, suitable for stakeholders.

Output MUST be a JSON object with strictly these two keys: "markdownReport" and "htmlEmailBody".`;

        const userPrompt = `Here are the structured insights:\n\n${insightsJson}`;

        const response = await this.groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            model: "llama3-70b-8192",
            response_format: { type: "json_object" },
            temperature: 0.3
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error("Empty response from Groq");
        }

        const parsed = JSON.parse(content);
        return {
            markdownReport: parsed.markdownReport,
            htmlEmailBody: parsed.htmlEmailBody
        };
    }
}
