import { createAmoWebhookTrigger } from '../common/webhooks';
import { leadSample } from './lead-sample';

export const leadRestored = createAmoWebhookTrigger({
  name: 'lead_restored',
  displayName: 'Lead Restored',
  description: 'Triggers when a deleted lead is restored.',
  aiMetadata: {
    description: 'Fires when a previously deleted lead (deal) is restored in amoCRM, emitting the full lead record.',
  },
  events: ['restore_lead'],
  payloadPath: 'leads.restore',
  entityType: 'leads',
  sampleData: leadSample,
});
