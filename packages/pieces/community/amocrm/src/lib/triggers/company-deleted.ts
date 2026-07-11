import { createAmoWebhookTrigger } from '../common/webhooks';

export const companyDeleted = createAmoWebhookTrigger({
  name: 'company_deleted',
  displayName: 'Company Deleted',
  description: 'Triggers when a company is deleted.',
  aiMetadata: {
    description: 'Fires when a company is deleted in amoCRM, emitting the deletion payload (the company no longer exists to fetch).',
  },
  events: ['delete_company'],
  payloadPath: 'companies.delete',
  entityType: 'companies',
  fetchFullRecord: false,
  sampleData: {
    id: 11812379,
  },
});
