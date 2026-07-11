import { HttpMethod } from '@activepieces/pieces-common';
import { createAction } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient, catalogDropdown, catalogElementDropdown, leadDropdown } from '../common';

export const unlinkCatalogElement = createAction({
  auth: amocrmAuth,
  name: 'unlink_catalog_element',
  displayName: 'Unlink Catalog Element',
  description: 'Removes the link between a catalog element (e.g. a product) and a lead.',
  aiMetadata: {
    description:
      'Unlinks a catalog element (e.g. a product) from a lead in amoCRM. Provide the lead, catalog and element.',
    idempotent: true,
  },
  props: {
    lead_id: leadDropdown({ required: true }),
    catalog_id: catalogDropdown({ required: true }),
    element_id: catalogElementDropdown({ required: true }),
  },
  async run(context) {
    const auth = context.auth.props;
    const { lead_id, catalog_id, element_id } = context.propsValue;
    return await amoClient.makeRequest({
      auth,
      method: HttpMethod.POST,
      path: `/leads/${lead_id}/unlink`,
      body: [
        {
          to_entity_id: element_id,
          to_entity_type: 'catalog_elements',
          metadata: { catalog_id },
        },
      ],
    });
  },
});
