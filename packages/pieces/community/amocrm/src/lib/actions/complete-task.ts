import { HttpMethod } from '@activepieces/pieces-common';
import { Property, createAction } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient } from '../common';

export const completeTask = createAction({
  auth: amocrmAuth,
  name: 'complete_task',
  displayName: 'Complete Task',
  description: 'Marks an amoCRM task as completed, with an optional result text.',
  aiMetadata: {
    description:
      'Marks an amoCRM task as completed by id and records an optional result text describing the outcome.',
  },
  props: {
    task_id: Property.Number({ displayName: 'Task ID', required: true }),
    result_text: Property.ShortText({ displayName: 'Result Text', required: false }),
  },
  async run(context) {
    const auth = context.auth.props;
    const { task_id, result_text } = context.propsValue;
    return amoClient.makeRequest({
      auth,
      method: HttpMethod.PATCH,
      path: `/tasks/${task_id}`,
      body: {
        is_completed: true,
        result: { text: result_text ?? '' },
      },
    });
  },
});
