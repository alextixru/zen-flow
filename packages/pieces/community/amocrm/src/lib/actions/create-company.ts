import { HttpMethod } from '@activepieces/pieces-common';
import { Property, createAction } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient } from '../common';
import { companyPayload } from './company-payload';

export const createCompany = createAction({
  auth: amocrmAuth,
  name: 'create_company',
  displayName: 'Create Company',
  description: 'Creates a new company in amoCRM.',
  aiMetadata: {
    description:
      'Creates a new company in amoCRM with name, responsible user, tags and custom fields. Not idempotent — each call creates a separate company even with identical input.',
    idempotent: false,
  },
  props: {
    name: Property.ShortText({ displayName: 'Company Name', required: true }),
    ...companyPayload.optionalProps(),
  },
  async run(context) {
    const auth = context.auth.props;
    const body = await companyPayload.buildBody({ auth, values: context.propsValue });
    const response = await amoClient.makeRequest({
      auth,
      method: HttpMethod.POST,
      path: '/companies',
      body: [body],
    });
    return firstCreatedCompany({ response }) ?? response;
  },
});

function firstCreatedCompany({ response }: { response: unknown }): unknown {
  if (!isRecord(response) || !isRecord(response['_embedded'])) {
    return undefined;
  }
  const companies = response['_embedded']['companies'];
  return Array.isArray(companies) ? companies[0] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
