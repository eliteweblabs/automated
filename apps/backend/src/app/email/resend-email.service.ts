import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ResendSendEmailRequest = {
  from: string;
  to: string[] | string;
  subject: string;
  html?: string;
  text?: string;
  cc?: string[] | string;
  bcc?: string[] | string;
  reply_to?: string[] | string;
  replyTo?: string[] | string;
  tags?: Array<{ name: string; value: string }>;
  headers?: Record<string, string>;
};

@Injectable()
export class ResendEmailService {
  private readonly baseUrl = 'https://api.resend.com';

  constructor(private readonly configService: ConfigService) {}

  async sendEmail(payload: ResendSendEmailRequest) {
    const { replyTo, reply_to, ...rest } = payload;
    const body = {
      ...rest,
      ...(reply_to ? { reply_to } : replyTo ? { reply_to: replyTo } : {}),
    };
    return this.request('/emails', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getSentEmail(id: string) {
    return this.request(`/emails/${id}`, { method: 'GET' });
  }

  async getReceivedEmail(id: string) {
    return this.request(`/emails/receiving/${id}`, { method: 'GET' });
  }

  private async request(path: string, init: RequestInit) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException('Missing RESEND_API_KEY');
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    const payload = text ? this.safeJsonParse(text) : null;

    if (!response.ok) {
      const message =
        (payload && typeof payload === 'object' && 'message' in payload && payload.message) ||
        text ||
        `Resend API error (${response.status})`;
      throw new InternalServerErrorException(message as string);
    }

    return payload;
  }

  private safeJsonParse(value: string) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}
