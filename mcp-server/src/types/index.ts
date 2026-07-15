export interface GmailEmailInput {
  to: string;
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  isHtml?: boolean;
}

export interface DraftEmailInput extends GmailEmailInput {}

export interface GoogleDocAppendInput {
  documentIdOrUrl: string;
  content: string;
}

export interface ToolResponse {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  tokenStorePath: string;
}

export interface TokenStoreData {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
}
