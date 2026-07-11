import { Property, isNil } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { customFieldsUtils } from '../common/custom-fields';
import { createAmoDoorbellTrigger } from '../common/events-doorbell';

const entityProperty = Property.StaticDropdown({
  displayName: 'Entity',
  description: 'Which entity type the custom field belongs to.',
  required: true,
  defaultValue: 'leads',
  options: {
    options: [
      { label: 'Lead', value: 'leads' },
      { label: 'Contact', value: 'contacts' },
      { label: 'Company', value: 'companies' },
    ],
  },
});

const fieldIdProperty = Property.Dropdown({
  auth: amocrmAuth,
  displayName: 'Custom Field',
  description: 'The custom field to watch for value changes.',
  required: true,
  refreshers: ['entity'],
  options: async ({ auth, entity }) => {
    if (isNil(auth)) {
      return { disabled: true, placeholder: 'Please connect your amoCRM account first.', options: [] };
    }
    if (entity !== 'leads' && entity !== 'contacts' && entity !== 'companies') {
      return { disabled: true, placeholder: 'Select an entity type first.', options: [] };
    }
    const fields = await customFieldsUtils.fetchCustomFieldsMeta({ auth: auth.props, entity });
    return {
      disabled: false,
      options: fields.map((field) => ({ label: field.name, value: field.id })),
    };
  },
});

// ponytail: one trigger watches exactly one field — amo forbids mixing a
// custom_field_{id}_value_changed type with any other type in the same /events
// request, so a per-field subscription must issue its own request.
export const customFieldChanged = createAmoDoorbellTrigger({
  name: 'custom_field_changed',
  displayName: 'Custom Field Changed',
  description:
    'Triggers when a specific custom field value changes on a lead, contact or company. Emits the change event with value_before/value_after. Fetch the full entity with the Find Entity action (filter by id). Warning: pairing this with an action that updates the same field will loop the flow.',
  aiMetadata: {
    description:
      'Fires when the selected custom field on a lead, contact or company changes value in amoCRM, emitting the amo event with old and new values.',
  },
  props: { entity: entityProperty, field_id: fieldIdProperty },
  webhookEventsFromProps: (propsValue) => [ENTITY_WEBHOOK_EVENT[String(propsValue['entity'])] ?? 'update_lead'],
  eventTypesFromProps: (propsValue) => [`custom_field_${String(propsValue['field_id'])}_value_changed`],
  sampleData: {
    id: '01kx888b4tnvrftjmfzga5tsw5',
    type: 'custom_field_829516_value_changed',
    entity_id: 36632537,
    entity_type: 'lead',
    created_by: 2898108,
    created_at: 1783762267,
    account_id: 32453394,
    value_after: [
      { custom_field_value: { field_id: 829516, field_type: 2, enum_id: null, text: '87', is_masked: false } },
    ],
    value_before: [
      { custom_field_value: { field_id: 829516, field_type: 2, enum_id: null, text: '42', is_masked: false } },
    ],
  },
});

const ENTITY_WEBHOOK_EVENT: Record<string, string> = {
  leads: 'update_lead',
  contacts: 'update_contact',
  companies: 'update_company',
};
