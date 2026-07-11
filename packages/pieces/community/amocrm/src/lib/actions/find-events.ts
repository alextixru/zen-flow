import { Property, createAction, isNil } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoEvents } from '../common';
import { userDropdown, linkedEntityDropdown } from '../common/props';

export const findEvents = createAction({
  auth: amocrmAuth,
  name: 'find_events',
  displayName: 'Find Events',
  description:
    'Fetches the change history (events) of amoCRM entities, optionally filtered by entity, event type, author and date range.',
  aiMetadata: {
    description:
      'Audit history: who changed what and when on a CRM entity. Returns amoCRM events (value_before/value_after) for leads, contacts, companies or tasks, optionally narrowed by a specific entity, event types, author and date range.',
    idempotent: true,
  },
  props: {
    entity_type: Property.StaticDropdown({
      displayName: 'Entity Type',
      required: false,
      options: {
        options: [
          { label: 'Any', value: 'any' },
          { label: 'Lead', value: 'leads' },
          { label: 'Contact', value: 'contacts' },
          { label: 'Company', value: 'companies' },
          { label: 'Task', value: 'tasks' },
        ],
      },
    }),
    entity_id: linkedEntityDropdown({ displayName: 'Entity', required: false, typeProp: 'entity_type' }),
    event_types: Property.MultiSelectDropdown({
      auth: amocrmAuth,
      displayName: 'Event Types',
      description: 'Restrict to specific event types. A per-field custom field type must be selected on its own.',
      required: false,
      refreshers: [],
      options: async ({ auth }) => {
        if (isNil(auth)) {
          return { disabled: true, placeholder: 'Please connect your amoCRM account first.', options: [] };
        }
        const types = await amoEvents.fetchEventTypes({ auth: auth.props });
        return {
          disabled: false,
          options: types.map((type) => ({ label: type.lang, value: type.key })),
        };
      },
    }),
    created_by: userDropdown({ required: false, displayName: 'Created By' }),
    from: Property.DateTime({
      displayName: 'From',
      description: 'Only events created at or after this moment.',
      required: false,
    }),
    to: Property.DateTime({
      displayName: 'To',
      description: 'Only events created at or before this moment.',
      required: false,
    }),
    limit: Property.Number({
      displayName: 'Limit',
      description: 'Maximum number of events to return (max 100).',
      required: false,
      defaultValue: 50,
    }),
  },
  async run(context) {
    const values = context.propsValue;
    const types = values.event_types ?? [];
    const perField = types.filter((type) => PER_FIELD_TYPE.test(type));
    if (perField.length > 0 && types.length > 1) {
      throw new Error(
        'A per-field custom field event type must be selected on its own — amoCRM rejects mixing it with other types.',
      );
    }

    const entity = values.entity_type && values.entity_type !== 'any' ? ENTITY_FILTER[values.entity_type] : undefined;

    return amoEvents.fetchEvents({
      auth: context.auth.props,
      types: types.length > 0 ? types : undefined,
      entity,
      entityIds: isNil(values.entity_id) ? undefined : [values.entity_id],
      createdBy: isNil(values.created_by) ? undefined : [values.created_by],
      from: toEpochSeconds(values.from),
      to: toEpochSeconds(values.to),
      limit: Math.min(values.limit ?? 50, 100),
      maxPages: 1,
    });
  },
});

function toEpochSeconds(value: string | undefined): number | undefined {
  if (isNil(value)) {
    return undefined;
  }
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
}

const PER_FIELD_TYPE = /^custom_field_\d+_value_changed$/;

const ENTITY_FILTER: Record<string, string> = {
  leads: 'lead',
  contacts: 'contact',
  companies: 'company',
  tasks: 'task',
};
