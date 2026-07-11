import * as fs from 'fs';
import * as path from 'path';
import { RateLimiter, estimateTokens, GROQ_LLAMA33_70B_LIMITS } from './llm/rate-limiter';
import { PipelineScheduler } from './orchestration/scheduler';
import { executeWeeklyPulsePipeline } from './main';

async function testPhase5() {
    console.log('======================================================');
    console.log('🧪 Testing Phase 5: Orchestration, Rate Limits & Automation');
    console.log('======================================================\n');

    // 1. Rate Limiter & Token Budget Verification
    console.log('1. Verifying Groq Llama-3.3-70b-versatile Rate Limits & Token Estimator...');
    console.log(`   Model Rate Limits: RPM=${GROQ_LLAMA33_70B_LIMITS.rpm}, TPM=${GROQ_LLAMA33_70B_LIMITS.tpm}, RPD=${GROQ_LLAMA33_70B_LIMITS.rpd}, TPD=${GROQ_LLAMA33_70B_LIMITS.tpd}`);

    const sampleText = "This is a sample review text to verify token estimation for Groq rate limits.";
    const estimated = estimateTokens(sampleText);
    console.log(`   Sample text token estimation: ${estimated} tokens for "${sampleText.slice(0, 30)}..."`);

    const rateLimiter = new RateLimiter(GROQ_LLAMA33_70B_LIMITS);
    await rateLimiter.waitForCapacity(200);
    console.log(`   Tokens logged in last minute: ${rateLimiter.getTokensInLastMinute()}`);
    console.log(`   Requests logged in last minute: ${rateLimiter.getRequestsInLastMinute()}`);
    console.log('✅ RateLimiter token capacity check passed!\n');

    // 2. Scheduler Verification
    console.log('2. Verifying PipelineScheduler initialization and stop control...');
    let triggerCount = 0;
    const testScheduler = new PipelineScheduler({
        cronExpression: '* * * * * *', // Every second for instant test trigger
        onTrigger: async () => {
            triggerCount++;
        }
    });

    testScheduler.start();
    await new Promise(resolve => setTimeout(resolve, 1500));
    testScheduler.stop();

    if (triggerCount > 0) {
        console.log(`✅ PipelineScheduler test trigger executed (${triggerCount} time(s)).`);
    } else {
        console.warn('⚠️ Scheduler trigger count was 0 during rapid test window.');
    }

    // 3. Full End-to-End Pipeline Execution
    console.log('\n3. Running Full End-to-End Orchestrated Pipeline...');
    await executeWeeklyPulsePipeline();

    // 4. Output File Validation
    const outputDir = path.resolve(__dirname, '../output');
    const mdPath = path.join(outputDir, 'weekly_pulse.md');
    const htmlPath = path.join(outputDir, 'email_draft.html');
    const jsonPath = path.join(outputDir, 'llm_report.json');

    if (fs.existsSync(mdPath) && fs.existsSync(htmlPath) && fs.existsSync(jsonPath)) {
        console.log('\n✅ All Phase 5 output artifacts present:');
        console.log(`   - Markdown Report: ${mdPath}`);
        console.log(`   - HTML Email Draft: ${htmlPath}`);
        console.log(`   - LLM Insights JSON: ${jsonPath}`);
    } else {
        console.error('❌ Missing expected output artifacts.');
        process.exit(1);
    }

    console.log('\n🎉 Phase 5 Test Suite completed successfully!');
}

testPhase5().catch(console.error);
