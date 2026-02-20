import { Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ResendWebhookService } from './resend-webhook.service';

@Controller('emails/resend')
export class ResendWebhookController {
  constructor(private readonly resendWebhookService: ResendWebhookService) {}

  @Post('webhook')
  async handleWebhook(@Req() req: Request) {
    return this.resendWebhookService.handleWebhook(req);
  }
}
