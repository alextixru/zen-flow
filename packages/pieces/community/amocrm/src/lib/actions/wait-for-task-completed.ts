import { HttpMethod } from '@activepieces/pieces-common';
import {
  ExecutionType,
  Property,
  createAction,
  isNil,
  spreadIfDefined,
  tryCatch,
} from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import {
  amoClient,
  taskEntityDropdown,
  taskTime,
  taskTypeDropdown,
  userDropdown,
} from '../common';

export const waitForTaskCompleted = createAction({
  auth: amocrmAuth,
  name: 'wait_for_task_completed',
  displayName: 'Wait for Task Completed',
  description:
    'Creates a task in amoCRM and pauses the flow until that task is marked completed.',
  aiMetadata: {
    description:
      'Creates a task in amoCRM (text, type, deadline, responsible, optional linked entity) and then pauses the flow, resuming once the task is completed in amoCRM. Not idempotent — each run creates a new task.',
    idempotent: false,
  },
  props: {
    text: Property.ShortText({ displayName: 'Task Text', required: true }),
    task_type_id: taskTypeDropdown({ required: false }),
    entity_type: Property.StaticDropdown({
      displayName: 'Linked Entity Type',
      required: false,
      options: {
        options: [
          { label: 'Lead', value: 'leads' },
          { label: 'Contact', value: 'contacts' },
          { label: 'Company', value: 'companies' },
        ],
      },
    }),
    entity_id: taskEntityDropdown({ required: false }),
    responsible_user_id: userDropdown({ required: false }),
    due_offset_value: Property.Number({
      displayName: 'Due In (amount)',
      description:
        'Deadline relative to now. Combined with the unit below. Ignored if a due date is set.',
      required: false,
    }),
    due_offset_unit: Property.StaticDropdown({
      displayName: 'Due In (unit)',
      required: false,
      defaultValue: 'hours',
      options: {
        options: [
          { label: 'Minutes', value: 'minutes' },
          { label: 'Hours', value: 'hours' },
          { label: 'Days', value: 'days' },
        ],
      },
    }),
    due_at: Property.DateTime({
      displayName: 'Due Date',
      description: 'Absolute deadline. Takes precedence over the relative offset.',
      required: false,
    }),
  },
  async run(context) {
    const auth = context.auth.props;
    const stateKey = `wait_for_task_completed:${context.run.id}:${context.step.name}`;

    if (context.executionType === ExecutionType.BEGIN) {
      const values = context.propsValue;
      // ponytail: amo requires complete_till — with no deadline given, default to 1 day out
      const completeTill =
        taskTime.computeCompleteTill({
          offsetValue: values.due_offset_value,
          offsetUnit: values.due_offset_unit,
          dueAt: values.due_at,
          now: Math.floor(Date.now() / 1000),
        }) ?? Math.floor(Date.now() / 1000) + 86400;

      const created = await amoClient.makeRequest({
        auth,
        method: HttpMethod.POST,
        path: '/tasks',
        body: [
          {
            text: values.text,
            complete_till: completeTill,
            ...spreadIfDefined('task_type_id', values.task_type_id),
            ...spreadIfDefined('entity_type', values.entity_type),
            ...spreadIfDefined('entity_id', values.entity_id),
            ...spreadIfDefined('responsible_user_id', values.responsible_user_id),
          },
        ],
      });
      const taskId = readTaskId({ response: created });
      if (isNil(taskId)) {
        throw new Error('amoCRM did not return a created task id');
      }

      const waitpoint = await context.run.createWaitpoint({ type: 'WEBHOOK' });
      const resumeUrl = waitpoint.buildResumeUrl({ queryParams: {} });
      // ponytail: amo webhooks are account-wide with no per-task filter — this subscription fires on
      // ANY task update in the account, so the flow resumes on the first update_task event and RESUME
      // re-reads THIS task to report its real completion state. Precise per-task resume would need
      // trigger/DP-side wiring (out of scope). Subscription is best-effort deleted on resume; a flow
      // that is never resumed leaves the webhook registered — clean it up in amo manually if needed.
      await amoClient.makeRequest({
        auth,
        method: HttpMethod.POST,
        path: '/webhooks',
        body: { destination: resumeUrl, settings: ['update_task'] },
      });

      await context.store.put(stateKey, { taskId, resumeUrl });
      context.run.waitForWaitpoint(waitpoint.id);
      return { taskId, completed: false };
    }

    const state = await context.store.get<WaitState>(stateKey);
    if (!isNil(state)) {
      await tryCatch(() =>
        amoClient.makeRequest({
          auth,
          method: HttpMethod.DELETE,
          path: '/webhooks',
          body: { destination: state.resumeUrl },
        }),
      );
      await context.store.delete(stateKey);
    }

    const taskId = state?.taskId;
    if (isNil(taskId)) {
      return { completed: false };
    }
    const task = await amoClient.makeRequest({
      auth,
      method: HttpMethod.GET,
      path: `/tasks/${taskId}`,
    });
    return { taskId, completed: isTaskCompleted({ task }), task };
  },
});

function readTaskId({ response }: { response: unknown }): number | undefined {
  if (!isRecord(response) || !isRecord(response['_embedded'])) {
    return undefined;
  }
  const tasks = response['_embedded']['tasks'];
  const first = Array.isArray(tasks) ? tasks[0] : undefined;
  if (isRecord(first) && typeof first['id'] === 'number') {
    return first['id'];
  }
  return undefined;
}

function isTaskCompleted({ task }: { task: unknown }): boolean {
  return isRecord(task) && task['is_completed'] === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type WaitState = {
  taskId: number;
  resumeUrl: string;
};
