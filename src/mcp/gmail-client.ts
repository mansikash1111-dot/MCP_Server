import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class GmailMCPClient {
    private client: Client;
    private transport: StdioClientTransport | null = null;

    constructor() {
        this.client = new Client({
            name: "weekly-pulse-gmail-client",
            version: "1.0.0"
        }, {
            capabilities: {}
        });
    }

    async connect() {
        const command = process.env.GMAIL_MCP_SERVER_COMMAND || "npx";
        const argsStr = process.env.GMAIL_MCP_SERVER_ARGS || "-y,@modelcontextprotocol/server-gmail";
        const args = argsStr.split(',').map(arg => arg.trim());

        this.transport = new StdioClientTransport({
            command,
            args
        });

        await this.client.connect(this.transport);
    }

    async createDraftEmail(to: string, subject: string, htmlContent: string): Promise<string> {
        if (!this.transport) await this.connect();

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

