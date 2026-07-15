import { google } from 'googleapis';
import https from 'node:https';
import { GoogleAuthService } from '../auth/googleAuth.js';
import { validateDraftInput, validateEmailInput } from '../utils/validation.js';
import type { DraftEmailInput, GmailEmailInput, ToolResponse } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('gmailService');

export class GmailService {
  constructor(private readonly authService: GoogleAuthService = new GoogleAuthService()) {}

  async sendEmail(input: GmailEmailInput): Promise<ToolResponse> {
    try {
      const data = validateEmailInput(input);
      const credentials = await this.authService.getCredentials();
      const oauth2Client = this.authService.getClient();
      oauth2Client.setCredentials(credentials);

      const gmail = google.gmail({
        version: 'v1',
        auth: oauth2Client,
        agent: new https.Agent({ keepAlive: false })
      });
      let messageHeaders = `To: ${data.to}\r\n` +
        (data.cc ? `Cc: ${data.cc.join(', ')}\r\n` : '') +
        (data.bcc ? `Bcc: ${data.bcc.join(', ')}\r\n` : '') +
        `Subject: ${data.subject}\r\n`;

      if (data.isHtml) {
        messageHeaders += `MIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n`;
      }

      const encodedMessage = Buffer.from(
        messageHeaders + `\r\n${data.body}`
      ).toString('base64');

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedMessage },
      });

      logger.info('Email sent', { messageId: response.data.id });
      return {
        success: true,
        message: 'Email sent successfully',
        data: { messageId: response.data.id },
      };
    } catch (error) {
      logger.error('Failed to send email', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        message: 'Failed to send email',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async createDraft(input: DraftEmailInput): Promise<ToolResponse> {
    try {
      const data = validateDraftInput(input);
      const credentials = await this.authService.getCredentials();
      const oauth2Client = this.authService.getClient();
      oauth2Client.setCredentials(credentials);

      const gmail = google.gmail({
        version: 'v1',
        auth: oauth2Client,
        agent: new https.Agent({ keepAlive: false })
      });
      
      let messageHeaders = `To: ${data.to}\r\n` +
        (data.cc ? `Cc: ${data.cc.join(', ')}\r\n` : '') +
        (data.bcc ? `Bcc: ${data.bcc.join(', ')}\r\n` : '') +
        `Subject: ${data.subject}\r\n`;

      if (data.isHtml) {
        messageHeaders += `MIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n`;
      }

      const encodedMessage = Buffer.from(
        messageHeaders + `\r\n${data.body}`
      ).toString('base64');

      const response = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: { message: { raw: encodedMessage } },
      });

      logger.info('Draft created', { draftId: response.data.id });
      return {
        success: true,
        message: 'Draft created successfully',
        data: { draftId: response.data.id },
      };
    } catch (error) {
      logger.error('Failed to create draft', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        message: 'Failed to create draft',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
