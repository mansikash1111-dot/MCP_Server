import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class GmailMCPClient {
    private client: Client;
    private transport: StdioClientTransport | null = null;
    private disabled: boolean = false;

    constructor() {
        this.client = new Client({
            name: "weekly-pulse-gmail-client",
            version: "1.0.0"
        }, {
            capabilities: {}
        });
    }

    async connect() {
        // If no explicit server command was configured, MCP integration is
        // considered unavailable (e.g. running on Railway without a custom
        // Gmail MCP server). Skip attempting to spawn a process.
        const command = process.env.GMAIL_MCP_SERVER_COMMAND;
        if (!command) {
            console.warn(
                "⚠️ GMAIL_MCP_SERVER_COMMAND is not set. Gmail MCP integration is disabled."
            );
            this.disabled = true;
            return;
        }

        const argsStr = process.env.GMAIL_MCP_SERVER_ARGS || "";
        const args = argsStr
            ? argsStr.split(',').map(arg => arg.trim())
            : [];

        try {
            this.transport = new StdioClientTransport({
                command,
                args
            });

            await this.client.connect(this.transport);
        } catch (error: any) {
            console.warn(
                `⚠️ Failed to connect to Gmail MCP server (${command}). Disabling Gmail integration. Reason: ${error?.message || error}`
            );
            this.disabled = true;
            this.transport = null;
        }
    }

    async createDraftEmail(to: string, subject: string, htmlContent: string): Promise<string> {
        if (!this.transport && !this.disabled) {
            await this.connect();
        }

        if (this.disabled || !this.transport) {
            console.warn("⚠️ Gmail MCP integration is unavailable. Skipping draft creation.");
            return "Gmail MCP integration unavailable (skipped)";
        }

        try {
            const response = await this.client.callTool({
                name: "create_draft",
                arguments: {
                    to: to,
                    subject: subject,
                    body: htmlContent,
                    isHtml: true
                }
            });
            
            if ('content' in response && Array.isArray(response.content) && response.content.length > 0) {
                const firstItem = response.content[0];
                if (firstItem && 'text' in firstItem && typeof firstItem.text === 'string') {
                    const text = firstItem.text;
                    try {
                        const parsed = JSON.parse(text);
                        if (parsed.success && typeof parsed.message === 'string') {
                            return parsed.message;
                        }
                    } catch (e) {
                        // Ignore JSON parse error, fallback to raw text
                    }
                    return text;
                }
            }
            return "Draft created (no response text returned)";
        } catch (error) {
            console.error("Failed to create Gmail Draft via MCP:", error);
            throw error;
        }
    }

    async disconnect() {
        if (this.transport) {
            await this.transport.close();
            this.transport = null;
        }
    }
}

