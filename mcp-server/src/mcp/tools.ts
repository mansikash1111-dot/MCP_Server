import { GmailService } from '../services/gmailService.js';
import { DocsService } from '../services/docsService.js';
import type { DraftEmailInput, GmailEmailInput, GoogleDocAppendInput, ToolResponse } from '../types/index.js';

export interface RegisteredTool {
  name: string;
  description: string;
  handler: (args: Record<string, unknown>) => Promise<ToolResponse>;
}

export function registerTools(): RegisteredTool[] {
  const gmailService = new GmailService();
  const docsService = new DocsService();

  return [
    {
      name: 'send_gmail_email',
      description: 'Send a Gmail message to one or more recipients',
      handler: async (args) => gmailService.sendEmail(args as unknown as GmailEmailInput),
    },
    {
      name: 'create_gmail_draft',
      description: 'Create a Gmail draft message',
      handler: async (args) => gmailService.createDraft(args as unknown as DraftEmailInput),
    },
    {
      name: 'create_draft',
      description: 'Create a Gmail draft email (supporting HTML content)',
      handler: async (args) => gmailService.createDraft(args as unknown as DraftEmailInput),
    },
    {
      name: 'append_google_doc_content',
      description: 'Append content to an existing Google Doc',
      handler: async (args) => docsService.appendToDocument(args as unknown as GoogleDocAppendInput),
    },
    {
      name: 'create_document',
      description: 'Create a new Google Doc with specified title and content',
      handler: async (args) => docsService.createDocument(args as { title: string; content?: string }),
    },
  ];
}
