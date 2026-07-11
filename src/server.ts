import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import Groq from 'groq-sdk';
import { executeWeeklyPulsePipeline } from './main';
import { DocsMCPClient } from './mcp/docs-client';
import { GmailMCPClient } from './mcp/gmail-client';
import { formatReport } from './orchestration/formatter';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const NORMALIZED_JSON_PATH = path.join(OUTPUT_DIR, 'normalized_reviews.json');
const LLM_REPORT_JSON_PATH = path.join(OUTPUT_DIR, 'llm_report.json');
const WEEKLY_PULSE_MD_PATH = path.join(OUTPUT_DIR, 'weekly_pulse.md');

// Helper to check if file exists and read it
const readJsonFile = (filePath: string): any => {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error(`Error reading file ${filePath}:`, e);
    }
    return null;
};

// GET /api/data - Retrieve current reviews and reports
app.get('/api/data', (req, res) => {
    const reviews = readJsonFile(NORMALIZED_JSON_PATH) || [];
    const llmReport = readJsonFile(LLM_REPORT_JSON_PATH) || null;
    let weeklyPulse = '';
    
    try {
        if (fs.existsSync(WEEKLY_PULSE_MD_PATH)) {
            weeklyPulse = fs.readFileSync(WEEKLY_PULSE_MD_PATH, 'utf-8');
        }
    } catch (e) {
        console.error('Error reading weekly pulse:', e);
    }

    res.json({
        reviews,
        llmReport,
        weeklyPulse
    });
});

// POST /api/sync - Run the full pipeline
app.post('/api/sync', async (req, res) => {
    try {
        console.log('🔄 Triggering weekly reviews pipeline sync via API...');
        await executeWeeklyPulsePipeline();
        
        const reviews = readJsonFile(NORMALIZED_JSON_PATH) || [];
        const llmReport = readJsonFile(LLM_REPORT_JSON_PATH) || null;
        let weeklyPulse = '';
        if (fs.existsSync(WEEKLY_PULSE_MD_PATH)) {
            weeklyPulse = fs.readFileSync(WEEKLY_PULSE_MD_PATH, 'utf-8');
        }

        res.json({
            success: true,
            message: 'Pipeline executed and data refreshed successfully.',
            data: { reviews, llmReport, weeklyPulse }
        });
    } catch (error: any) {
        console.error('Error executing pipeline sync:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to sync and run pipeline.'
        });
    }
});

// POST /api/publish/doc - Publish current report to Google Docs
app.post('/api/publish/doc', async (req, res) => {
    const { markdown } = req.body;
    if (!markdown) {
        return res.status(400).json({ success: false, error: 'Markdown content is required.' });
    }

    const docsClient = new DocsMCPClient();
    try {
        console.log('📄 Creating Google Doc via MCP...');
        const docTitle = `Weekly Pulse - ${new Date().toISOString().split('T')[0]}`;
        const docUrl = await docsClient.createPulseDocument(docTitle, markdown);
        res.json({ success: true, docUrl });
    } catch (error: any) {
        console.error('Docs MCP failed:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to publish Google Doc.' });
    } finally {
        await docsClient.disconnect().catch(() => {});
    }
});

// POST /api/publish/email - Publish current draft to Gmail
app.post('/api/publish/email', async (req, res) => {
    const { docUrl } = req.body;
    const llmReport = readJsonFile(LLM_REPORT_JSON_PATH);
    
    if (!llmReport) {
        return res.status(400).json({ success: false, error: 'No active LLM report found to build email from.' });
    }

    const gmailClient = new GmailMCPClient();
    try {
        console.log('✉️ Creating Gmail Draft via MCP...');
        const finalEmailContent = formatReport(llmReport, docUrl || 'Document created (local preview saved)').htmlEmailBody;
        const emailTo = process.env.USER_EMAIL || 'team@example.com';
        const emailSubject = `Weekly App Review Pulse - ${new Date().toISOString().split('T')[0]}`;
        const draftResult = await gmailClient.createDraftEmail(emailTo, emailSubject, finalEmailContent);
        res.json({ success: true, draftResult });
    } catch (error: any) {
        console.error('Gmail MCP failed:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to publish Gmail draft.' });
    } finally {
        await gmailClient.disconnect().catch(() => {});
    }
});

// POST /api/bug-report - Generate a bug report using LLM from selected reviews
app.post('/api/bug-report', async (req, res) => {
    const { reviews } = req.body;
    if (!reviews || !Array.isArray(reviews) || reviews.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one review must be selected.' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
        return res.status(500).json({ success: false, error: 'GROQ_API_KEY is not configured on the server.' });
    }

    const groq = new Groq({ apiKey: GROQ_API_KEY });
    
    const formattedReviews = reviews.map((r: any) => `[Rating: ${r.rating}][Platform: ${r.platform || 'unknown'}] Title: ${r.title} - Text: ${r.text}`).join('\n\n');
    
    const systemPrompt = `You are a Technical Lead and Senior QA Engineer.
Your task is to analyze the user reviews containing negative feedback and produce a single structured bug report in JSON format.
Ensure you synthesize the selected reviews to find the common root bug.

You MUST respond with a valid JSON object matching this schema exactly:
{
  "title": "A clear, descriptive bug title summarizing the issue",
  "severity": "High | Medium | Low",
  "platform": "iOS | Android | Both",
  "description": "A comprehensive summary of the bug and its impact on the users",
  "stepsToReproduce": [
    "1. Open the app",
    "2. Navigate to ...",
    "3. Observe the bug..."
  ],
  "expectedBehavior": "What should have happened under normal conditions",
  "actualBehavior": "What is actually happening according to user reports",
  "userQuotes": [
    "Quote 1 (must be verbatim from the input)",
    "Quote 2 (must be verbatim from the input)"
  ]
}

Do not write any commentary outside the JSON object.`;

    const userPrompt = `Here are the selected reviews:\n\n${formattedReviews}`;

    try {
        console.log(`🤖 Generating bug report from ${reviews.length} selected reviews using Groq...`);
        const response = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            model: 'llama3-70b-8192',
            response_format: { type: 'json_object' },
            temperature: 0.2
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('Empty response from Groq');
        }

        const bugReport = JSON.parse(content);
        res.json({ success: true, bugReport });
    } catch (error: any) {
        console.error('Error generating bug report:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to generate bug report.' });
    }
});

// Serve frontend static files in production
const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendBuildPath)) {
    app.use(express.static(frontendBuildPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(frontendBuildPath, 'index.html'));
    });
}

app.listen(port, () => {
    console.log(`🚀 API Server listening at http://localhost:${port}`);
});
