import { HttpMethod } from '@activepieces/pieces-common';
import { Property, createAction } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient } from '../common';
import { leadPayload } from './lead-payload';

export const createLead = createAction({
  auth: amocrmAuth,
  name: 'create_lead',
  displayName: 'Create Lead',
  description: 'Creates a new lead in amoCRM.',
  aiMetadata: {
    description:
      'Creates a new lead (deal) in amoCRM with name, price, pipeline/status, responsible user, tags, linked contact/company and custom fields. Not idempotent — each call creates a separate lead even with identical input.',
    idempotent: false,
  },
  props: {
    name: Property.ShortText({ displayName: 'Lead Name', required: true }),
    ...leadPayload.optionalProps(),
  },
  async run(context) {
    const auth = context.auth.props;
    const body = await leadPayload.buildBody({ auth, values: context.propsValue });
    const response = await amoClient.makeRequest({
      auth,
      method: HttpMethod.POST,
      path: '/leads',
      body: [body],
    });
    return firstCreatedLead({ response }) ?? response;
  },
});

function firstCreatedLead({ response }: { response: unknown }): unknown {
  if (!isRecord(response) || !isRecord(response['_embedded'])) {
    return undefined;
  }
  const leads = response['_embedded']['leads'];
  return Array.isArray(leads) ? leads[0] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
