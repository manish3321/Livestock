import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationDispatchService } from './notification-dispatch.service';

/**
 * Loaded only with ScheduleModule (not on Vercel). Dispatch itself must stay
 * free of @nestjs/schedule so the serverless function can boot.
 */
@Injectable()
export class NotificationCronJob {
  constructor(private readonly dispatch: NotificationDispatchService) {}

  @Cron('*/5 * * * *', { timeZone: 'Asia/Kathmandu' })
  tick(): Promise<void> {
    return this.dispatch.tick();
  }
}
