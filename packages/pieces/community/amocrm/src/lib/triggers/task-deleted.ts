import { createAmoWebhookTrigger } from '../common/webhooks';

export const taskDeleted = createAmoWebhookTrigger({
  name: 'task_deleted',
  displayName: 'Task Deleted',
  description: 'Triggers when a task is deleted.',
  aiMetadata: {
    description: 'Fires when a task is deleted in amoCRM, emitting the deletion payload (the task no longer exists to fetch).',
  },
  events: ['delete_task'],
  payloadPath: 'task.delete',
  entityType: 'tasks',
  fetchFullRecord: false,
  sampleData: {
    id: 51384302,
  },
});
