import { createAmoWebhookTrigger } from '../common/webhooks';
import { taskSample } from './task-sample';

export const taskUpdatedOrCompleted = createAmoWebhookTrigger({
  name: 'task_updated_or_completed',
  displayName: 'Task Updated or Completed',
  description: 'Triggers when a task is updated or marked as completed (check the is_completed flag).',
  aiMetadata: {
    description: 'Fires when a task is updated or completed in amoCRM, emitting the full task record with the is_completed flag.',
  },
  events: ['update_task'],
  payloadPath: 'task.update',
  entityType: 'tasks',
  sampleData: taskSample,
});
