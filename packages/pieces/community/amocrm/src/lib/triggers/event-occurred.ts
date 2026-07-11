import { Property, isNil } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { AmoEvent, amoEvents } from '../common/events';
import { createAmoEventsPollingTrigger } from '../common/events-polling';

export const eventOccurred = createAmoEventsPollingTrigger({
  name: 'event_occurred',
  displayName: 'Event Occurred',
  description:
    'Advanced trigger for any amoCRM events feed entry (entity linked/unlinked, merged, invoice paid, chat opened/closed, and more). Polls the feed once a minute, so expect up to a minute of delay. For fields, statuses or tags use the dedicated triggers.',
  aiMetadata: {
    description:
      'Fires on any selected amoCRM feed event. Catch-all for events without a dedicated trigger; for custom field / status / tag changes prefer the specialized triggers.',
  },
  typesFromProps: (propsValue) => selectedTypes(propsValue['event_types']),
  filterEvent: (event, propsValue) => matchesEntity(event, propsValue['entity']),
  props: {
    event_types: Property.MultiSelectDropdown({
      auth: amocrmAuth,
      displayName: 'Event Types',
      description: 'One or more feed event types to listen for.',
      required: true,
      refreshers: [],
      options: async ({ auth }) => {
        if (isNil(auth)) {
          return { disabled: true, placeholder: 'Please connect your amoCRM account first.', options: [] };
        }
        const types = await amoEvents.fetchEventTypes({ auth: auth.props });
        // ponytail: drop per-field custom-field types (type 24) — they are covered
        // by the dedicated custom_field_changed trigger and would bloat this list.
        return {
          disabled: false,
          options: types
            .filter((type) => type.type !== PER_FIELD_TYPE_CODE)
            .map((type) => ({ label: type.lang, value: type.key })),
        };
      },
    }),
    entity: Property.StaticDropdown({
      displayName: 'Entity',
      description: 'Restrict to events on a single entity type.',
      required: false,
      options: {
        options: [
          { label: 'Any', value: 'any' },
          { label: 'Lead', value: 'lead' },
          { label: 'Contact', value: 'contact' },
          { label: 'Company', value: 'company' },
          { label: 'Task', value: 'task' },
        ],
      },
    }),
  },
  sampleData: {
    id: '01kx7sa7jyfhdsm4s7wsmm1t51',
    type: 'lead_status_changed',
    entity_id: 36632537,
    entity_type: 'lead',
    created_by: 0,
    created_at: 1783761803,
    account_id: 32453394,
    value_before: [{ lead_status: { id: 142, pipeline_id: 9497054 } }],
    value_after: [{ lead_status: { id: 143, pipeline_id: 9497054 } }],
  },
});

function selectedTypes(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function matchesEntity(event: AmoEvent, entity: unknown): boolean {
  if (entity === undefined || entity === null || entity === '' || entity === 'any') {
    return true;
  }
  return String(event['entity_type']) === String(entity);
}

const PER_FIELD_TYPE_CODE = 24;
