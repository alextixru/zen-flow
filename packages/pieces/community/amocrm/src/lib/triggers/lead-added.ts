import { createAmoWebhookTrigger } from '../common/webhooks';
import { leadSample } from './lead-sample';

export const leadAdded = createAmoWebhookTrigger({
  name: 'lead_added',
  displayName: 'Lead Added',
  description: 'Triggers when a new lead is created.',
  aiMetadata: {
    description: 'Fires when a new lead (deal) is created in amoCRM, emitting the full lead record.',
  },
  events: ['add_lead'],
  payloadPath: 'leads.add',
  entityType: 'leads',
  sampleData: leadSample,
});
