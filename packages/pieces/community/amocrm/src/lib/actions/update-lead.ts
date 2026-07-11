import { HttpMethod } from '@activepieces/pieces-common';
import { Property, createAction } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient, leadDropdown } from '../common';
import { leadPayload } from './lead-payload';

export const updateLead = createAction({
  auth: amocrmAuth,
  name: 'update_lead',
  displayName: 'Update Lead',
  description: 'Updates an existing lead in amoCRM. Only the provided fields are changed.',
  aiMetadata: {
    description:
      'Updates an existing amoCRM lead by id: name, price, pipeline/status, responsible user, tags, linked contact/company and custom fields. Only the provided fields are changed.',
  },
  props: {
    lead_id: leadDropdown({ required: true }),
    name: Property.ShortText({ displayName: 'Lead Name', required: false }),
    ...leadPayload.optionalProps(),
  },
  async run(context) {
    const auth = context.auth.props;
    const body = await leadPayload.buildBody({ auth, values: context.propsValue });
    return amoClient.makeRequest({
      auth,
      method: HttpMethod.PATCH,
      path: `/leads/${context.propsValue.lead_id}`,
      body,
    });
  },
});
