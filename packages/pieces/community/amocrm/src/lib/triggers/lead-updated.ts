import { createAmoWebhookTrigger } from '../common/webhooks';
import { leadSample } from './lead-sample';

export const leadUpdated = createAmoWebhookTrigger({
  name: 'lead_updated',
  displayName: 'Lead Updated',
  description: 'Triggers when a lead is updated.',
  aiMetadata: {
    description: 'Fires when an existing lead (deal) is updated in amoCRM, emitting the full lead record.',
  },
  events: ['update_lead'],
  payloadPath: 'leads.update',
  entityType: 'leads',
  sampleData: leadSample,
});
