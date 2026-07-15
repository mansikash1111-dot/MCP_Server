import { google } from 'googleapis';
import https from 'node:https';
import { GoogleAuthService } from '../auth/googleAuth.js';
import { validateDocAppendInput } from '../utils/validation.js';
import { createLogger } from '../utils/logger.js';
import type { GoogleDocAppendInput, ToolResponse } from '../types/index.js';

const logger = createLogger('docsService');

export class DocsService {
  constructor(private readonly authService: GoogleAuthService = new GoogleAuthService()) {}

  async appendToDocument(input: GoogleDocAppendInput): Promise<ToolResponse> {
    try {
      const data = validateDocAppendInput(input);
      const credentials = await this.authService.getCredentials();
      const oauth2Client = this.authService.getClient();
      oauth2Client.setCredentials(credentials);

      const docs = google.docs({
        version: 'v1',
        auth: oauth2Client,
        agent: new https.Agent({ keepAlive: false })
      });
      const documentId = this.extractDocumentId(data.documentIdOrUrl);

      const response = await docs.documents.get({ documentId });
      const documentTitle = response.data.title || 'Untitled document';

      const requests = [
        {
          insertText: {
            location: {
              index: response.data.body?.content?.[response.data.body.content.length - 1]?.endIndex ?? 1,
            },
            text: `${data.content}\n`,
          },
        },
      ];

      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests },
      });

      logger.info('Appended content to document', { documentId, documentTitle });
      return {
        success: true,
        message: 'Content appended to document successfully',
        data: { documentId, documentTitle },
      };
    } catch (error) {
      logger.error('Failed to append document content', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        message: 'Failed to append content to document',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async createDocument(input: { title: string; content?: string }): Promise<ToolResponse> {
    try {
      const credentials = await this.authService.getCredentials();
      const oauth2Client = this.authService.getClient();
      oauth2Client.setCredentials(credentials);

      const docs = google.docs({
        version: 'v1',
        auth: oauth2Client,
        agent: new https.Agent({ keepAlive: false })
      });
      const createResponse = await docs.documents.create({
        requestBody: { title: input.title },
      });

      const documentId = createResponse.data.documentId;
      if (!documentId) {
        throw new Error('Failed to create document: No document ID returned');
      }

      if (input.content) {
        const requests = [
          {
            insertText: {
              location: { index: 1 },
              text: input.content,
            },
          },
        ];

        await docs.documents.batchUpdate({
          documentId,
          requestBody: { requests },
        });
      }

      const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;
      logger.info('Created new document', { documentId, title: input.title });
      return {
        success: true,
        message: 'Document created successfully',
        data: { documentId, title: input.title, documentUrl },
      };
    } catch (error) {
      logger.error('Failed to create document', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        message: 'Failed to create document',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private extractDocumentId(documentIdOrUrl: string): string {
    if (/^https?:\/\//.test(documentIdOrUrl)) {
      const match = documentIdOrUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!match?.[1]) {
        throw new Error('Unable to extract document ID from URL');
      }
      return match[1];
    }
    return documentIdOrUrl;
  }
}
