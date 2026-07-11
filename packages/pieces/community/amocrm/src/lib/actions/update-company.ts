import { HttpMethod } from '@activepieces/pieces-common';
import { Property, createAction } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient, companyDropdown } from '../common';
import { companyPayload } from './company-payload';

export const updateCompany = createAction({
  auth: amocrmAuth,
  name: 'update_company',
  displayName: 'Update Company',
  description: 'Updates an existing company in amoCRM. Only the provided fields are changed.',
  aiMetadata: {
    description:
      'Updates an existing amoCRM company by id: name, responsible user, tags and custom fields. Only the provided fields are changed.',
  },
  props: {
    company_id: companyDropdown({ required: true }),
    name: Property.ShortText({ displayName: 'Company Name', required: false }),
    ...companyPayload.optionalProps(),
  },
  async run(context) {
    const auth = context.auth.props;
    const body = await companyPayload.buildBody({ auth, values: context.propsValue });
    return amoClient.makeRequest({
      auth,
      method: HttpMethod.PATCH,
      path: `/companies/${context.propsValue.company_id}`,
      body,
    });
  },
});
