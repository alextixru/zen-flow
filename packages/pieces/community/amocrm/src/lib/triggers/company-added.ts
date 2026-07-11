import { createAmoWebhookTrigger } from '../common/webhooks';
import { companySample } from './company-sample';

export const companyAdded = createAmoWebhookTrigger({
  name: 'company_added',
  displayName: 'Company Added',
  description: 'Triggers when a new company is created.',
  aiMetadata: {
    description: 'Fires when a new company is created in amoCRM, emitting the full company record.',
  },
  events: ['add_company'],
  payloadPath: 'companies.add',
  entityType: 'companies',
  sampleData: companySample,
});
