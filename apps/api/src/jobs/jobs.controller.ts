import { timingSafeEqual } from 'node:crypto';
import { All, Controller, Headers, HttpCode, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { HourlyJob } from './hourly.job';
import { NightlyJob } from './nightly.job';

function sameSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Cron hooks for hosts without Nest ScheduleModule (Vercel). Vercel Cron sends GET with
 * `Authorization: Bearer $CRON_SECRET`; GitHub Actions sends `x-cron-secret`.
 * Either CRON_SECRET or NOTIFICATION_CRON_SECRET is accepted.
 */
@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly nightly: NightlyJob,
    private readonly hourly: HourlyJob,
  ) {}

  @Public()
  @All('nightly')
  @HttpCode(200)
  @ApiOperation({ summary: 'Run the nightly generators and stale-task cleanup once (cron hook)' })
  async runNightly(
    @Headers('authorization') authorization?: string,
    @Headers('x-cron-secret') headerSecret?: string,
  ) {
    this.assertCron(authorization, headerSecret);
    const started = Date.now();
    await this.nightly.run();
    return { ok: true, ms: Date.now() - started };
  }

  @Public()
  @All('hourly')
  @HttpCode(200)
  @ApiOperation({ summary: 'Run the hourly service-window and escalation checks once (cron hook)' })
  async runHourly(
    @Headers('authorization') authorization?: string,
    @Headers('x-cron-secret') headerSecret?: string,
  ) {
    this.assertCron(authorization, headerSecret);
    const started = Date.now();
    await this.hourly.run();
    return { ok: true, ms: Date.now() - started };
  }

  private assertCron(authorization?: string, headerSecret?: string): void {
    const expected = [process.env.CRON_SECRET, process.env.NOTIFICATION_CRON_SECRET]
      .map((s) => s?.trim() ?? '')
      .filter(Boolean);
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const provided = [bearer, headerSecret?.trim() ?? ''].filter(Boolean);
    if (!expected.some((e) => provided.some((p) => sameSecret(p, e)))) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Invalid cron secret' });
    }
  }
}
