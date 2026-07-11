import { HttpMethod } from '@activepieces/pieces-common';
import { Property, createAction, spreadIfDefined } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient, taskTime, userDropdown } from '../common';

export const updateTask = createAction({
  auth: amocrmAuth,
  name: 'update_task',
  displayName: 'Update Task',
  description: 'Updates an existing amoCRM task. Only the provided fields are changed.',
  aiMetadata: {
    description:
      'Updates an existing amoCRM task by id: text, deadline (relative offset or absolute date) and responsible user. Only the provided fields are changed.',
  },
  props: {
    task_id: Property.Number({ displayName: 'Task ID', required: true }),
    text: Property.ShortText({ displayName: 'Task Text', required: false }),
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
    const completeTill = taskTime.computeCompleteTill({
      offsetValue: values.due_offset_value,
      offsetUnit: values.due_offset_unit,
      dueAt: values.due_at,
      now: Math.floor(Date.now() / 1000),
    });
    const body = {
      ...spreadIfDefined('text', values.text),
      ...spreadIfDefined('complete_till', completeTill),
      ...spreadIfDefined('responsible_user_id', values.responsible_user_id),
    };
    return amoClient.makeRequest({
      auth,
      method: HttpMethod.PATCH,
      path: `/tasks/${values.task_id}`,
      body,
    });
  },
});
