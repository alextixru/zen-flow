import { createAmoWebhookTrigger } from '../common/webhooks';
import { taskSample } from './task-sample';

export const taskAdded = createAmoWebhookTrigger({
  name: 'task_added',
  displayName: 'Task Added',
  description: 'Triggers when a new task is created.',
  aiMetadata: {
    description: 'Fires when a new task is created in amoCRM, emitting the full task record.',
  },
  events: ['add_task'],
  payloadPath: 'task.add',
  entityType: 'tasks',
  sampleData: taskSample,
});
