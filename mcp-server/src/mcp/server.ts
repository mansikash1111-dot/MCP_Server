import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { registerTools } from './tools.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('mcpServer');

export async function startServer() {
  const server = new Server(
    {
      name: 'mcp-google-services',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const tools = registerTools();

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
          cc: { type: 'array', 'items': { type: 'string' } },
          bcc: { type: 'array', 'items': { type: 'string' } },
          documentIdOrUrl: { type: 'string' },
          content: { type: 'string' },
        },
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find((entry) => entry.name === request.params.name);
    if (!tool) {
      throw new Error(`Tool ${request.params.name} not found`);
    }

    try {
      const result = await tool.handler(request.params.arguments as Record<string, unknown>);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error('Tool execution failed', { tool: request.params.name, error: error instanceof Error ? error.message : String(error) });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: false, message: 'Tool execution failed', error: error instanceof Error ? error.message : String(error) }, null, 2),
          },
        ],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP server started');
}
