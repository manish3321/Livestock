import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  taskDismissSchema,
  taskListQuerySchema,
  taskReassignSchema,
  taskSnoozeSchema,
} from '@farm/contracts';
import type {
  PageResult,
  TaskDismiss,
  TaskDto,
  TaskListQuery,
  TaskReassign,
  TaskSnooze,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @RequirePermissions('tasks:read')
  @ApiOperation({ summary: 'Task inbox — grouped by urgency, not by module' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(taskListQuerySchema)) query: TaskListQuery,
  ): Promise<PageResult<TaskDto>> {
    return this.tasks.list(user, query);
  }

  @Patch(':id/complete')
  @RequirePermissions('tasks:read')
  @ApiOperation({ summary: 'Complete a task (opens the real form on the client)' })
  complete(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<TaskDto> {
    return this.tasks.complete(user, id, requestId);
  }

  @Patch(':id/snooze')
  @RequirePermissions('tasks:read')
  @ApiOperation({ summary: 'Delay +1h / +1d / +1w. Three times, then locked.' })
  snooze(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(taskSnoozeSchema)) body: TaskSnooze,
    @Headers('x-request-id') requestId?: string,
  ): Promise<TaskDto> {
    return this.tasks.snooze(user, id, body, requestId);
  }

  @Patch(':id/dismiss')
  @RequirePermissions('tasks:read')
  @ApiOperation({ summary: 'Dismiss with a required reason from the picklist' })
  dismiss(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(taskDismissSchema)) body: TaskDismiss,
    @Headers('x-request-id') requestId?: string,
  ): Promise<TaskDto> {
    return this.tasks.dismiss(user, id, body, requestId);
  }

  @Patch(':id/reassign')
  @RequirePermissions('tasks:manage')
  @ApiOperation({ summary: 'Hand a task to another person' })
  reassign(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(taskReassignSchema)) body: TaskReassign,
    @Headers('x-request-id') requestId?: string,
  ): Promise<TaskDto> {
    return this.tasks.reassign(user, id, body, requestId);
  }
}
