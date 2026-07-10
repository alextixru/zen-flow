import { createAmoWebhookTrigger } from '../common/webhooks';
import { leadSample } from './lead-sample';

export const leadStatusChanged = createAmoWebhookTrigger({
  name: 'lead_status_changed',
  displayName: 'Lead Status Changed',
  description: 'Triggers when a lead moves to a different status or pipeline.',
  aiMetadata: {
    description: 'Fires when a lead (deal) changes its status or pipeline stage in amoCRM, emitting the full lead record.',
  },
  events: ['status_lead'],
  payloadPath: 'leads.status',
  entityType: 'leads',
  sampleData: leadSample,
});
