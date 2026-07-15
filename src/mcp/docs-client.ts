import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class DocsMCPClient {
    private client: Client;
    private transport: StdioClientTransport | null = null;
    private disabled: boolean = false;

    constructor() {
        this.client = new Client({
            name: "weekly-pulse-docs-client",
            version: "1.0.0"
        }, {
            capabilities: {}
        });
    }

    async connect() {
        // If no explicit server command was configured, MCP integration is
        // considered unavailable (e.g. running on Railway without a custom
        // Google Docs MCP server). Skip attempting to spawn a process.
        const command = process.env.GOOGLE_DOCS_MCP_SERVER_COMMAND;
        if (!command) {
            console.warn(
                "⚠️ GOOGLE_DOCS_MCP_SERVER_COMMAND is not set. Google Docs MCP integration is disabled."
            );
            this.disabled = true;
            return;
        }

        const argsStr = process.env.GOOGLE_DOCS_MCP_SERVER_ARGS || "";
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
                `⚠️ Failed to connect to Google Docs MCP server (${command}). Disabling Google Docs integration. Reason: ${error?.message || error}`
            );
            this.disabled = true;
            this.transport = null;
        }
    }

    async createPulseDocument(title: string, markdownContent: string): Promise<string> {
        if (!this.transport && !this.disabled) {
            await this.connect();
        }

        if (this.disabled || !this.transport) {
            console.warn("⚠️ Google Docs MCP integration is unavailable. Skipping document creation.");
            return "Google Docs MCP integration unavailable (skipped)";
        }

        try {
            const response = await this.client.callTool({
                name: "create_document",
                arguments: {
                    title: title,
                    content: markdownContent
                }
            });
            
            if ('content' in response && Array.isArray(response.content) && response.content.length > 0) {
                const firstItem = response.content[0];
                if (firstItem && 'text' in firstItem && typeof firstItem.text === 'string') {
                    const text = firstItem.text;
                    try {
                        const parsed = JSON.parse(text);
                        if (parsed.success && parsed.data && typeof parsed.data.documentUrl === 'string') {
                            return parsed.data.documentUrl;
                        }
                    } catch (e) {
                        // Ignore JSON parse error, fallback to raw text
                    }
                    return text;
                }
            }
            return "Document created (no URL returned)";
        } catch (error) {
            console.error("Failed to create Google Doc via MCP:", error);
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

