import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { WorkflowExecutionService } from '../workflow/workflow-execution.service';
import { WorkflowGenerationService } from '../workflow/workflow-generation.service';
import { ResendEmailService } from './resend-email.service';

type ResendEmailReceivedEvent = {
  type: 'email.received';
  created_at: string;
  data: {
    email_id: string;
    created_at?: string;
    from?: string;
    to?: string[] | string;
    cc?: string[];
    bcc?: string[];
    subject?: string;
    message_id?: string;
  };
};

type NormalizedReceivedEmail = {
  from: string;
  to: string[];
  subject: string | null;
  messageId: string | null;
  receivedAt: Date | null;
  html: string | null;
  text: string | null;
  headers: any;
  attachments: any;
};

@Injectable()
export class ResendWebhookService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly workflowExecutionService: WorkflowExecutionService,
    private readonly workflowGenerationService: WorkflowGenerationService,
    private readonly resendEmailService: ResendEmailService,
  ) {}

  async handleWebhook(req: Request) {
    const rawBody = (req as any).rawBody as string | undefined;
    if (!rawBody) {
      throw new BadRequestException('Missing raw body for webhook verification');
    }

    const secret = this.configService.get<string>('RESEND_WEBHOOK_SECRET');
    if (!secret) {
      throw new InternalServerErrorException('Missing RESEND_WEBHOOK_SECRET');
    }

    const headers = this.getSvixHeaders(req);
    this.verifyWebhookSignature(secret, rawBody, headers);

    let event: unknown;
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }

    if (!this.isEmailReceivedEvent(event)) {
      return { received: true };
    }

    const emailId = event.data?.email_id;
    if (!emailId) {
      throw new BadRequestException('Missing email_id in webhook payload');
    }

    const existing = await this.prisma.inboundEmail.findUnique({
      where: { resendId: emailId },
      select: { id: true },
    });
    if (existing) {
      return { received: true, ignored: true };
    }

    const inboundDomain = this.configService.get<string>('RESEND_INBOUND_DOMAIN');
    if (!inboundDomain) {
      throw new InternalServerErrorException('Missing RESEND_INBOUND_DOMAIN');
    }

    const slug = this.extractSlugFromRecipients(
      this.normalizeRecipients(event.data?.to),
      inboundDomain,
    );
    if (!slug) {
      return { received: true, ignored: true };
    }

    const workflow = await this.prisma.workflow.findUnique({
      where: { humanId: slug },
      include: { user: { select: { email: true } } },
    });
    if (!workflow) {
      return { received: true, ignored: true };
    }

    if (!workflow.user) {
      await this.prisma.inboundEmail.create({
        data: {
          resendId: emailId,
          workflowId: workflow.id,
          from: event.data?.from ?? 'unknown',
          to: this.normalizeRecipients(event.data?.to),
          subject: event.data?.subject ?? null,
          messageId: event.data?.message_id ?? null,
          receivedAt: this.parseDate(event.data?.created_at),
          status: 'rejected',
          error: 'Workflow has no owner',
        },
      });
      return { received: true, rejected: true };
    }

    const ownerEmail = workflow.user.email;
    const senderEmail = this.parseEmailAddress(event.data?.from);
    const senderMatches =
      !!ownerEmail && !!senderEmail && ownerEmail.toLowerCase() === senderEmail.toLowerCase();

    let receivedEmail: any = null;
    let receivedError: string | null = null;
    try {
      receivedEmail = await this.resendEmailService.getReceivedEmail(emailId);
    } catch (error) {
      receivedError = error instanceof Error ? error.message : 'Failed to retrieve email content';
    }

    const normalized = this.normalizeReceivedEmail(event, receivedEmail);

    if (receivedError) {
      await this.prisma.inboundEmail.create({
        data: {
          resendId: emailId,
          workflowId: workflow.id,
          from: normalized.from,
          to: normalized.to,
          subject: normalized.subject,
          messageId: normalized.messageId,
          receivedAt: normalized.receivedAt,
          html: normalized.html,
          text: normalized.text,
          headers: normalized.headers,
          attachments: normalized.attachments,
          status: 'failed',
          error: receivedError,
        },
      });
      return { received: true, failed: true };
    }

    if (!senderMatches) {
      const errorMessage = !ownerEmail
        ? 'Workflow owner email not found'
        : 'Sender not allowed to trigger this workflow';
      await this.prisma.inboundEmail.create({
        data: {
          resendId: emailId,
          workflowId: workflow.id,
          from: normalized.from,
          to: normalized.to,
          subject: normalized.subject,
          messageId: normalized.messageId,
          receivedAt: normalized.receivedAt,
          html: normalized.html,
          text: normalized.text,
          headers: normalized.headers,
          attachments: normalized.attachments,
          status: 'rejected',
          error: errorMessage,
        },
      });
      return { received: true, rejected: true };
    }

    const inboundEmail = await this.prisma.inboundEmail.create({
      data: {
        resendId: emailId,
        workflowId: workflow.id,
        from: normalized.from,
        to: normalized.to,
        subject: normalized.subject,
        messageId: normalized.messageId,
        receivedAt: normalized.receivedAt,
        html: normalized.html,
        text: normalized.text,
        headers: normalized.headers,
        attachments: normalized.attachments,
        status: 'received',
      },
    });

    const inputValues = await this.inferWorkflowInputsFromEmail(workflow, normalized);

    const startResult = await this.workflowExecutionService.startWorkflow(
      workflow.id,
      workflow.user.email,
      inputValues,
    );

    if (!startResult.success) {
      await this.prisma.inboundEmail.update({
        where: { id: inboundEmail.id },
        data: {
          status: 'failed',
          error: startResult.message,
        },
      });
      return { received: true, failed: true };
    }

    const runId = this.workflowExecutionService.getStatus(workflow.id).runId ?? null;
    await this.prisma.inboundEmail.update({
      where: { id: inboundEmail.id },
      data: {
        status: 'triggered',
        runId,
      },
    });

    return { received: true, triggered: true };
  }

  private getSvixHeaders(req: Request) {
    return {
      'svix-id': this.getHeaderValue(req, 'svix-id') ?? this.getHeaderValue(req, 'webhook-id'),
      'svix-timestamp':
        this.getHeaderValue(req, 'svix-timestamp') ?? this.getHeaderValue(req, 'webhook-timestamp'),
      'svix-signature':
        this.getHeaderValue(req, 'svix-signature') ?? this.getHeaderValue(req, 'webhook-signature'),
    };
  }

  private isEmailReceivedEvent(event: any): event is ResendEmailReceivedEvent {
    return (
      event &&
      typeof event === 'object' &&
      event.type === 'email.received' &&
      event.data &&
      typeof event.data === 'object'
    );
  }

  private getHeaderValue(req: Request, key: string) {
    const value = req.headers[key];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  private verifyWebhookSignature(secret: string, payload: string, headers: Record<string, any>) {
    const svixId = headers['svix-id'];
    const svixTimestamp = headers['svix-timestamp'];
    const svixSignature = headers['svix-signature'];

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new BadRequestException('Missing webhook signature headers');
    }

    const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
    const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    const keyBytes = Buffer.from(secretKey, 'base64');
    const expectedSignature = crypto
      .createHmac('sha256', keyBytes)
      .update(signedContent)
      .digest('base64');

    const signatures = String(svixSignature)
      .split(' ')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.split(','))
      .filter((parts) => parts.length === 2 && parts[0] === 'v1')
      .map((parts) => parts[1]);

    const isValid = signatures.some((signature) => this.safeCompare(signature, expectedSignature));
    if (!isValid) {
      throw new BadRequestException('Invalid webhook signature');
    }
  }

  private safeCompare(a: string, b: string) {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(aBuf, bBuf);
  }

  private extractSlugFromRecipients(recipients: string[], inboundDomain: string) {
    const domain = inboundDomain.trim().toLowerCase();
    if (!domain) return null;

    for (const recipient of recipients) {
      const email = this.parseEmailAddress(recipient);
      if (!email) continue;
      const [localPart, host] = email.split('@');
      if (!localPart || !host) continue;
      if (host.toLowerCase() === domain) {
        return localPart.toLowerCase();
      }
    }

    return null;
  }

  private normalizeRecipients(value?: string[] | string) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return [value];
  }

  private parseEmailAddress(value?: string) {
    if (!value) return null;
    const match = value.match(/<([^>]+)>/);
    const email = match ? match[1] : value;
    const trimmed = email.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private parseDate(value?: string) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private normalizeReceivedEmail(
    event: ResendEmailReceivedEvent,
    receivedEmail: any,
  ): NormalizedReceivedEmail {
    const payload =
      receivedEmail && typeof receivedEmail === 'object' && 'data' in receivedEmail
        ? receivedEmail.data
        : receivedEmail;
    const source = payload ?? event.data ?? {};

    const to = this.normalizeRecipients((source as any).to ?? event.data?.to);

    return {
      from: source.from ?? event.data?.from ?? 'unknown',
      to,
      subject: source.subject ?? event.data?.subject ?? null,
      messageId: source.message_id ?? source.messageId ?? event.data?.message_id ?? null,
      receivedAt: this.parseDate(source.received_at ?? source.created_at ?? event.data?.created_at),
      html: source.html ?? null,
      text: source.text ?? null,
      headers: source.headers ?? null,
      attachments: source.attachments ?? null,
    };
  }

  private async inferWorkflowInputsFromEmail(
    workflow: { id: string; title: string; inputs: string[] },
    email: NormalizedReceivedEmail,
  ): Promise<Record<string, string> | undefined> {
    if (!workflow.inputs?.length) {
      return undefined;
    }

    try {
      const inference = await this.workflowGenerationService.inferWorkflowInputsFromEmail({
        workflowTitle: workflow.title,
        workflowInputs: workflow.inputs,
        email: {
          from: email.from,
          to: email.to,
          subject: email.subject,
          text: email.text,
          html: email.html,
          headers: email.headers,
          attachments: email.attachments,
        },
      });

      const inferredCount = Object.keys(inference.inputValues).length;
      console.log(
        `[EMAIL] Inferred ${inferredCount}/${workflow.inputs.length} workflow input(s) for workflow ${workflow.id}`,
      );

      return inferredCount > 0 ? inference.inputValues : undefined;
    } catch (error) {
      console.error(
        `[EMAIL] Failed to infer workflow inputs for workflow ${workflow.id}:`,
        error,
      );
      return undefined;
    }
  }

}
