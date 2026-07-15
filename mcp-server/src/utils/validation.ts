import { z } from 'zod';

export const emailInputSchema = z.object({
  to: z.string().trim().min(1, 'Recipient is required').email('Recipient must be a valid email address'),
  subject: z.string().trim().min(1, 'Subject is required'),
  body: z.string().trim().min(1, 'Body is required'),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  isHtml: z.boolean().optional(),
});

export const draftInputSchema = emailInputSchema;

export const docAppendInputSchema = z.object({
  documentIdOrUrl: z.string().trim().min(1, 'Document identifier or URL is required'),
  content: z.string().trim().min(1, 'Content is required'),
});

export function validateEmailInput(input: unknown) {
  return emailInputSchema.parse(input);
}

export function validateDraftInput(input: unknown) {
  return draftInputSchema.parse(input);
}

export function validateDocAppendInput(input: unknown) {
  return docAppendInputSchema.parse(input);
}
