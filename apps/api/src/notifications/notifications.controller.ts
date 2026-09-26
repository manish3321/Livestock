import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  deviceRegisterSchema,
  notificationPreferenceSchema,
  type DeviceRegister,
  type NotificationPreferenceUpdate,
} from '@farm/contracts';
import { CurrentUser, Public, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NotificationDispatchService } from './notification-dispatch.service';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly notifications: NotificationDispatchService) {}

  @Post()
  @RequirePermissions('tasks:read')
  @ApiOperation({ summary: 'Register this phone for FCM / Expo push' })
  register(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(deviceRegisterSchema)) body: DeviceRegister,
  ) {
    return this.notifications.registerDevice(user, body);
  }
}

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationDispatchService) {}

  @Get('catalogue')
  @RequirePermissions('tasks:read')
  @ApiOperation({ summary: 'Every 9.3 trigger and its urgency' })
  catalogue() {
    return this.notifications.catalogue();
  }

  @Post('preferences')
  @RequirePermissions('tasks:read')
  @ApiOperation({ summary: 'Mute or unmute a reminder type' })
  preferences(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(notificationPreferenceSchema)) body: NotificationPreferenceUpdate,
  ) {
    return this.notifications.upsertPreference(user, body);
  }

  /**
   * External cron (Vercel Cron / GitHub Actions) when Nest ScheduleModule is off.
   * Header x-cron-secret or body.secret must match NOTIFICATION_CRON_SECRET.
   */
  @Public()
  @Post('dispatch')
  @ApiOperation({ summary: 'Run due-task push/SMS dispatch once (cron hook)' })
  async dispatch(
    @Body() body: { secret?: string },
    @Headers('x-cron-secret') headerSecret?: string,
  ) {
    const expected = process.env.NOTIFICATION_CRON_SECRET?.trim();
    const provided = (headerSecret ?? body?.secret ?? '').trim();
    if (!expected || provided !== expected) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Invalid cron secret' });
    }
    await this.notifications.tick();
    return { ok: true };
  }
}
