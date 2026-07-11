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

export const linkEntities = createAction({
  auth: amocrmAuth,
  name: 'link_entities',
  displayName: 'Link Entities',
  description: 'Links two entities together, e.g. attaches a contact or company to a lead.',
  aiMetadata: {
    description:
      'Links one amoCRM entity to another (e.g. attach a contact or company to a lead). Provide the source entity and the entity to link it to.',
    idempotent: true,
  },
  props: {
    entity_type: entityTypeProperty('Entity Type'),
    entity_id: linkedEntityDropdown({ required: true, displayName: 'Entity', typeProp: 'entity_type' }),
    to_entity_type: entityTypeProperty('Link To Entity Type'),
    to_entity_id: linkedEntityDropdown({ required: true, displayName: 'Link To Entity', typeProp: 'to_entity_type' }),
  },
  async run(context) {
    const auth = context.auth.props;
    const { entity_type, entity_id, to_entity_type, to_entity_id } = context.propsValue;
    return await amoClient.makeRequest({
      auth,
      method: HttpMethod.POST,
      path: `/${entity_type}/${entity_id}/link`,
      body: [{ to_entity_id, to_entity_type }],
    });
  },
});
