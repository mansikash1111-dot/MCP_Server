import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { loadAndFilterReviews } from './ingestion/file-reader';
import { processReviews } from './llm/llm-processor';
import { formatReport } from './orchestration/formatter';
import { DocsMCPClient } from './mcp/docs-client';
import { GmailMCPClient } from './mcp/gmail-client';
import { PipelineScheduler } from './orchestration/scheduler';
import { GROQ_LLAMA33_70B_LIMITS } from './llm/rate-limiter';

dotenv.config();

const DATA_DIR = process.env.EXPORTS_DIR
    ? path.resolve(process.env.EXPORTS_DIR)
    : path.join(__dirname, '..', 'data', 'exports');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const WEEKS_TO_LOOK_BACK = parseInt(process.env.DOWNLOAD_WEEKS || '12', 10);

export async function executeWeeklyPulsePipeline(): Promise<void> {
    const startTime = Date.now();
    console.log('\n======================================================');
    console.log(`🚀 Starting Weekly Review Pulse Pipeline [${new Date().toISOString()}]`);
    console.log(`📌 Model: llama-3.3-70b-versatile | Limits: ${GROQ_LLAMA33_70B_LIMITS.tpm} TPM, ${GROQ_LLAMA33_70B_LIMITS.rpm} RPM`);
    console.log('======================================================\n');

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // 1. Data Ingestion & Anonymization
    console.log('📥 [Phase 2] Ingesting and anonymizing review data...');
    let reviews: ReturnType<typeof loadAndFilterReviews> = [];
    
    const appStoreCsv = path.join(DATA_DIR, 'app_store_reviews.csv');
    const playStoreCsv = path.join(DATA_DIR, 'play_store_reviews.csv');
    const defaultCsv = path.join(__dirname, '..', 'data', 'reviews.csv');
    const normalizedJson = path.join(OUTPUT_DIR, 'normalized_reviews.json');

    if (fs.existsSync(appStoreCsv) || fs.existsSync(playStoreCsv)) {
        if (fs.existsSync(appStoreCsv)) {
            reviews.push(...loadAndFilterReviews(appStoreCsv, WEEKS_TO_LOOK_BACK));
        }
        if (fs.existsSync(playStoreCsv)) {
            reviews.push(...loadAndFilterReviews(playStoreCsv, WEEKS_TO_LOOK_BACK));
        }
    } else if (fs.existsSync(defaultCsv)) {
        reviews = loadAndFilterReviews(defaultCsv, WEEKS_TO_LOOK_BACK);
    } else if (fs.existsSync(normalizedJson)) {
        console.log(`ℹ️ [Ingestion] Loading pre-normalized reviews from ${normalizedJson}`);
        reviews = JSON.parse(fs.readFileSync(normalizedJson, 'utf-8'));
    } else {
        console.error('❌ [Ingestion] No review data found! Ensure files exist in data/exports/ or data/reviews.csv.');
        return;
    }

    console.log(`✅ [Phase 2] Loaded & cleaned ${reviews.length} valid reviews from past ${WEEKS_TO_LOOK_BACK} weeks.`);

    if (reviews.length === 0) {
        console.log('⚠️ [Ingestion] Zero reviews remain after filtering. Pipeline stopping.');
        return;
    }

    fs.writeFileSync(normalizedJson, JSON.stringify(reviews, null, 2), 'utf-8');

    // 2. Intelligence Analysis (LLM Engine with Rate Limiting & Batching)
    console.log('\n🧠 [Phase 3] Processing reviews with Groq LLM Engine...');
    let llmOutput;
    try {
        llmOutput = await processReviews(reviews);
        fs.writeFileSync(path.join(OUTPUT_DIR, 'llm_report.json'), JSON.stringify(llmOutput, null, 2), 'utf-8');
        console.log('✅ [Phase 3] LLM processing and insight extraction complete.');
    } catch (e: any) {
        console.error('❌ [Phase 3] LLM Processing failed:', e.message);
        return;
    }

    // 3. Programmatic Output Formatting
    console.log('\n📝 [Phase 4] Programmatically formatting Markdown report & HTML email draft...');
    const formatted = formatReport(llmOutput);

    const mdPath = path.join(OUTPUT_DIR, 'weekly_pulse.md');
    const htmlPath = path.join(OUTPUT_DIR, 'email_draft.html');
    fs.writeFileSync(mdPath, formatted.markdownReport, 'utf-8');
    fs.writeFileSync(htmlPath, formatted.htmlEmailBody, 'utf-8');
    console.log(`✅ Saved Markdown report to ${mdPath}`);
    console.log(`✅ Saved HTML email draft to ${htmlPath}`);

    // 4. MCP Integrations (Google Docs & Gmail)
    console.log('\n🔌 [Phase 4] Publishing via MCP Servers (Google Docs & Gmail)...');
    const docsClient = new DocsMCPClient();
    const gmailClient = new GmailMCPClient();
    let docUrl = 'Document created (local preview saved)';

    try {
        const docTitle = `Weekly Pulse - ${new Date().toISOString().split('T')[0]}`;
        docUrl = await docsClient.createPulseDocument(docTitle, formatted.markdownReport);
        console.log(`📄 Google Docs MCP Output: ${docUrl}`);
    } catch (error: any) {
        console.warn(`⚠️ Docs MCP integration offline or error: ${error.message || error}`);
    } finally {
        await docsClient.disconnect().catch(() => {});
    }

    try {
        const finalEmailContent = formatReport(llmOutput, docUrl).htmlEmailBody;
        const emailTo = process.env.USER_EMAIL || 'team@example.com';
        const emailSubject = `Weekly App Review Pulse - ${new Date().toISOString().split('T')[0]}`;
        const draftResult = await gmailClient.createDraftEmail(emailTo, emailSubject, finalEmailContent);
        console.log(`✉️ Gmail MCP Output: ${draftResult}`);
    } catch (error: any) {
        console.warn(`⚠️ Gmail MCP integration offline or error: ${error.message || error}`);
    } finally {
        await gmailClient.disconnect().catch(() => {});
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n🎉 [Phase 5] Full Pipeline completed successfully in ${duration}s.`);
}

// Command Line Interface
if (require.main === module) {
    const isCron = process.argv.includes('--cron');
    const customSchedule = process.env.CRON_SCHEDULE || '0 9 * * 1';

    if (isCron) {
        const scheduler = new PipelineScheduler({
            cronExpression: customSchedule,
            onTrigger: executeWeeklyPulsePipeline
        });
        scheduler.start();
        console.log('Press Ctrl+C to stop the scheduler.');
    } else {
        executeWeeklyPulsePipeline().catch(console.error);
    }
}
