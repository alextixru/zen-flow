import { HttpMethod } from '@activepieces/pieces-common';
import { Property, createAction, spreadIfDefined } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient, taskEntityDropdown, taskTime, taskTypeDropdown, userDropdown } from '../common';

export const createTask = createAction({
  auth: amocrmAuth,
  name: 'create_task',
  displayName: 'Create Task',
  description: 'Creates a task in amoCRM, optionally linked to a lead, contact or company.',
  aiMetadata: {
    description:
      'Creates a task in amoCRM with text, type, deadline (relative offset or absolute date), responsible user and an optional linked lead/contact/company. Not idempotent — each call creates a separate task.',
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
      description: 'Deadline relative to now. Combined with the unit below. Ignored if a due date is set.',
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
    const values = context.propsValue;
    // ponytail: amo requires complete_till — with no deadline given, default to 1 day out
    const completeTill =
      taskTime.computeCompleteTill({
        offsetValue: values.due_offset_value,
        offsetUnit: values.due_offset_unit,
        dueAt: values.due_at,
        now: Math.floor(Date.now() / 1000),
      }) ?? Math.floor(Date.now() / 1000) + 86400;

    const body = {
      text: values.text,
      complete_till: completeTill,
      ...spreadIfDefined('task_type_id', values.task_type_id),
      ...spreadIfDefined('entity_type', values.entity_type),
      ...spreadIfDefined('entity_id', values.entity_id),
      ...spreadIfDefined('responsible_user_id', values.responsible_user_id),
    };
    const response = await amoClient.makeRequest({
      auth,
      method: HttpMethod.POST,
      path: '/tasks',
      body: [body],
    });
    return firstCreatedTask({ response }) ?? response;
  },
});

function firstCreatedTask({ response }: { response: unknown }): unknown {
  if (!isRecord(response) || !isRecord(response['_embedded'])) {
    return undefined;
  }
  const tasks = response['_embedded']['tasks'];
  return Array.isArray(tasks) ? tasks[0] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
