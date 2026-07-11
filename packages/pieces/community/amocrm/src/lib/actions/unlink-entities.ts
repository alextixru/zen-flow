import { HttpMethod } from '@activepieces/pieces-common';
import { Property, createAction } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient, linkedEntityDropdown } from '../common';

const entityTypeProperty = (displayName: string) =>
  Property.StaticDropdown({
    displayName,
    required: true,
    options: {
      options: [
        { label: 'Lead', value: 'leads' },
        { label: 'Contact', value: 'contacts' },
        { label: 'Company', value: 'companies' },
      ],
    },
  });

export const unlinkEntities = createAction({
  auth: amocrmAuth,
  name: 'unlink_entities',
  displayName: 'Unlink Entities',
  description: 'Removes a link between two entities, e.g. detaches a contact or company from a lead.',
  aiMetadata: {
    description:
      'Removes the link between two amoCRM entities (e.g. detach a contact or company from a lead). Provide the source entity and the entity to unlink from it.',
    idempotent: true,
  },
  props: {
    entity_type: entityTypeProperty('Entity Type'),
    entity_id: linkedEntityDropdown({ required: true, displayName: 'Entity', typeProp: 'entity_type' }),
    to_entity_type: entityTypeProperty('Unlink From Entity Type'),
    to_entity_id: linkedEntityDropdown({ required: true, displayName: 'Unlink From Entity', typeProp: 'to_entity_type' }),
  },
  async run(context) {
    const auth = context.auth.props;
    const { entity_type, entity_id, to_entity_type, to_entity_id } = context.propsValue;
    return await amoClient.makeRequest({
      auth,
      method: HttpMethod.POST,
      path: `/${entity_type}/${entity_id}/unlink`,
      body: [{ to_entity_id, to_entity_type }],
    });
  },
});
