import { createAmoWebhookTrigger } from '../common/webhooks';
import { leadSample } from './lead-sample';

export const leadResponsibleChanged = createAmoWebhookTrigger({
  name: 'lead_responsible_changed',
  displayName: 'Lead Responsible User Changed',
  description: 'Triggers when the responsible user of a lead changes.',
  aiMetadata: {
    description: 'Fires when the responsible user assigned to a lead (deal) changes in amoCRM, emitting the full lead record.',
  },
  events: ['responsible_lead'],
  payloadPath: 'leads.responsible',
  entityType: 'leads',
  sampleData: leadSample,
});
