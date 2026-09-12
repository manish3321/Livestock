import type { PageResult, TaskDismiss, TaskDto, TaskSnooze } from '@farm/contracts';
import { api } from './client';

export function listTasks(): Promise<PageResult<TaskDto>> {
  return api('/v1/tasks?pageSize=80');
}

export function completeTask(id: string): Promise<TaskDto> {
  return api(`/v1/tasks/${id}/complete`, { method: 'PATCH' });
}

export function snoozeTask(id: string, body: TaskSnooze): Promise<TaskDto> {
  return api(`/v1/tasks/${id}/snooze`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function dismissTask(id: string, body: TaskDismiss): Promise<TaskDto> {
  return api(`/v1/tasks/${id}/dismiss`, { method: 'PATCH', body: JSON.stringify(body) });
}
