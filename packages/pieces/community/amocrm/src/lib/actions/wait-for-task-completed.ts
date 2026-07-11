import { HttpMethod } from '@activepieces/pieces-common';
import {
  ExecutionType,
  Property,
  createAction,
  isNil,
  spreadIfDefined,
} from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import {
  amoClient,
  amoEvents,
  taskEntityDropdown,
  taskTime,
  taskTypeDropdown,
  userDropdown,
  waitCycle,
  waitCycleProps,
} from '../common';

export const waitForTaskCompleted = createAction({
  auth: amocrmAuth,
  name: 'wait_for_task_completed',
  displayName: 'Wait for Task Completed',
  description:
    'Creates a task in amoCRM and pauses the flow until that task is marked completed.',
  aiMetadata: {
    description:
      'Creates a task in amoCRM (text, type, deadline, responsible, optional linked entity) and then pauses the flow, re-checking every few minutes until the task is completed in amoCRM (or the timeout is reached). Not idempotent — each run creates a new task.',
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
    ...waitCycleProps,
  },
  async run(context) {
    const auth = context.auth.props;
    const stateKey = `wait_for_task_completed:${context.run.id}:${context.step.name}`;
    const values = context.propsValue;
    const intervalMinutes = values.check_interval_minutes ?? DEFAULT_CHECK_INTERVAL_MINUTES;

    if (context.executionType === ExecutionType.BEGIN) {
      const nowSec = waitCycle.nowSeconds();
      // ponytail: amo requires complete_till — with no deadline given, default to 1 day out
      const completeTill =
        taskTime.computeCompleteTill({
          offsetValue: values.due_offset_value,
          offsetUnit: values.due_offset_unit,
          dueAt: values.due_at,
          now: nowSec,
        }) ?? nowSec + 86400;

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

      const deadline = waitCycle.computeDeadline({
        nowSec,
        timeoutHours: values.timeout_hours ?? DEFAULT_TIMEOUT_HOURS,
      });
      await context.store.put<WaitState>(stateKey, { taskId, startedAt: nowSec, deadline });

      const waitpoint = await context.run.createWaitpoint({
        type: 'DELAY',
        resumeDateTime: waitCycle.nextResumeDateTime({ intervalMinutes }),
      });
      context.run.waitForWaitpoint(waitpoint.id);
      return { taskId, completed: false };
    }

    const state = await context.store.get<WaitState>(stateKey);
    if (isNil(state)) {
      return { completed: false };
    }

    const events = await amoEvents.fetchEvents({
      auth,
      from: state.startedAt,
      types: ['task_completed'],
      entity: 'task',
      entityIds: [state.taskId],
      maxPages: 1,
    });

    if (events.length > 0) {
      await context.store.delete(stateKey);
      const task = await amoClient.makeRequest({
        auth,
        method: HttpMethod.GET,
        path: `/tasks/${state.taskId}`,
      });
      return { taskId: state.taskId, completed: true, task };
    }

    if (waitCycle.isTimedOut({ nowSec: waitCycle.nowSeconds(), deadline: state.deadline })) {
      await context.store.delete(stateKey);
      return { taskId: state.taskId, completed: false, timed_out: true };
    }

    const waitpoint = await context.run.createWaitpoint({
      type: 'DELAY',
      resumeDateTime: waitCycle.nextResumeDateTime({ intervalMinutes }),
    });
    context.run.waitForWaitpoint(waitpoint.id);
    return { taskId: state.taskId, completed: false };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const DEFAULT_CHECK_INTERVAL_MINUTES = 5;
const DEFAULT_TIMEOUT_HOURS = 24;

type WaitState = {
  taskId: number;
  startedAt: number;
  deadline: number;
};
