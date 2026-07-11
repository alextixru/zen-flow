import { HttpMethod } from '@activepieces/pieces-common';
import { Property, createAction } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient, catalogDropdown } from '../common';

export const findCatalogElements = createAction({
  auth: amocrmAuth,
  name: 'find_catalog_elements',
  displayName: 'Find Catalog Elements',
  description: 'Searches elements (products, invoices, etc.) inside an amoCRM catalog (list).',
  aiMetadata: {
    description:
      'Searches elements of an amoCRM catalog (list) by an optional full-text query. Returns the matching elements as an array (empty if none).',
    idempotent: true,
  },
  props: {
    catalog_id: catalogDropdown({ required: true }),
    query: Property.ShortText({
      displayName: 'Search Query',
      description: 'Full-text search across the catalog elements.',
      required: false,
    }),
  },
  async run(context) {
    const auth = context.auth.props;
    const { catalog_id, query } = context.propsValue;

    const params = new URLSearchParams();
    if (query) {
      params.set('query', query);
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';

    const response = await amoClient.makeRequest({
      auth,
      method: HttpMethod.GET,
      path: `/catalogs/${catalog_id}/elements${suffix}`,
    });

    return extractElements(response);
  },
});

function extractElements(response: unknown): unknown[] {
  if (!isRecord(response) || !isRecord(response['_embedded'])) {
    return [];
  }
  const items = response['_embedded']['elements'];
  return Array.isArray(items) ? items : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
