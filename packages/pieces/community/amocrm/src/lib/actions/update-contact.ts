import { HttpMethod } from '@activepieces/pieces-common';
import { Property, createAction } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient, contactDropdown } from '../common';
import { contactPayload } from './contact-payload';

export const updateContact = createAction({
  auth: amocrmAuth,
  name: 'update_contact',
  displayName: 'Update Contact',
  description: 'Updates an existing contact in amoCRM. Only the provided fields are changed.',
  aiMetadata: {
    description:
      'Updates an existing amoCRM contact by id: name, first/last name, responsible user, tags and custom fields (phone/email are custom fields). Only the provided fields are changed.',
  },
  props: {
    contact_id: contactDropdown({ required: true }),
    name: Property.ShortText({ displayName: 'Contact Name', required: false }),
    ...contactPayload.optionalProps(),
  },
  async run(context) {
    const auth = context.auth.props;
    const body = await contactPayload.buildBody({ auth, values: context.propsValue });
    return amoClient.makeRequest({
      auth,
      method: HttpMethod.PATCH,
      path: `/contacts/${context.propsValue.contact_id}`,
      body,
    });
  },
});
