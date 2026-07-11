import { createAmoWebhookTrigger } from '../common/webhooks';
import { companySample } from './company-sample';

export const companyUpdated = createAmoWebhookTrigger({
  name: 'company_updated',
  displayName: 'Company Updated',
  description: 'Triggers when a company is updated.',
  aiMetadata: {
    description: 'Fires when a company is updated in amoCRM, emitting the full company record.',
  },
  events: ['update_company'],
  payloadPath: 'companies.update',
  entityType: 'companies',
  sampleData: companySample,
});
