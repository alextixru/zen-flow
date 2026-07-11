import { HttpMethod } from '@activepieces/pieces-common';
import { Property, createAction } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient } from '../common';

export const findEntity = createAction({
  auth: amocrmAuth,
  name: 'find_entity',
  displayName: 'Find Entity',
  description: 'Searches leads, contacts or companies by full-text query and/or a single field filter.',
  aiMetadata: {
    description:
      'Searches amoCRM leads, contacts or companies by a full-text query and/or one top-level field filter (name, responsible_user_id, id). Returns the matching records as an array (empty if none). Custom-field filtering is not supported here — use the query for that.',
    idempotent: true,
  },
  props: {
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
    query: Property.ShortText({
      displayName: 'Search Query',
      description: 'Full-text search across the entity fields.',
      required: false,
    }),
    filter_field: Property.ShortText({
      displayName: 'Filter Field',
      description: 'A single top-level field to filter by, e.g. name, responsible_user_id or id. Custom fields are not supported — use the query.',
      required: false,
    }),
    filter_value: Property.ShortText({
      displayName: 'Filter Value',
      required: false,
    }),
    sort: Property.StaticDropdown({
      displayName: 'Sort Field',
      required: false,
      options: {
        options: [
          { label: 'Updated At', value: 'updated_at' },
          { label: 'Created At', value: 'created_at' },
        ],
      },
    }),
    order: Property.StaticDropdown({
      displayName: 'Sort Order',
      required: false,
      defaultValue: 'desc',
      options: {
        options: [
          { label: 'Descending', value: 'desc' },
          { label: 'Ascending', value: 'asc' },
        ],
      },
    }),
    limit: Property.Number({
      displayName: 'Limit',
      description: 'Maximum number of records to return (max 250).',
      required: false,
      defaultValue: 50,
    }),
  },
  async run(context) {
    const auth = context.auth.props;
    const values = context.propsValue;
    const entityType = values.entity_type;

    const params = new URLSearchParams();
    if (values.query) {
      params.set('query', values.query);
    }
    if (values.filter_field && values.filter_value !== undefined && values.filter_value !== '') {
      params.set(`filter[${values.filter_field}]`, values.filter_value);
    }
    if (values.sort) {
      params.set(`order[${values.sort}]`, values.order ?? 'desc');
    }
    params.set('limit', String(Math.min(values.limit ?? 50, 250)));
    // ponytail: `with` embeds only apply to leads; other entities reject unknown embeds
    if (entityType === 'leads') {
      params.set('with', 'contacts,companies');
    }

    const response = await amoClient.makeRequest({
      auth,
      method: HttpMethod.GET,
      path: `/${entityType}?${params.toString()}`,
    });

    return extractEntities({ response, entityType });
  },
});

// ponytail: one filter pair, no AND/OR — chain multiple finds + Router for compound conditions; upgrade to a condition builder if demanded
function extractEntities({
  response,
  entityType,
}: {
  response: unknown;
  entityType: string;
}): unknown[] {
  if (!isRecord(response) || !isRecord(response['_embedded'])) {
    return [];
  }
  const items = response['_embedded'][entityType];
  return Array.isArray(items) ? items : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
