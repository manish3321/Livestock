import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ReminderEngineService } from '../breeding/reminder-engine.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';

/**
 * Hourly: closing/missed service windows, then escalate unacked CRITICAL
 * notifications (escalateAfterMinutes / escalateToRole).
 */
@Injectable()
export class HourlyJob {
  private readonly logger = new Logger(HourlyJob.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly reminders?: ReminderEngineService,
    @Optional() private readonly dispatch?: NotificationDispatchService,
  ) {}

  @Cron('0 * * * *', { timeZone: 'Asia/Kathmandu' })
  async tick(): Promise<void> {
    await this.run();
  }

  async run(now = new Date()): Promise<void> {
    const farms = await this.prisma.farm.findMany({ select: { id: true } });
    for (const farm of farms) {
      try {
        await this.reminders?.checkServiceWindows(farm.id, now);
      } catch (err) {
        this.logger.error(`Hourly windows failed for farm ${farm.id}`, err);
      }
    }
    await this.checkCriticalOverdue(now);
  }

  async checkCriticalOverdue(now = new Date()): Promise<void> {
    await this.dispatch?.escalate(now);
  }
}
