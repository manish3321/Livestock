import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  deviceRegisterSchema,
  notificationPreferenceSchema,
  type DeviceRegister,
  type NotificationPreferenceUpdate,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NotificationDispatchService } from './notification-dispatch.service';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly notifications: NotificationDispatchService) {}

  @Post()
  @RequirePermissions('tasks:read')
  @ApiOperation({ summary: 'Register this phone for FCM push' })
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
}
