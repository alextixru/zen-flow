import { HttpMethod } from '@activepieces/pieces-common';
import { Property, createAction } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient, catalogDropdown, catalogElementDropdown, leadDropdown } from '../common';

export const linkCatalogElement = createAction({
  auth: amocrmAuth,
  name: 'link_catalog_element',
  displayName: 'Link Catalog Element',
  description: 'Links a catalog element (e.g. a product) to a lead with an optional quantity.',
  aiMetadata: {
    description:
      'Links a catalog element (e.g. a product) to a lead in amoCRM, optionally with a quantity. Provide the lead, catalog, element and quantity.',
    idempotent: true,
  },
  props: {
    lead_id: leadDropdown({ required: true }),
    catalog_id: catalogDropdown({ required: true }),
    element_id: catalogElementDropdown({ required: true }),
    quantity: Property.Number({
      displayName: 'Quantity',
      required: false,
    }),
  },
  async run(context) {
    const auth = context.auth.props;
    const { lead_id, catalog_id, element_id, quantity } = context.propsValue;
    return await amoClient.makeRequest({
      auth,
      method: HttpMethod.POST,
      path: `/leads/${lead_id}/link`,
      body: [
        {
          to_entity_id: element_id,
          to_entity_type: 'catalog_elements',
          metadata: { catalog_id, ...(quantity === undefined ? {} : { quantity }) },
        },
      ],
    });
  },
});
