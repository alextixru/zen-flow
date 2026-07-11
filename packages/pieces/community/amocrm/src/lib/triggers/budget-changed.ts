import { createAmoDoorbellTrigger } from '../common/events-doorbell';

export const budgetChanged = createAmoDoorbellTrigger({
  name: 'budget_changed',
  displayName: 'Budget Changed',
  description:
    'Triggers when a lead budget (sale) changes. Emits the amo event with value_before/value_after holding the old and new amount.',
  aiMetadata: {
    description:
      'Fires when the budget (sale) of a lead changes in amoCRM, emitting the amo event with the old and new amount.',
  },
  webhookEvents: ['update_lead'],
  eventTypes: ['sale_field_changed'],
  sampleData: {
    id: '01kx88gvk5qgm0gyaz0vbz4n6w',
    type: 'sale_field_changed',
    entity_id: 36632537,
    entity_type: 'lead',
    created_by: 0,
    created_at: 1783762546,
    account_id: 32453394,
    value_after: [{ sale_field_value: { sale: 77500, sale_with_minor_units: 77500.0 } }],
    value_before: [{ sale_field_value: { sale: 76000, sale_with_minor_units: 76000.0 } }],
  },
});
