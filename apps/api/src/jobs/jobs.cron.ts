import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HourlyJob } from './hourly.job';
import { NightlyJob } from './nightly.job';

/**
 * Loaded only with ScheduleModule (not on Vercel). The jobs themselves must stay
 * free of @nestjs/schedule so the serverless function can boot and run them
 * from `/v1/jobs/*`.
 */
@Injectable()
export class ScheduledJobs {
  constructor(
    private readonly nightly: NightlyJob,
    private readonly hourly: HourlyJob,
  ) {}

  @Cron('0 1 * * *', { timeZone: 'Asia/Kathmandu' })
  nightlyTick(): Promise<void> {
    return this.nightly.run();
  }

  @Cron('0 * * * *', { timeZone: 'Asia/Kathmandu' })
  hourlyTick(): Promise<void> {
    return this.hourly.run();
  }
}
