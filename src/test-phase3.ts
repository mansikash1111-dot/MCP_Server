import * as fs from 'fs';
import * as path from 'path';
import { processReviews } from './llm/llm-processor';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
console.log("GROQ_API_KEY defined?", !!process.env.GROQ_API_KEY);
console.log("OPENAI_API_KEY defined?", !!process.env.OPENAI_API_KEY);
console.log("PRODUCT_NAME defined?", !!process.env.PRODUCT_NAME);

async function main() {
    const inputPath = path.resolve(__dirname, '../output/normalized_reviews.json');
    if (!fs.existsSync(inputPath)) {
        console.error("normalized_reviews.json not found. Run Phase 2 first.");
        process.exit(1);
    }

    const reviews = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
    console.log(`Loaded ${reviews.length} reviews for LLM processing...`);

    try {
        const report = await processReviews(reviews);
        console.log("\n--- LLM Processing Successful! ---");
        console.log("Themes:", report.top_themes);
        console.log("Quotes:", report.quotes);
        console.log("Actions:", report.action_ideas);
        
        const outputPath = path.resolve(__dirname, '../output/llm_report.json');
        fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
        console.log(`\nSaved full LLM report to ${outputPath}`);
    } catch (e) {
        console.error("Phase 3 Failed:", e);
    }
}

main();
