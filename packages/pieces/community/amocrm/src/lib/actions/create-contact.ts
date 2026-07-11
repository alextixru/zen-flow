import { HttpMethod } from '@activepieces/pieces-common';
import { Property, createAction } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient } from '../common';
import { contactPayload } from './contact-payload';

export const createContact = createAction({
  auth: amocrmAuth,
  name: 'create_contact',
  displayName: 'Create Contact',
  description: 'Creates a new contact in amoCRM.',
  aiMetadata: {
    description:
      'Creates a new contact in amoCRM with name, first/last name, responsible user, tags and custom fields (phone/email are custom fields). Not idempotent — each call creates a separate contact even with identical input.',
    idempotent: false,
  },
  props: {
    name: Property.ShortText({ displayName: 'Contact Name', required: true }),
    ...contactPayload.optionalProps(),
  },
  async run(context) {
    const auth = context.auth.props;
    const body = await contactPayload.buildBody({ auth, values: context.propsValue });
    const response = await amoClient.makeRequest({
      auth,
      method: HttpMethod.POST,
      path: '/contacts',
      body: [body],
    });
    return firstCreatedContact({ response }) ?? response;
  },
});

function firstCreatedContact({ response }: { response: unknown }): unknown {
  if (!isRecord(response) || !isRecord(response['_embedded'])) {
    return undefined;
  }
  const contacts = response['_embedded']['contacts'];
  return Array.isArray(contacts) ? contacts[0] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
