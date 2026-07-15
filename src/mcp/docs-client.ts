import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as fs from 'fs';
import * as path from 'path';

export class DocsMCPClient {
    private client: Client;
    private transport: StdioClientTransport | null = null;

    constructor() {
        this.client = new Client({
            name: "weekly-pulse-docs-client",
            version: "1.0.0"
        }, {
            capabilities: {}
        });
    }

    async connect() {
        let command = process.env.GOOGLE_DOCS_MCP_SERVER_COMMAND;
        let args: string[] = [];

        // Check for packaged custom local MCP server
        const localMcpPath = path.resolve(__dirname, '..', '..', 'mcp-server', 'dist', 'src', 'index.js');
        if (!command && fs.existsSync(localMcpPath)) {
            console.log(`🔌 [Docs MCP] Launching custom local MCP Server at ${localMcpPath}`);
            command = "node";
            args = [localMcpPath];
        } else {
            command = command || "npx";
            const argsStr = process.env.GOOGLE_DOCS_MCP_SERVER_ARGS || "-y,@modelcontextprotocol/server-google-docs";
            args = argsStr.split(',').map(arg => arg.trim());
        }

        this.transport = new StdioClientTransport({
            command,
            args
        });

        await this.client.connect(this.transport);
    }

    async createPulseDocument(title: string, markdownContent: string): Promise<string> {
        if (!this.transport) await this.connect();

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

