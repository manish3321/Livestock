import type { PageResult, TaskDismiss, TaskDto, TaskSnooze } from '@farm/contracts';
import { api } from './client';

export function listTasks(): Promise<PageResult<TaskDto>> {
  return api('/v1/tasks?pageSize=80');
}

/** Open reminders due in the next 30 days — enough to schedule locally offline. */
export function listUpcomingTasks(): Promise<PageResult<TaskDto>> {
  const dueBefore = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  return api(`/v1/tasks?pageSize=200&dueBefore=${encodeURIComponent(dueBefore)}`);
}

export function completeTask(id: string, body: { byScan?: boolean } = {}): Promise<TaskDto> {
  return api(`/v1/tasks/${id}/complete`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function snoozeTask(id: string, body: TaskSnooze): Promise<TaskDto> {
  return api(`/v1/tasks/${id}/snooze`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function dismissTask(id: string, body: TaskDismiss): Promise<TaskDto> {
  return api(`/v1/tasks/${id}/dismiss`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function muteTaskType(taskType: TaskDto['type']): Promise<unknown> {
  return api('/v1/notifications/preferences', {
    method: 'POST',
    body: JSON.stringify({ taskType, muted: true }),
  });
}
