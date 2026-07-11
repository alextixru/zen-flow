import { createAmoWebhookTrigger } from '../common/webhooks';
import { companySample } from './company-sample';

export const companyResponsibleChanged = createAmoWebhookTrigger({
  name: 'company_responsible_changed',
  displayName: 'Company Responsible User Changed',
  description: 'Triggers when the responsible user of a company changes.',
  aiMetadata: {
    description: 'Fires when the responsible user assigned to a company changes in amoCRM, emitting the full company record.',
  },
  events: ['responsible_company'],
  payloadPath: 'companies.responsible',
  entityType: 'companies',
  sampleData: companySample,
});
