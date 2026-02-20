import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { WorkflowSchedule } from '@automated/prisma';
import type {
  UpsertWorkflowScheduleRequest,
  WorkflowExecutionCommandResponse,
  WorkflowScheduleResponse,
} from '@automated/api-dtos';
import { PrismaService } from '../prisma.service';
import { WorkflowExecutionService } from './workflow-execution.service';

type NormalizedScheduleInput = {
  enabled: boolean;
  type: 'daily' | 'interval';
  timezone: string;
  dailyTime: string | null;
  dailyDays: number[];
  intervalMinutes: number | null;
};

@Injectable()
export class WorkflowScheduleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowScheduleService.name);
  private pollHandle: NodeJS.Timeout | null = null;
  private tickInProgress = false;
  private readonly POLL_INTERVAL_MS = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowExecutionService: WorkflowExecutionService,
  ) {}

  onModuleInit() {
    this.pollHandle = setInterval(() => {
      void this.processDueSchedules();
    }, this.POLL_INTERVAL_MS);

    void this.ensureNextRunAtForEnabledSchedules();
  }

  onModuleDestroy() {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  async getSchedule(workflowId: string, email: string): Promise<WorkflowScheduleResponse | null> {
    const schedule = await this.prisma.workflowSchedule.findFirst({
      where: {
        workflowId,
        workflow: { user: { email } },
      },
    });

    if (!schedule) {
      return null;
    }

    return this.toResponse(schedule);
  }

  async upsertSchedule(
    workflowId: string,
    email: string,
    input: UpsertWorkflowScheduleRequest,
  ): Promise<WorkflowScheduleResponse> {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, user: { email } },
      select: { id: true },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const normalized = this.normalizeInput(input);
    const nextRunAt = normalized.enabled ? this.calculateNextRunAt(normalized, new Date()) : null;

    const schedule = await this.prisma.workflowSchedule.upsert({
      where: { workflowId },
      create: {
        workflowId,
        enabled: normalized.enabled,
        type: normalized.type,
        timezone: normalized.timezone,
        dailyTime: normalized.dailyTime,
        dailyDays: normalized.dailyDays,
        intervalMinutes: normalized.intervalMinutes,
        nextRunAt,
      },
      update: {
        enabled: normalized.enabled,
        type: normalized.type,
        timezone: normalized.timezone,
        dailyTime: normalized.dailyTime,
        dailyDays: normalized.dailyDays,
        intervalMinutes: normalized.intervalMinutes,
        nextRunAt,
      },
    });

    return this.toResponse(schedule);
  }

  async deleteSchedule(
    workflowId: string,
    email: string,
  ): Promise<WorkflowExecutionCommandResponse> {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, user: { email } },
      select: { id: true },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const removed = await this.prisma.workflowSchedule.deleteMany({
      where: { workflowId },
    });
    if (removed.count === 0) {
      throw new NotFoundException('Schedule not found');
    }

    return { success: true, message: 'Schedule removed' };
  }

  private async ensureNextRunAtForEnabledSchedules() {
    try {
      const schedules = await this.prisma.workflowSchedule.findMany({
        where: {
          enabled: true,
          nextRunAt: null,
        },
      });

      for (const schedule of schedules) {
        const normalized = this.normalizePersistedSchedule(schedule);
        const nextRunAt = this.calculateNextRunAt(normalized, new Date());
        await this.prisma.workflowSchedule.update({
          where: { id: schedule.id },
          data: { nextRunAt },
        });
      }
    } catch (error) {
      this.logger.error('Failed to initialize workflow schedules', error);
    }
  }

  private async processDueSchedules() {
    if (this.tickInProgress) {
      return;
    }

    this.tickInProgress = true;
    try {
      const now = new Date();
      const dueSchedules = await this.prisma.workflowSchedule.findMany({
        where: {
          enabled: true,
          nextRunAt: { lte: now },
        },
        include: {
          workflow: {
            select: {
              user: { select: { email: true } },
            },
          },
        },
        orderBy: {
          nextRunAt: 'asc',
        },
        take: 100,
      });

      for (const schedule of dueSchedules) {
        await this.runScheduledWorkflow(schedule, now);
      }
    } catch (error) {
      this.logger.error('Failed to process workflow schedules', error);
    } finally {
      this.tickInProgress = false;
    }
  }

  private async runScheduledWorkflow(
    schedule: WorkflowSchedule & { workflow: { user: { email: string } | null } },
    now: Date,
  ) {
    const normalized = this.normalizePersistedSchedule(schedule);
    const nextRunAt = this.calculateNextRunAt(normalized, new Date(now.getTime() + 1_000));

    const updated = await this.prisma.workflowSchedule.updateMany({
      where: {
        id: schedule.id,
        enabled: true,
        nextRunAt: schedule.nextRunAt,
      },
      data: {
        lastRunAt: now,
        nextRunAt,
      },
    });

    if (updated.count === 0) {
      return;
    }

    const result = await this.workflowExecutionService.startWorkflow(
      schedule.workflowId,
      schedule.workflow.user?.email,
    );

    if (!result.success) {
      this.logger.warn(
        `Scheduled run skipped for workflow ${schedule.workflowId}: ${result.message}`,
      );
    }
  }

  private normalizeInput(input: UpsertWorkflowScheduleRequest): NormalizedScheduleInput {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Invalid schedule payload');
    }

    if (!input.timezone || !this.isValidTimeZone(input.timezone)) {
      throw new BadRequestException('Invalid timezone');
    }

    const enabled = input.enabled ?? true;
    if (input.type !== 'daily' && input.type !== 'interval') {
      throw new BadRequestException('Invalid schedule type');
    }

    if (input.type === 'daily') {
      const time = input.daily?.time;
      if (!time || !this.isValidTime(time)) {
        throw new BadRequestException('Daily schedule requires a valid time (HH:mm)');
      }

      const days = this.normalizeDays(input.daily?.days ?? []);
      if (days.length === 0) {
        throw new BadRequestException('Daily schedule requires at least one day');
      }

      return {
        enabled,
        type: 'daily',
        timezone: input.timezone,
        dailyTime: time,
        dailyDays: days,
        intervalMinutes: null,
      };
    }

    const everyMinutes = input.interval?.everyMinutes;
    if (!Number.isInteger(everyMinutes) || !everyMinutes || everyMinutes < 5) {
      throw new BadRequestException('Interval schedule requires everyMinutes >= 5');
    }

    return {
      enabled,
      type: 'interval',
      timezone: input.timezone,
      dailyTime: null,
      dailyDays: [],
      intervalMinutes: everyMinutes,
    };
  }

  private normalizePersistedSchedule(schedule: WorkflowSchedule): NormalizedScheduleInput {
    return {
      enabled: schedule.enabled,
      type: schedule.type,
      timezone: schedule.timezone,
      dailyTime: schedule.dailyTime ?? null,
      dailyDays: this.normalizeDays(schedule.dailyDays),
      intervalMinutes: schedule.intervalMinutes ?? null,
    };
  }

  private calculateNextRunAt(schedule: NormalizedScheduleInput, fromDate: Date): Date | null {
    if (!schedule.enabled) {
      return null;
    }

    if (schedule.type === 'interval') {
      if (!schedule.intervalMinutes) {
        return null;
      }
      return new Date(fromDate.getTime() + schedule.intervalMinutes * 60_000);
    }

    if (!schedule.dailyTime || schedule.dailyDays.length === 0) {
      return null;
    }

    const [hour, minute] = schedule.dailyTime.split(':').map((v) => parseInt(v, 10));
    const zonedNow = this.getZonedDateParts(fromDate, schedule.timezone);

    for (let offset = 0; offset < 14; offset++) {
      const dateAtOffset = new Date(
        Date.UTC(zonedNow.year, zonedNow.month - 1, zonedNow.day + offset),
      );
      const weekday = dateAtOffset.getUTCDay();
      if (!schedule.dailyDays.includes(weekday)) {
        continue;
      }

      const candidate = this.zonedTimeToUtc(
        dateAtOffset.getUTCFullYear(),
        dateAtOffset.getUTCMonth() + 1,
        dateAtOffset.getUTCDate(),
        hour,
        minute,
        schedule.timezone,
      );

      if (candidate.getTime() > fromDate.getTime()) {
        return candidate;
      }
    }

    return null;
  }

  private getZonedDateParts(date: Date, timezone: string) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
      hour: Number(values.hour),
      minute: Number(values.minute),
    };
  }

  private zonedTimeToUtc(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    timezone: string,
  ) {
    const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    let candidate = new Date(targetAsUtc);

    for (let i = 0; i < 5; i++) {
      const zoned = this.getZonedDateParts(candidate, timezone);
      const zonedAsUtc = Date.UTC(
        zoned.year,
        zoned.month - 1,
        zoned.day,
        zoned.hour,
        zoned.minute,
        0,
        0,
      );
      const diff = targetAsUtc - zonedAsUtc;
      if (diff === 0) {
        return candidate;
      }
      candidate = new Date(candidate.getTime() + diff);
    }

    return candidate;
  }

  private normalizeDays(days: number[]): number[] {
    if (!Array.isArray(days)) {
      return [];
    }
    return Array.from(
      new Set(
        days
          .map((day) => Number(day))
          .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
      ),
    ).sort((a, b) => a - b);
  }

  private isValidTime(value: string) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
  }

  private isValidTimeZone(timezone: string) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  private toResponse(schedule: WorkflowSchedule): WorkflowScheduleResponse {
    return {
      id: schedule.id,
      workflowId: schedule.workflowId,
      enabled: schedule.enabled,
      type: schedule.type,
      timezone: schedule.timezone,
      dailyTime: schedule.dailyTime ?? null,
      dailyDays: schedule.dailyDays,
      intervalMinutes: schedule.intervalMinutes ?? null,
      nextRunAt: schedule.nextRunAt ?? null,
      lastRunAt: schedule.lastRunAt ?? null,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    };
  }
}
