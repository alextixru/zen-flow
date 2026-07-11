import { HttpMethod } from '@activepieces/pieces-common';
import { Property, createAction } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient, linkedEntityDropdown } from '../common';

export const runSalesbot = createAction({
  auth: amocrmAuth,
  name: 'run_salesbot',
  displayName: 'Run Salesbot',
  description: 'Starts a salesbot on a lead, contact or company.',
  aiMetadata: {
    description:
      'Runs an amoCRM salesbot for a given entity. Provide the bot id, the entity type and the entity id.',
    idempotent: false,
  },
  props: {
    bot_id: Property.Number({
      displayName: 'Salesbot ID',
      description: 'The id of the salesbot to run (from the Salesbot designer in amoCRM).',
      required: true,
    }),
    entity_type: Property.StaticDropdown({
      displayName: 'Entity Type',
      required: true,
      options: {
        options: [
          { label: 'Lead', value: 'leads' },
          { label: 'Contact', value: 'contacts' },
          { label: 'Company', value: 'companies' },
        ],
      },
    }),
    entity_id: linkedEntityDropdown({ required: true, displayName: 'Entity', typeProp: 'entity_type' }),
  },
  async run(context) {
    const auth = context.auth.props;
    const { bot_id, entity_type, entity_id } = context.propsValue;
    return await amoClient.makeRequest({
      auth,
      apiVersion: 'v2',
      method: HttpMethod.POST,
      path: '/salesbot/run',
      body: [{ bot_id, entity_id, entity_type: ENTITY_TYPE_CODE[entity_type] }],
    });
  },
});

const ENTITY_TYPE_CODE: Record<string, number> = {
  contacts: 1,
  leads: 2,
  companies: 3,
};
