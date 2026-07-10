import { createAmoWebhookTrigger } from '../common/webhooks';

export const leadDeleted = createAmoWebhookTrigger({
  name: 'lead_deleted',
  displayName: 'Lead Deleted',
  description: 'Triggers when a lead is deleted.',
  aiMetadata: {
    description: 'Fires when a lead (deal) is deleted in amoCRM, emitting the deletion payload (the lead no longer exists to fetch).',
  },
  events: ['delete_lead'],
  payloadPath: 'leads.delete',
  entityType: 'leads',
  fetchFullRecord: false,
  sampleData: {
    id: 256988,
  },
});
