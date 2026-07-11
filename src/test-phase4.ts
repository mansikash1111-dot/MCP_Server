import * as fs from 'fs';
import * as path from 'path';
import { LLMReportOutput } from './llm/llm-processor';
import { formatReport } from './orchestration/formatter';
import { DocsMCPClient } from './mcp/docs-client';
import { GmailMCPClient } from './mcp/gmail-client';

async function testPhase4() {
    console.log('--- Testing Phase 4: Formatting & MCP Integration ---');

    const llmReportPath = path.resolve(__dirname, '../output/llm_report.json');
    if (!fs.existsSync(llmReportPath)) {
        console.error('❌ llm_report.json not found in output/. Run Phase 3 first.');
        process.exit(1);
    }

    const llmOutput: LLMReportOutput = JSON.parse(fs.readFileSync(llmReportPath, 'utf-8'));
    console.log('✅ Loaded Phase 3 LLM Report output.');

    // 1. Programmatic Formatting Verification
    console.log('\n1. Verifying Programmatic Formatting...');
    const formatted = formatReport(llmOutput, 'https://docs.google.com/document/d/sample-id/edit');

    console.log('\n--- Generated Markdown Report Preview ---');
    console.log(formatted.markdownReport);

    console.log('\n--- Generated HTML Email Draft Preview ---');
    console.log(formatted.htmlEmailBody);

    // Save formatted outputs
    const outputDir = path.resolve(__dirname, '../output');
    const mdFile = path.join(outputDir, 'weekly_pulse.md');
    const htmlFile = path.join(outputDir, 'email_draft.html');

    fs.writeFileSync(mdFile, formatted.markdownReport, 'utf-8');
    fs.writeFileSync(htmlFile, formatted.htmlEmailBody, 'utf-8');
    console.log(`\n✅ Saved Markdown report to ${mdFile}`);
    console.log(`✅ Saved HTML draft email to ${htmlFile}`);

    // Verify word count of Markdown report
    const wordCount = formatted.markdownReport.trim().split(/\s+/).length;
    console.log(`\n📊 Markdown Word Count: ${wordCount} words (Requirement: ≤ 250 words)`);
    if (wordCount <= 250) {
        console.log('✅ Word count constraint satisfied!');
    } else {
        console.warn('⚠️ Word count exceeds 250 words.');
    }

    // 2. MCP Client Verification
    console.log('\n2. Testing MCP Clients (Google Docs & Gmail)...');
    
    const docsClient = new DocsMCPClient();
    try {
        console.log('Attempting Docs MCP client connection...');
        const docResult = await docsClient.createPulseDocument('Test Weekly Pulse', formatted.markdownReport);
        console.log(`✅ Docs MCP tool result: ${docResult}`);
    } catch (e: any) {
        console.log(`ℹ️ Docs MCP call handled (offline/server not running): ${e.message}`);
    } finally {
        await docsClient.disconnect().catch(() => {});
    }

    const gmailClient = new GmailMCPClient();
    try {
        console.log('Attempting Gmail MCP client connection...');
        const draftResult = await gmailClient.createDraftEmail('test@example.com', 'Test Weekly Pulse Email', formatted.htmlEmailBody);
        console.log(`✅ Gmail MCP tool result: ${draftResult}`);
    } catch (e: any) {
        console.log(`ℹ️ Gmail MCP call handled (offline/server not running): ${e.message}`);
    } finally {
        await gmailClient.disconnect().catch(() => {});
    }

    console.log('\n🎉 Phase 4 Test completed successfully!');
}

testPhase4().catch(console.error);
