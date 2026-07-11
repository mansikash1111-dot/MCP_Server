import * as cron from 'node-cron';

export interface SchedulerOptions {
    cronExpression?: string; // default: '0 9 * * 1' (Mondays at 9:00 AM)
    timezone?: string;
    onTrigger: () => Promise<void>;
}

export class PipelineScheduler {
    private task: cron.ScheduledTask | null = null;
    private options: SchedulerOptions;

    constructor(options: SchedulerOptions) {
        this.options = {
            cronExpression: '0 9 * * 1', // Weekly on Monday at 9:00 AM
            ...options
        };
    }

    public start(): void {
        const cronExpr = this.options.cronExpression || '0 9 * * 1';
        
        if (!cron.validate(cronExpr)) {
            throw new Error(`Invalid cron expression: ${cronExpr}`);
        }

        console.log(`⏰ [Scheduler] Pipeline scheduler started with schedule: "${cronExpr}"`);
        
        const cronOptions: Record<string, any> = {};
        if (this.options.timezone) {
            cronOptions.timezone = this.options.timezone;
        }

        this.task = cron.schedule(cronExpr, async () => {
            console.log(`⏰ [Scheduler] Cron triggered at ${new Date().toISOString()}`);
            try {
                await this.options.onTrigger();
            } catch (error) {
                console.error('❌ [Scheduler] Pipeline execution failed during scheduled run:', error);
            }
        }, cronOptions);
    }

    public stop(): void {
        if (this.task) {
            this.task.stop();
            this.task = null;
            console.log('🛑 [Scheduler] Scheduler stopped.');
        }
    }
}
